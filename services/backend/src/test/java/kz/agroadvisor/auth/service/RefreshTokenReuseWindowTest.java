package kz.agroadvisor.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.config.JwtProperties;
import kz.agroadvisor.auth.config.RefreshRotationProperties;
import kz.agroadvisor.common.web.ApiException;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RefreshTokenReuseWindowTest {

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private JwtProperties jwt;
    @Autowired
    private AuthService authService;

    private final List<UUID> users = new ArrayList<>();

    private RefreshTokenService service(Duration window) {
        return new RefreshTokenService(jdbc, jwt, new RefreshRotationProperties(window));
    }

    private UUID newUser() {
        String email = "window-" + UUID.randomUUID() + "@example.kz";
        UUID id = jdbc.queryForObject(
                "INSERT INTO users (email, password_hash, full_name) VALUES (?, 'x', 'Window') RETURNING id",
                UUID.class, email);
        users.add(id);
        return id;
    }

    /** The database is shared: other tests count all rows of the table, so nothing may be left behind. */
    @AfterEach
    void removeUsers() {
        users.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    /** Inserts a row; {@code usedAgoSeconds} null means unused; {@code expiresInDays} may be negative. */
    private String insert(UUID user, UUID family, Integer usedAgoSeconds, int expiresInDays) {
        String raw = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, used_at, created_at)
                VALUES (?, ?, ?, now() + make_interval(days => ?),
                        CASE WHEN ?::int IS NULL THEN NULL ELSE now() - make_interval(secs => ?::int) END,
                        now() - interval '30 days')
                """, user, family, RefreshTokenService.hash(raw), expiresInDays, usedAgoSeconds, usedAgoSeconds);
        return raw;
    }

    private int rows(UUID family) {
        return jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE family_id = ?", Integer.class, family);
    }

    private int revoked(UUID family) {
        return jdbc.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE family_id = ? AND revoked_at IS NOT NULL",
                Integer.class, family);
    }

    private static void assertCode(Throwable e, String code) {
        assertThat(e).isInstanceOfSatisfying(ApiException.class, a -> assertThat(a.getCode()).isEqualTo(code));
    }

    @Test
    void aTokenUsedNineSecondsAgoIsReplayedIntoTheSameFamily() {
        UUID user = newUser();
        UUID family = UUID.randomUUID();
        String old = insert(user, family, 9, 5);
        insert(user, family, null, 7);

        RefreshTokenService.Rotation rotation = service(Duration.ofSeconds(10)).rotate(old);

        assertThat(rotation.userId()).isEqualTo(user);
        assertThat(rotation.refreshToken()).isNotEqualTo(old);
        assertThat(rows(family)).isEqualTo(3);
        assertThat(revoked(family)).isZero();
    }

    @Test
    void aTokenUsedElevenSecondsAgoRevokesTheFamily() {
        UUID user = newUser();
        UUID family = UUID.randomUUID();
        String old = insert(user, family, 11, 5);
        insert(user, family, null, 7);

        assertThatThrownBy(() -> service(Duration.ofSeconds(10)).rotate(old))
                .satisfies(e -> assertCode(e, RefreshTokenService.REUSED));

        assertThat(rows(family)).isEqualTo(2);
        assertThat(revoked(family)).isEqualTo(2);
    }

    @Test
    void aZeroWindowIsStrict() {
        UUID user = newUser();
        UUID family = UUID.randomUUID();
        String old = insert(user, family, 1, 5);
        insert(user, family, null, 7);

        assertThatThrownBy(() -> service(Duration.ZERO).rotate(old))
                .satisfies(e -> assertCode(e, RefreshTokenService.REUSED));

        assertThat(rows(family)).isEqualTo(2);
        assertThat(revoked(family)).isEqualTo(2);
    }

    @Test
    void aRevokedTokenIsNotRevivedInsideTheWindowAfterLogout() {
        UUID user = newUser();
        UUID family = UUID.randomUUID();
        String old = insert(user, family, 2, 5);
        String child = insert(user, family, null, 7);
        RefreshTokenService tokens = service(Duration.ofSeconds(10));

        tokens.revokeFamilyOf(child);

        assertThatThrownBy(() -> tokens.rotate(old)).satisfies(e -> assertCode(e, RefreshTokenService.INVALID));
        assertThat(rows(family)).isEqualTo(2);
        assertThat(revoked(family)).isEqualTo(2);
    }

    @Test
    void aRevokedTokenIsNotRevivedInsideTheWindowAfterLogoutAll() {
        UUID user = newUser();
        UUID family = UUID.randomUUID();
        String old = insert(user, family, 2, 5);
        insert(user, family, null, 7);
        RefreshTokenService tokens = service(Duration.ofSeconds(10));

        tokens.revokeAll(user);

        assertThatThrownBy(() -> tokens.rotate(old)).satisfies(e -> assertCode(e, RefreshTokenService.INVALID));
        assertThat(rows(family)).isEqualTo(2);
        assertThat(revoked(family)).isEqualTo(2);
    }

    @Test
    void anExpiredTokenIsNotRevivedInsideTheWindow() {
        UUID user = newUser();
        UUID family = UUID.randomUUID();
        String old = insert(user, family, 2, -1);
        insert(user, family, null, 7);

        assertThatThrownBy(() -> service(Duration.ofSeconds(10)).rotate(old))
                .satisfies(e -> assertCode(e, RefreshTokenService.INVALID));

        assertThat(rows(family)).isEqualTo(2);
        assertThat(revoked(family)).isZero();
    }

    @Test
    void aBlockedUserReplayingInsideTheWindowIsRefusedAndSignedOut() {
        UUID user = newUser();
        UUID family = UUID.randomUUID();
        String old = insert(user, family, 2, 5);
        insert(user, family, null, 7);
        jdbc.update("UPDATE users SET status = 'blocked' WHERE id = ?", user);

        assertThatThrownBy(() -> authService.refresh(old))
                .satisfies(e -> assertCode(e, AuthService.ACCOUNT_BLOCKED));

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL",
                Integer.class, user)).isZero();
    }

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(PropertiesConfig.class);

    @EnableConfigurationProperties(RefreshRotationProperties.class)
    static class PropertiesConfig {
    }

    @Test
    void theDefaultWindowIsTenSeconds() {
        runner.run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx.getBean(RefreshRotationProperties.class).refreshReuseWindow())
                    .isEqualTo(Duration.ofSeconds(10));
        });
    }

    @Test
    void aNegativeOrTooLongWindowStopsTheStartup() {
        for (String ok : new String[] {"0s", "60s"}) {
            runner.withPropertyValues("app.security.refresh-reuse-window=" + ok)
                    .run(ctx -> assertThat(ctx).as(ok).hasNotFailed());
        }
        for (String bad : new String[] {"-1s", "61s"}) {
            runner.withPropertyValues("app.security.refresh-reuse-window=" + bad)
                    .run(ctx -> assertThat(ctx).as(bad).hasFailed());
        }
    }
}
