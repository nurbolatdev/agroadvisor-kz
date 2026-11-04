package kz.agroadvisor.diagnosis.repository;

import java.time.Duration;
import java.util.Set;
import java.util.UUID;

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
import kz.agroadvisor.users.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DiagnosisClaimsTest {

    private static final Duration TIMEOUT = Duration.ofSeconds(90);
    private static final String HASH = "a".repeat(64);
    private static final String OTHER_HASH = "b".repeat(64);
    private static final String KEY = "key-claims-0001";

    @Autowired
    DiagnosisClaims claims;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    UserRepository users;

    private UUID userId;

    @BeforeEach
    void newUser() {
        String phone = "+7705" + (1_000_000 + (int) (Math.random() * 8_999_999));
        userId = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER))).getId();
    }

    private void age(Duration age) {
        jdbc.update("UPDATE diagnosis_requests SET started_at = now() - make_interval(secs => ?) "
                + "WHERE user_id = ? AND idempotency_key = ?", age.toSeconds(), userId, KEY);
    }

    @Test
    void theFirstClaimWinsAndTheSecondGetsNothing() {
        assertThat(claims.tryClaim(userId, KEY, HASH, "tomato")).isPresent();
        assertThat(claims.tryClaim(userId, KEY, HASH, "tomato")).isEmpty();
    }

    @Test
    void aFreshClaimIsNotExpiredAndAnOldOneIs() {
        claims.tryClaim(userId, KEY, HASH, "tomato");
        assertThat(claims.find(userId, KEY, TIMEOUT)).hasValueSatisfying(c -> {
            assertThat(c.expired()).isFalse();
            assertThat(c.requestFingerprint()).isEqualTo(HASH);
            assertThat(c.cropCode()).isEqualTo("tomato");
        });

        age(Duration.ofSeconds(91));

        assertThat(claims.find(userId, KEY, TIMEOUT)).hasValueSatisfying(c -> assertThat(c.expired()).isTrue());
    }

    @Test
    void aFreshClaimCannotBeTakenOver() {
        UUID owner = claims.tryClaim(userId, KEY, HASH, "tomato").orElseThrow();

        assertThat(claims.takeOver(userId, KEY, HASH, "tomato", TIMEOUT)).isEmpty();

        assertThat(claims.release(userId, KEY, owner)).isEqualTo(1);
    }

    @Test
    void anExpiredClaimIsTakenOverWithANewTokenAndTheOldTokenStopsWorking() {
        UUID oldOwner = claims.tryClaim(userId, KEY, HASH, "tomato").orElseThrow();
        age(Duration.ofMinutes(5));

        UUID newOwner = claims.takeOver(userId, KEY, HASH, "tomato", TIMEOUT).orElseThrow();

        assertThat(newOwner).isNotEqualTo(oldOwner);
        assertThat(claims.release(userId, KEY, oldOwner)).isZero(); // fenced off
        assertThat(claims.find(userId, KEY, TIMEOUT)).hasValueSatisfying(c -> assertThat(c.expired()).isFalse());
        assertThat(claims.release(userId, KEY, newOwner)).isEqualTo(1);
    }

    @Test
    void anExpiredClaimIsNotTakenOverByAnotherFingerprintOrCrop() {
        claims.tryClaim(userId, KEY, HASH, "tomato");
        age(Duration.ofMinutes(5));

        assertThat(claims.takeOver(userId, KEY, OTHER_HASH, "tomato", TIMEOUT)).isEmpty();
        assertThat(claims.takeOver(userId, KEY, HASH, "potato", TIMEOUT)).isEmpty();
        assertThat(claims.find(userId, KEY, TIMEOUT)).hasValueSatisfying(c -> {
            assertThat(c.requestFingerprint()).isEqualTo(HASH);
            assertThat(c.expired()).isTrue(); // untouched
        });
    }

    @Test
    void onlyOneOfManyTakeoversOfTheSameExpiredClaimWins() throws Exception {
        claims.tryClaim(userId, KEY, HASH, "tomato");
        age(Duration.ofMinutes(5));

        var pool = java.util.concurrent.Executors.newFixedThreadPool(8);
        try {
            var results = new java.util.ArrayList<java.util.concurrent.Future<Boolean>>();
            var start = new java.util.concurrent.CountDownLatch(1);
            for (int i = 0; i < 8; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return claims.takeOver(userId, KEY, HASH, "tomato", TIMEOUT).isPresent();
                }));
            }
            start.countDown();
            long winners = 0;
            for (var r : results) {
                winners += r.get() ? 1 : 0;
            }
            assertThat(winners).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void cleanupRemovesOnlyOldClaims() {
        claims.tryClaim(userId, KEY, HASH, "tomato");
        claims.tryClaim(userId, "key-claims-0002", HASH, "tomato");
        jdbc.update("UPDATE diagnosis_requests SET started_at = now() - interval '2 hours' "
                + "WHERE user_id = ? AND idempotency_key = ?", userId, "key-claims-0002");

        claims.deleteOlderThan(Duration.ofHours(1));

        assertThat(claims.find(userId, KEY, TIMEOUT)).isPresent();
        assertThat(claims.find(userId, "key-claims-0002", TIMEOUT)).isEmpty();
    }
}
