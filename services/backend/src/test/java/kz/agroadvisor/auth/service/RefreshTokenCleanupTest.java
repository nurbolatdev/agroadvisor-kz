package kz.agroadvisor.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.config.RefreshCleanupProperties;
import kz.agroadvisor.common.web.ApiException;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RefreshTokenCleanupTest {

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private RefreshTokenService tokens;
    @Autowired
    private ApplicationContext context;

    private final List<UUID> users = new ArrayList<>();

    private UUID newUser() {
        String email = "cleanup-" + UUID.randomUUID() + "@example.kz";
        UUID id = jdbc.queryForObject(
                "INSERT INTO users (email, password_hash, full_name) VALUES (?, 'x', 'Cleanup') RETURNING id",
                UUID.class, email);
        users.add(id);
        return id;
    }

    /** The database is shared: other tests count all rows of the table, so nothing may be left behind. */
    @AfterEach
    void removeUsers() {
        users.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    /** Inserts a row that expires {@code expiresAgoDays} ago (negative: in the future); returns its raw token. */
    private String insert(UUID user, UUID family, int expiresAgoDays, boolean used) {
        String raw = UUID.randomUUID().toString();
        // a used row is used an hour ago: outside the reuse window, so a replay still revokes the family
        jdbc.update("""
                INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, used_at, created_at)
                VALUES (?, ?, ?, now() - make_interval(days => ?), CASE WHEN ? THEN now() - interval '1 hour' END,
                        now() - make_interval(days => ?))
                """, user, family, RefreshTokenService.hash(raw), expiresAgoDays, used, expiresAgoDays + 30);
        return raw;
    }

    private int count(UUID user) {
        return jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE user_id = ?", Integer.class, user);
    }

    @Test
    void removesRowsExpiredLongAgoInBatchesAndKeepsTheRest() {
        UUID user = newUser();
        UUID family = UUID.randomUUID();
        for (int i = 0; i < 5; i++) {
            insert(user, UUID.randomUUID(), 8, i % 2 == 0);
        }
        insert(user, UUID.randomUUID(), 1, false); // expired, but inside the retention
        insert(user, family, -3, false); // live
        String usedRaw = insert(user, family, -2, true); // used row of a live family

        RefreshTokenCleanup job = new RefreshTokenCleanup(tokens,
                new RefreshCleanupProperties(true, "0 0 4 * * *", Duration.ofDays(7), 2));

        assertThat(job.run()).isGreaterThanOrEqualTo(5);
        assertThat(count(user)).isEqualTo(3);

        assertThatThrownBy(() -> tokens.rotate(usedRaw)).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo(RefreshTokenService.REUSED));
    }

    @Test
    void theJobIsNotCreatedInTheTestProfile() {
        assertThat(context.getBeanProvider(RefreshTokenCleanup.class).getIfAvailable()).isNull();
    }

    @Test
    void aFailureIsLoggedAndNotThrown() {
        RefreshTokenService broken = mock(RefreshTokenService.class);
        when(broken.deleteExpired(any(), anyInt())).thenThrow(new IllegalStateException("database is down"));
        RefreshTokenCleanup job = new RefreshTokenCleanup(broken,
                new RefreshCleanupProperties(true, "0 0 4 * * *", Duration.ofDays(7), 10));

        assertThat(job.run()).isZero();
    }

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(PropertiesConfig.class);

    @EnableConfigurationProperties(RefreshCleanupProperties.class)
    static class PropertiesConfig {
    }

    @Test
    void theDefaultsAreSevenDaysAndBatchesOfAThousand() {
        runner.run(ctx -> {
            assertThat(ctx).hasNotFailed();
            RefreshCleanupProperties p = ctx.getBean(RefreshCleanupProperties.class);
            assertThat(p.enabled()).isTrue();
            assertThat(p.cron()).isEqualTo("0 0 4 * * *");
            assertThat(p.retention()).isEqualTo(Duration.ofDays(7));
            assertThat(p.batchSize()).isEqualTo(1000);
        });
    }

    @Test
    void invalidValuesStopTheStartup() {
        for (String bad : new String[] {"cron=not-a-cron", "retention=0s", "batch-size=0", "batch-size=10001"}) {
            runner.withPropertyValues("app.security.refresh-cleanup." + bad)
                    .run(ctx -> assertThat(ctx).as(bad).hasFailed());
        }
    }
}
