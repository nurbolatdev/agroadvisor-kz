package kz.agroadvisor.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * A rotation and a logout of the same user must not interleave. The first one is held open inside its
 * transaction while the second one starts; the second has to wait for it and then see its rows. Without the lock
 * a logout revoked only the rows it could see, and the token a parallel rotation was inserting stayed alive.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RefreshTokenLogoutRaceTest {

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private RefreshTokenService service;
    @Autowired
    private TransactionTemplate tx;

    private final ExecutorService pool = Executors.newFixedThreadPool(2);
    private UUID user;
    private UUID family;
    private String token;

    @BeforeEach
    void seed() {
        user = jdbc.queryForObject(
                "INSERT INTO users (email, password_hash, full_name) VALUES (?, 'x', 'Race') RETURNING id",
                UUID.class, "race-" + UUID.randomUUID() + "@example.kz");
        family = UUID.randomUUID();
        token = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
                VALUES (?, ?, ?, now() + interval '7 days')
                """, user, family, RefreshTokenService.hash(token));
    }

    /** The database is shared: other tests count the rows of the table, so nothing may be left behind. */
    @AfterEach
    void clean() {
        pool.shutdownNow();
        jdbc.update("DELETE FROM users WHERE id = ?", user);
    }

    private int live() {
        return jdbc.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL", Integer.class, user);
    }

    /**
     * Runs {@code first} inside a transaction that stays open until {@code second} has been started and has had
     * time to run into the lock, then commits it and waits for {@code second}.
     */
    private void interleave(Runnable first, Runnable second) throws Exception {
        CountDownLatch firstDone = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        Future<?> a = pool.submit(() -> tx.executeWithoutResult(status -> {
            first.run();
            firstDone.countDown();
            try {
                commit.await(15, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }));
        assertThat(firstDone.await(15, TimeUnit.SECONDS)).isTrue();

        Future<?> b = pool.submit(second);
        waitUntilSomeoneWaitsForALock();
        assertThat(b.isDone()).as("the second call waits for the first one").isFalse();

        commit.countDown();
        a.get(15, TimeUnit.SECONDS);
        try {
            b.get(15, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            throw e.getCause() instanceof RuntimeException r ? r : e;
        }
    }

    /** The second call is blocked when the database shows a session waiting for a lock (advisory or row). */
    private void waitUntilSomeoneWaitsForALock() throws InterruptedException {
        for (int i = 0; i < 200; i++) {
            Integer waiting = jdbc.queryForObject("""
                    SELECT count(*) FROM pg_stat_activity
                    WHERE datname = current_database() AND wait_event_type = 'Lock'
                    """, Integer.class);
            if (waiting != null && waiting > 0) {
                return;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("the second call never waited for a lock");
    }

    @Test
    void aLogoutDuringARotationAlsoRevokesTheNewToken() throws Exception {
        interleave(() -> service.rotate(token), () -> service.revokeFamilyOf(token));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE family_id = ?", Integer.class,
                family)).isEqualTo(2);
        assertThat(live()).as("nothing is left alive after the logout").isZero();
    }

    @Test
    void aLogoutOfAllDevicesDuringARotationAlsoRevokesTheNewToken() throws Exception {
        interleave(() -> service.rotate(token), () -> service.revokeAll(user));

        assertThat(live()).isZero();
    }

    /** The order "logout, then rotation" was right before the lock too: this guards it, it does not prove the fix. */
    @Test
    void aRotationDuringALogoutIsRefused() {
        assertThatThrownBy(() -> interleave(() -> service.revokeFamilyOf(token), () -> service.rotate(token)))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo(RefreshTokenService.INVALID));

        assertThat(live()).isZero();
    }
}
