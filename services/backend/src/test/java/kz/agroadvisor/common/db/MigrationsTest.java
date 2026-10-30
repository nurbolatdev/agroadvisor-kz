package kz.agroadvisor.common.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/** Migrations run on an empty PostGIS database; each test rolls back its data. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class MigrationsTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void allMigrationsAreApplied() {
        List<String> versions = jdbc.queryForList(
                "SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank",
                String.class);
        assertThat(versions).containsExactly("1", "2", "3", "4", "5", "6", "7", "8", "9");
    }

    @Test
    void rolesAreSeeded() {
        assertThat(jdbc.queryForList("SELECT code FROM roles ORDER BY code", String.class))
                .containsExactly("admin", "agrochemist", "farmer");
    }

    @Test
    void userNeedsPhoneOrEmail() {
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO users (password_hash, full_name) VALUES ('x', 'No Contact')"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void userEmailIsUniqueIgnoringCase() {
        insertUser("+77010000001", "farmer@example.kz");
        assertThatThrownBy(() -> insertUser("+77010000002", "Farmer@Example.kz"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void userLanguageIsRuKkOrEn() {
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO users (phone, password_hash, full_name, language) VALUES ('+77010000003', 'x', 'U', 'kz')"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void translatedNamesNeedAllLanguages() {
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO crops (code, names) VALUES ('rice', '{\"ru\": \"Рис\", \"en\": \"Rice\"}')"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void agrochemistIsVerifiedOnlyWhenApproved() {
        UUID id = insertUser("+77010000004", null);
        jdbc.update("INSERT INTO agrochemist_profiles (user_id) VALUES (?)", id);
        assertThat(verified(id)).isFalse();

        jdbc.update("UPDATE agrochemist_profiles SET verification_status = 'approved' WHERE user_id = ?", id);
        assertThat(verified(id)).isTrue();
    }

    @Test
    void freePlanIncludesEveryFeatureWithoutLimit() {
        Integer features = jdbc.queryForObject("SELECT count(*) FROM feature", Integer.class);
        Integer unlimited = jdbc.queryForObject(
                "SELECT count(*) FROM plan_feature WHERE plan_code = 'FREE' AND daily_limit IS NULL",
                Integer.class);
        assertThat(features).isPositive();
        assertThat(unlimited).isEqualTo(features);
    }

    @Test
    void diagnosisKeepsClassCodeMissingFromCatalog() {
        UUID user = insertUser("+77010000005", null);
        insertCrop("tomato");

        insertDiagnosis(user, "ok", "tomato__brand_new_disease", null);

        assertThat(jdbc.queryForObject("SELECT top1_code FROM diagnoses WHERE user_id = ?", String.class, user))
                .isEqualTo("tomato__brand_new_disease");
    }

    @Test
    void cropMismatchNeedsDetectedCrop() {
        UUID user = insertUser("+77010000006", null);
        insertCrop("potato");

        assertThatThrownBy(() -> insertDiagnosis(user, "crop_mismatch", "potato__healthy", null))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void detectedCropIsOnlyForCropMismatch() {
        UUID user = insertUser("+77010000007", null);
        insertCrop("potato");

        assertThatThrownBy(() -> insertDiagnosis(user, "ok", "potato__healthy", "tomato"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void refreshTokensAreDeletedWithTheirUser() {
        UUID id = insertUser("+77010000008", null);
        insertRefreshToken(id, "a".repeat(64));

        jdbc.update("DELETE FROM users WHERE id = ?", id);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens", Integer.class)).isZero();
    }

    @Test
    void refreshTokenHashIsUnique() {
        UUID id = insertUser("+77010000009", null);
        insertRefreshToken(id, "b".repeat(64));

        assertThatThrownBy(() -> insertRefreshToken(id, "b".repeat(64)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void refreshTokenHashMustBeHex() {
        UUID id = insertUser("+77010000010", null);

        assertThatThrownBy(() -> insertRefreshToken(id, "z".repeat(64)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void insertRefreshToken(UUID user, String hash) {
        jdbc.update("""
                INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
                VALUES (?, gen_random_uuid(), ?, now() + interval '7 days')
                """, user, hash);
    }

    private UUID insertUser(String phone, String email) {
        return jdbc.queryForObject(
                "INSERT INTO users (phone, email, password_hash, full_name) VALUES (?, ?, 'x', 'Test') RETURNING id",
                UUID.class, phone, email);
    }

    private void insertCrop(String code) {
        // The crops are seeded by the catalog migrations, so the row may already exist
        jdbc.update("""
                INSERT INTO crops (code, names) VALUES (?, '{"ru": "-", "kk": "-", "en": "-"}')
                ON CONFLICT (code) DO NOTHING""", code);
    }

    private void insertDiagnosis(UUID user, String status, String top1, String detectedCrop) {
        String crop = top1.substring(0, top1.indexOf("__"));
        jdbc.update("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       detected_crop, model_version, classes_version)
                VALUES (?, ?, 'diagnoses/test.jpg', ?, ?, 0.9, ?, 'effnet-b0-v1', 1)
                """, user, crop, status, top1, detectedCrop);
    }

    private boolean verified(UUID id) {
        return jdbc.queryForObject("SELECT verified FROM agrochemist_profiles WHERE user_id = ?", Boolean.class, id);
    }
}
