package kz.agroadvisor.auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.auth.config.JwtProperties;
import kz.agroadvisor.auth.config.RefreshRotationProperties;
import kz.agroadvisor.common.web.ApiException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Opaque refresh tokens with rotation. Only the SHA-256 of a token is stored.
 *
 * <p>Every successful refresh marks the presented token as used and issues a new one in the same
 * family (one login on one device). The state change is a single conditional {@code UPDATE}, so of two
 * parallel refreshes with the same token only one rotates normally. A token presented again within the reuse
 * window after its first use (a lost response on a bad network, or a parallel duplicate) is replayed: it gets a
 * new token in the same family, because only hashes are stored and the first successor cannot be returned
 * again. Later reuse is treated as theft: the whole family is revoked. Revoked and expired rows are never
 * revived. A window of zero means strict rotation. Time comes from the database ({@code used_at} and the window
 * check both use {@code now()}), so clock skew between the application and the database cannot matter.
 */
@Service
@EnableConfigurationProperties(RefreshRotationProperties.class)
public class RefreshTokenService {

    public static final String INVALID = "invalid_refresh_token";
    public static final String REUSED = "refresh_token_reused";

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final JwtProperties properties;
    private final Duration reuseWindow;

    public RefreshTokenService(JdbcTemplate jdbc, JwtProperties properties, RefreshRotationProperties rotation) {
        this.jdbc = jdbc;
        this.properties = properties;
        this.reuseWindow = rotation.refreshReuseWindow();
    }

    /** Starts a new family (a new login) and returns the raw token. */
    @Transactional
    public String startSession(UUID userId) {
        return issue(userId, UUID.randomUUID());
    }

    /** Result of a rotation: the owner of the old token and the new raw token. */
    public record Rotation(UUID userId, String refreshToken) {
    }

    /**
     * Exchanges a refresh token for a new one. A token that was used less than the reuse window ago and is still
     * live (not revoked, not expired) is replayed: it gets a new token in the same family and nothing is revoked.
     * The failure paths must commit their changes (revoking the family), so this method does not roll back on
     * {@link ApiException}.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public Rotation rotate(String rawToken) {
        String hash = hash(rawToken);
        lockOwnerOf(hash);
        List<UUID[]> used = jdbc.query("""
                UPDATE refresh_tokens SET used_at = now()
                WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
                RETURNING user_id, family_id
                """, (rs, i) -> new UUID[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)}, hash);
        if (used.isEmpty()) {
            return replayOrReject(hash);
        }
        UUID userId = used.get(0)[0];
        UUID familyId = used.get(0)[1];
        return new Rotation(userId, issue(userId, familyId));
    }

    /** Logout of one device: revokes the family of the presented token. Unknown tokens are ignored. */
    @Transactional
    public void revokeFamilyOf(String rawToken) {
        String hash = hash(rawToken);
        lockOwnerOf(hash);
        jdbc.update("""
                UPDATE refresh_tokens SET revoked_at = now()
                WHERE revoked_at IS NULL
                  AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = ?)
                """, hash);
    }

    /** Logout everywhere, also used when a user is blocked. */
    @Transactional
    public void revokeAll(UUID userId) {
        lock(userId);
        jdbc.update("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL", userId);
    }

    /**
     * Deletes up to {@code limit} rows that expired more than {@code retention} ago and returns how many went.
     * Used and revoked rows are not deleted earlier on purpose: reuse detection needs the used row to exist, so a
     * replayed old token keeps revoking its family until the row expires. Every revoked row expires too, so
     * nothing stays forever. The query walks {@code refresh_tokens_expires_at_idx}.
     */
    @Transactional
    public int deleteExpired(Duration retention, int limit) {
        return jdbc.update("""
                DELETE FROM refresh_tokens WHERE id IN (
                    SELECT id FROM refresh_tokens
                    WHERE expires_at < now() - make_interval(secs => ?)
                    LIMIT ?)
                """, (double) retention.toSeconds(), limit);
    }

    /**
     * Serializes everything that changes the tokens of one user: a rotation, a logout and a logout of all devices
     * take the same advisory lock first and only then change rows, so they cannot interleave. Without it a logout
     * running next to a rotation revokes the rows it can see, while the rotation inserts the new token a moment
     * later, and the person who signed out keeps a live token. The lock is held until the end of the transaction;
     * the order is always "lock, then change", so there is no deadlock with the row locks of the updates.
     */
    private void lock(UUID userId) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", (RowCallbackHandler) rs -> { },
                userId.toString());
    }

    /** Takes the lock of the owner of a token; an unknown token has no owner and nothing to protect. */
    private void lockOwnerOf(String hash) {
        jdbc.queryForList("SELECT user_id FROM refresh_tokens WHERE token_hash = ?", UUID.class, hash)
                .stream().findFirst().ifPresent(this::lock);
    }

    private String issue(UUID userId, UUID familyId) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.update("""
                INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
                VALUES (?, ?, ?, now() + make_interval(secs => ?))
                """, userId, familyId, hash(raw), (double) properties.refreshTtl().toSeconds());
        return raw;
    }

    /** A used row as seen by the failed rotation; {@code recent} and {@code live} are computed by the database. */
    private record UsedRow(UUID userId, UUID familyId, boolean live, boolean recent) {
    }

    /**
     * The conditional update matched nothing. Decides between a replay inside the reuse window (new token in the
     * same family), a plain rejection and theft detection (revoke the family).
     */
    private Rotation replayOrReject(String hash) {
        boolean windowOn = !reuseWindow.isZero();
        List<UsedRow> rows = jdbc.query("""
                SELECT user_id, family_id,
                       (revoked_at IS NULL AND expires_at > now()) AS live,
                       (used_at > now() - make_interval(secs => ?)) AS recent
                FROM refresh_tokens WHERE token_hash = ? AND used_at IS NOT NULL
                """, (rs, i) -> new UsedRow(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                rs.getBoolean(3), rs.getBoolean(4)), reuseWindow.toMillis() / 1000.0, hash);
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, INVALID, "Refresh token is invalid or expired");
        }
        UsedRow row = rows.get(0);
        if (windowOn && row.recent()) {
            if (!row.live()) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, INVALID, "Refresh token is invalid or expired");
            }
            log.info("Refresh token replayed within the reuse window, family {}", row.familyId());
            return new Rotation(row.userId(), issue(row.userId(), row.familyId()));
        }
        jdbc.update("UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = ? AND revoked_at IS NULL",
                row.familyId());
        throw new ApiException(HttpStatus.UNAUTHORIZED, REUSED, "Refresh token was already used");
    }

    static String hash(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
