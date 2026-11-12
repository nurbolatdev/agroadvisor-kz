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
        assertThat(versions).containsExactly("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13",
                "14", "15", "16", "17", "18");
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

    @Test
    void agrochemistDocumentNeedsAKnownContentType() {
        UUID id = insertUser("+77010000011", null);
        jdbc.update("INSERT INTO agrochemist_profiles (user_id) VALUES (?)", id);
        insertDocument(id, "application/pdf", 10);

        assertThatThrownBy(() -> insertDocument(id, "text/html", 10)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void agrochemistDocumentNeedsAPositiveSize() {
        UUID id = insertUser("+77010000012", null);
        jdbc.update("INSERT INTO agrochemist_profiles (user_id) VALUES (?)", id);

        assertThatThrownBy(() -> insertDocument(id, "image/png", 0)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void severalPeopleMayReviewOneDiagnosisButEachOnlyOnce() {
        UUID farmer = insertUser("+77010000021", null);
        UUID first = insertUser("+77010000022", null);
        UUID second = insertUser("+77010000023", null);
        UUID diagnosis = insertDiagnosis(farmer, "ok", "potato__late_blight", null);

        insertReview(diagnosis, first, "confirmed", "potato__late_blight");
        insertReview(diagnosis, second, "corrected", "potato__early_blight");

        assertThatThrownBy(() -> insertReview(diagnosis, first, "unclear", null))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void reviewNeedsTheRightClassUnlessUnclear() {
        UUID farmer = insertUser("+77010000024", null);
        UUID reviewer = insertUser("+77010000025", null);
        UUID diagnosis = insertDiagnosis(farmer, "ok", "potato__late_blight", null);

        assertThatThrownBy(() -> insertReview(diagnosis, reviewer, "confirmed", null))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void unclearReviewHasNoClass() {
        UUID farmer = insertUser("+77010000026", null);
        UUID reviewer = insertUser("+77010000027", null);
        UUID diagnosis = insertDiagnosis(farmer, "ok", "potato__late_blight", null);

        assertThatThrownBy(() -> insertReview(diagnosis, reviewer, "unclear", "potato__healthy"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void reviewVerdictIsConfirmedCorrectedOrUnclear() {
        UUID farmer = insertUser("+77010000028", null);
        UUID reviewer = insertUser("+77010000029", null);
        UUID diagnosis = insertDiagnosis(farmer, "ok", "potato__late_blight", null);

        assertThatThrownBy(() -> insertReview(diagnosis, reviewer, "maybe", "potato__late_blight"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void reviewClassIsNotBlank() {
        UUID farmer = insertUser("+77010000034", null);
        UUID reviewer = insertUser("+77010000035", null);
        UUID diagnosis = insertDiagnosis(farmer, "ok", "potato__late_blight", null);

        assertThatThrownBy(() -> insertReview(diagnosis, reviewer, "corrected", ""))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void reviewClassHasNoSurroundingSpaces() {
        UUID farmer = insertUser("+77010000039", null);
        UUID reviewer = insertUser("+77010000040", null);
        UUID diagnosis = insertDiagnosis(farmer, "ok", "potato__late_blight", null);

        assertThatThrownBy(() -> insertReview(diagnosis, reviewer, "corrected", " potato__healthy"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void reviewCommentIsAtMost2000Characters() {
        UUID farmer = insertUser("+77010000036", null);
        UUID reviewer = insertUser("+77010000037", null);
        UUID diagnosis = insertDiagnosis(farmer, "ok", "potato__late_blight", null);

        jdbc.update("INSERT INTO diagnosis_reviews (diagnosis_id, reviewer_id, verdict, comment) "
                + "VALUES (?, ?, 'unclear', ?)", diagnosis, reviewer, "x".repeat(2000));
        UUID other = insertUser("+77010000038", null);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO diagnosis_reviews (diagnosis_id, reviewer_id, verdict, "
                + "comment) VALUES (?, ?, 'unclear', ?)", diagnosis, other, "x".repeat(2001)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void diagnosesAreIndexedByRegionAndTime() {
        assertThat(jdbc.queryForList(
                "SELECT indexname FROM pg_indexes WHERE tablename = 'diagnoses' AND indexname = ?",
                String.class, "diagnoses_region_id_created_at_idx")).hasSize(1);
    }

    @Test
    void reviewsAreDeletedWithTheirDiagnosis() {
        UUID farmer = insertUser("+77010000030", null);
        UUID reviewer = insertUser("+77010000031", null);
        UUID diagnosis = insertDiagnosis(farmer, "ok", "potato__late_blight", null);
        insertReview(diagnosis, reviewer, "confirmed", "potato__late_blight");

        jdbc.update("DELETE FROM diagnoses WHERE id = ?", diagnosis);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM diagnosis_reviews", Integer.class)).isZero();
    }

    @Test
    void aReviewerWhoGaveAVerdictCannotBeDeleted() {
        UUID farmer = insertUser("+77010000032", null);
        UUID reviewer = insertUser("+77010000033", null);
        insertReview(insertDiagnosis(farmer, "ok", "potato__late_blight", null), reviewer, "unclear", null);

        assertThatThrownBy(() -> jdbc.update("DELETE FROM users WHERE id = ?", reviewer))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void agrochemistCannotBeAddedToAFarmer() {
        UUID id = insertUser("+77010000011", null);
        addRole(id, "farmer");
        assertThatThrownBy(() -> addRole(id, "agrochemist"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("user_roles_one_of_farmer_agrochemist");
    }

    @Test
    void farmerCannotBeAddedToAnAgrochemist() {
        UUID id = insertUser("+77010000012", null);
        addRole(id, "agrochemist");
        assertThatThrownBy(() -> addRole(id, "farmer"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("user_roles_one_of_farmer_agrochemist");
    }

    @Test
    void roleCannotBeChangedIntoTheForbiddenPair() {
        UUID id = insertUser("+77010000013", null);
        addRole(id, "farmer");
        addRole(id, "admin");
        assertThatThrownBy(() -> jdbc.update(
                "UPDATE user_roles SET role_code = 'agrochemist' WHERE user_id = ? AND role_code = 'admin'", id))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void theOnlyRoleCanBeChanged() {
        UUID id = insertUser("+77010000016", null);
        addRole(id, "farmer");
        jdbc.update("UPDATE user_roles SET role_code = 'agrochemist' WHERE user_id = ?", id);
        assertThat(jdbc.queryForList("SELECT role_code FROM user_roles WHERE user_id = ?", String.class, id))
                .containsExactly("agrochemist");
    }

    @Test
    void administratorMayHoldAnotherRole() {
        UUID farmer = insertUser("+77010000014", null);
        addRole(farmer, "farmer");
        addRole(farmer, "admin");
        UUID agrochemist = insertUser("+77010000015", null);
        addRole(agrochemist, "agrochemist");
        addRole(agrochemist, "admin");

        assertThat(jdbc.queryForList("SELECT role_code FROM user_roles WHERE user_id = ? ORDER BY 1",
                String.class, farmer)).containsExactly("admin", "farmer");
        assertThat(jdbc.queryForList("SELECT role_code FROM user_roles WHERE user_id = ? ORDER BY 1",
                String.class, agrochemist)).containsExactly("admin", "agrochemist");
    }

    private void addRole(UUID user, String role) {
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, ?)", user, role);
    }

    private void insertDocument(UUID user, String contentType, int size) {
        jdbc.update("""
                INSERT INTO agrochemist_documents (user_id, kind, object_key, content_type, size_bytes)
                VALUES (?, 'diploma', 'agrochemist-documents/x/' || gen_random_uuid(), ?, ?)
                """, user, contentType, size);
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

    private UUID insertDiagnosis(UUID user, String status, String top1, String detectedCrop) {
        String crop = top1.substring(0, top1.indexOf("__"));
        return jdbc.queryForObject("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       detected_crop, model_version, classes_version)
                VALUES (?, ?, 'diagnoses/test.jpg', ?, ?, 0.9, ?, 'effnet-b0-v1', 1)
                RETURNING id
                """, UUID.class, user, crop, status, top1, detectedCrop);
    }

    private void insertReview(UUID diagnosis, UUID reviewer, String verdict, String correctCode) {
        jdbc.update("INSERT INTO diagnosis_reviews (diagnosis_id, reviewer_id, verdict, correct_code) "
                + "VALUES (?, ?, ?, ?)", diagnosis, reviewer, verdict, correctCode);
    }

    private boolean verified(UUID id) {
        return jdbc.queryForObject("SELECT verified FROM agrochemist_profiles WHERE user_id = ?", Boolean.class, id);
    }
}
