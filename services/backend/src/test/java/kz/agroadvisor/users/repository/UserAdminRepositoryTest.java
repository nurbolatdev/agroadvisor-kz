package kz.agroadvisor.users.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserAdminRepository.Row;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserAdminRepositoryTest {

    @Autowired
    private UserAdminRepository repository;
    @Autowired
    private UserRepository users;
    @Autowired
    private JdbcTemplate jdbc;

    /** Unique per run: the database is shared, so every query is narrowed to this token. */
    private String token;
    private final List<UUID> created = new ArrayList<>();
    private Long regionId;

    @BeforeEach
    void setUp() {
        // Letters only: a digit in the query would also match phone numbers
        StringBuilder letters = new StringBuilder("Zq");
        for (int i = 0; i < 8; i++) {
            letters.append((char) ('a' + ThreadLocalRandom.current().nextInt(26)));
        }
        token = letters.toString();
        regionId = jdbc.queryForObject("""
                INSERT INTO regions (code, names)
                VALUES (?, '{"ru": "Регион", "kk": "Аймақ", "en": "Region"}') RETURNING id""", Long.class,
                "uar_" + token);
    }

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
        jdbc.update("DELETE FROM regions WHERE id = ?", regionId);
    }

    private UUID user(String login, String name, Role... roles) {
        UUID id = users.saveAndFlush(new User(Login.parse(login), "x", name, "ru", Set.of(roles))).getId();
        created.add(id);
        return id;
    }

    private String phone() {
        return "+7705" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
    }

    private List<UUID> ids(List<Row> rows) {
        return rows.stream().map(Row::id).toList();
    }

    @Test
    void filtersByRoleAndLeavesAdministratorsOut() {
        UUID farmer = user(phone(), "Farmer " + token, Role.FARMER);
        UUID chemist = user(phone(), "Chemist " + token, Role.AGROCHEMIST);
        UUID admin = user(phone(), "Admin " + token, Role.ADMIN);
        UUID adminFarmer = user(phone(), "AdminFarmer " + token, Role.ADMIN, Role.FARMER);

        List<Row> all = repository.list(null, token, "ru", 50, 0);
        assertThat(ids(all)).containsExactlyInAnyOrder(farmer, chemist);
        assertThat(ids(repository.list("farmer", token, "ru", 50, 0))).containsExactly(farmer);
        assertThat(ids(repository.list("agrochemist", token, "ru", 50, 0))).containsExactly(chemist);
        assertThat(all).extracting(Row::role).containsExactlyInAnyOrder("farmer", "agrochemist");
        assertThat(ids(all)).doesNotContain(admin, adminFarmer);
    }

    @Test
    void searchesByNameEmailAndPhoneDigits() {
        String phone = phone();
        UUID byName = user(phone, "Ivan " + token, Role.FARMER);
        UUID byEmail = user("Mail." + token + "@Example.kz", "Plain", Role.FARMER);

        assertThat(ids(repository.list(null, token.toLowerCase(), "ru", 50, 0))).contains(byName);
        assertThat(ids(repository.list(null, "ivan " + token.toUpperCase(), "ru", 50, 0))).contains(byName);
        assertThat(ids(repository.list(null, "mail." + token.toLowerCase() + "@example", "ru", 50, 0)))
                .containsExactly(byEmail);

        String spaced = "+7 " + phone.substring(2, 5) + " " + phone.substring(5, 9);
        assertThat(ids(repository.list(null, spaced, "ru", 50, 0))).contains(byName);
        assertThat(ids(repository.list(null, "   ", "ru", 50, 0))).contains(byName, byEmail);
    }

    @Test
    void wildcardCharactersAreSearchedLiterally() {
        UUID percent = user(phone(), "A%B " + token, Role.FARMER);
        UUID underscore = user(phone(), "C_D " + token, Role.FARMER);
        UUID backslash = user(phone(), "E\\F " + token, Role.FARMER);
        user(phone(), "AxxB " + token, Role.FARMER);
        user(phone(), "CxD " + token, Role.FARMER);

        assertThat(ids(repository.list(null, "A%B " + token, "ru", 50, 0))).containsExactly(percent);
        assertThat(ids(repository.list(null, "C_D " + token, "ru", 50, 0))).containsExactly(underscore);
        assertThat(ids(repository.list(null, "E\\F " + token, "ru", 50, 0))).containsExactly(backslash);
    }

    @Test
    void countsOnlyTheUsersOwnDiagnoses() {
        UUID first = user(phone(), "First " + token, Role.FARMER);
        UUID second = user(phone(), "Second " + token, Role.FARMER);
        diagnosis(first);
        diagnosis(first);
        diagnosis(second);

        assertThat(repository.find(first, "ru")).get().extracting(Row::diagnosesCount).isEqualTo(2);
        assertThat(repository.find(second, "ru")).get().extracting(Row::diagnosesCount).isEqualTo(1);
        assertThat(repository.list(null, "Second " + token, "ru", 50, 0)).extracting(Row::diagnosesCount)
                .containsExactly(1);
    }

    private void diagnosis(UUID userId) {
        jdbc.update("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version)
                VALUES (?, 'potato', 'diagnoses/uar.jpg', 'ok', 'potato__x', 0.9, 'effnet-b0-v1', 1)""", userId);
    }

    @Test
    void regionNameFollowsTheLanguageAndIsNullWithoutRegion() {
        UUID withRegion = user(phone(), "Placed " + token, Role.FARMER);
        UUID without = user(phone(), "Nowhere " + token, Role.FARMER);
        jdbc.update("UPDATE users SET region_id = ? WHERE id = ?", regionId, withRegion);

        assertThat(repository.find(withRegion, "ru")).get().extracting(Row::region).isEqualTo("Регион");
        assertThat(repository.find(withRegion, "kk")).get().extracting(Row::region).isEqualTo("Аймақ");
        assertThat(repository.find(withRegion, "en")).get().extracting(Row::region).isEqualTo("Region");
        assertThat(repository.find(withRegion, "en")).get().extracting(Row::district).isNull();
        assertThat(repository.find(without, "en")).get().extracting(Row::region).isNull();
    }

    @Test
    void newestFirstAndPagesAreCut() {
        UUID oldest = user(phone(), "Page old " + token, Role.FARMER);
        UUID middle = user(phone(), "Page mid " + token, Role.FARMER);
        UUID newest = user(phone(), "Page new " + token, Role.FARMER);
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        setCreated(oldest, now.minus(3, ChronoUnit.DAYS));
        setCreated(middle, now.minus(2, ChronoUnit.DAYS));
        setCreated(newest, now.minus(1, ChronoUnit.DAYS));

        assertThat(ids(repository.list(null, token, "ru", 50, 0))).containsExactly(newest, middle, oldest);
        assertThat(ids(repository.list(null, token, "ru", 1, 0))).containsExactly(newest);
        assertThat(ids(repository.list(null, token, "ru", 1, 1))).containsExactly(middle);
        assertThat(ids(repository.list(null, token, "ru", 5, 2))).containsExactly(oldest);
        assertThat(repository.find(newest, "ru")).get().extracting(Row::registeredAt)
                .isEqualTo(now.minus(1, ChronoUnit.DAYS));
    }

    private void setCreated(UUID id, Instant at) {
        jdbc.update("UPDATE users SET created_at = ? WHERE id = ?", java.sql.Timestamp.from(at), id);
    }

    @Test
    void findIsEmptyForUnknownIdsAndAdministrators() {
        UUID admin = user(phone(), "Boss " + token, Role.ADMIN);

        assertThat(repository.find(UUID.randomUUID(), "ru")).isEmpty();
        assertThat(repository.find(admin, "ru")).isEmpty();
    }
}
