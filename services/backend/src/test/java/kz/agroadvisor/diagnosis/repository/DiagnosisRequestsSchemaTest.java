package kz.agroadvisor.diagnosis.repository;

import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** V14: the claim table that lets one request per Idempotency-Key reach the model. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DiagnosisRequestsSchemaTest {

    private static final String HASH = "a".repeat(64);
    private static final String INSERT = "INSERT INTO diagnosis_requests "
            + "(user_id, idempotency_key, request_fingerprint, crop_code, claim_id) VALUES (?, ?, ?, ?, ?)";
    private static final String CLAIM = "INSERT INTO diagnosis_requests "
            + "(user_id, idempotency_key, request_fingerprint, crop_code, claim_id) VALUES (?, ?, ?, ?, ?) "
            + "ON CONFLICT (user_id, idempotency_key) DO NOTHING";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    UserRepository users;

    private User user;

    @BeforeEach
    void newUser() {
        String phone = "+7705" + (1_000_000 + (int) (Math.random() * 8_999_999));
        user = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER)));
    }

    @Test
    void onlyTheFirstClaimOfAKeyGetsIn() {
        int first = jdbc.update(CLAIM, user.getId(), "key-0001-aaaa", HASH, "tomato", UUID.randomUUID());
        int second = jdbc.update(CLAIM, user.getId(), "key-0001-aaaa", HASH, "tomato", UUID.randomUUID());

        assertThat(first).isEqualTo(1);
        assertThat(second).isZero();
    }

    @Test
    void theSameKeyOfAnotherUserIsAnotherClaim() {
        User other = users.saveAndFlush(new User(Login.parse("+7706" + (1_000_000 + (int) (Math.random() * 8_999_999))),
                "x", "Farmer", "ru", Set.of(Role.FARMER)));

        assertThat(jdbc.update(CLAIM, user.getId(), "key-0002-aaaa", HASH, "tomato", UUID.randomUUID())).isEqualTo(1);
        assertThat(jdbc.update(CLAIM, other.getId(), "key-0002-aaaa", HASH, "tomato", UUID.randomUUID())).isEqualTo(1);
    }

    @Test
    void aFingerprintThatIsNotLowerCaseHexIsRefused() {
        assertThatThrownBy(() -> jdbc.update(INSERT, user.getId(), "key-0003-aaaa", "A".repeat(64), "tomato",
                UUID.randomUUID())).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(INSERT, user.getId(), "key-0003-aaaa", "abc", "tomato",
                UUID.randomUUID())).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void anUnknownCropIsRefused() {
        assertThatThrownBy(() -> jdbc.update(INSERT, user.getId(), "key-0004-aaaa", HASH, "banana",
                UUID.randomUUID())).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void startedAtIsSetByTheDatabase() {
        jdbc.update(INSERT, user.getId(), "key-0005-aaaa", HASH, "tomato", UUID.randomUUID());

        Boolean recent = jdbc.queryForObject("SELECT started_at > now() - interval '1 minute' "
                + "FROM diagnosis_requests WHERE user_id = ? AND idempotency_key = ?", Boolean.class, user.getId(),
                "key-0005-aaaa");
        assertThat(recent).isTrue();
    }

    @Test
    void deletingTheUserDeletesItsClaims() {
        jdbc.update(INSERT, user.getId(), "key-0006-aaaa", HASH, "tomato", UUID.randomUUID());

        jdbc.update("DELETE FROM users WHERE id = ?", user.getId());

        assertThat(jdbc.queryForObject("SELECT count(*) FROM diagnosis_requests WHERE user_id = ?", Long.class,
                user.getId())).isZero();
    }
}
