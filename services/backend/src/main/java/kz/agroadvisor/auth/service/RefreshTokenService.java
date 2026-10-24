package kz.agroadvisor.auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.auth.config.JwtProperties;
import kz.agroadvisor.common.web.ApiException;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Opaque refresh tokens with rotation. Only the SHA-256 of a token is stored.
 *
 * <p>Every successful refresh marks the presented token as used and issues a new one in the same
 * family (one login on one device). The state change is a single conditional {@code UPDATE}, so of two
 * parallel refreshes with the same token only one succeeds. Presenting a token that was already used
 * is treated as theft: the whole family is revoked. Time comes from the database so that
 * expiry is judged by the same clock that stored it.
 */
@Service
public class RefreshTokenService {

    public static final String INVALID = "invalid_refresh_token";
    public static final String REUSED = "refresh_token_reused";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final JwtProperties properties;

    public RefreshTokenService(JdbcTemplate jdbc, JwtProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
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
     * Exchanges a refresh token for a new one. The failure paths must commit their changes
     * (revoking the family), so this method does not roll back on {@link ApiException}.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public Rotation rotate(String rawToken) {
        String hash = hash(rawToken);
        List<UUID[]> used = jdbc.query("""
                UPDATE refresh_tokens SET used_at = now()
                WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
                RETURNING user_id, family_id
                """, (rs, i) -> new UUID[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)}, hash);
        if (used.isEmpty()) {
            throw rejection(hash);
        }
        UUID userId = used.get(0)[0];
        UUID familyId = used.get(0)[1];
        return new Rotation(userId, issue(userId, familyId));
    }

    /** Logout of one device: revokes the family of the presented token. Unknown tokens are ignored. */
    @Transactional
    public void revokeFamilyOf(String rawToken) {
        jdbc.update("""
                UPDATE refresh_tokens SET revoked_at = now()
                WHERE revoked_at IS NULL
                  AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = ?)
                """, hash(rawToken));
    }

    /** Logout everywhere, also used when a user is blocked. */
    @Transactional
    public void revokeAll(UUID userId) {
        jdbc.update("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL", userId);
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

    private ApiException rejection(String hash) {
        List<UUID> reusedFamily = jdbc.query(
                "SELECT family_id FROM refresh_tokens WHERE token_hash = ? AND used_at IS NOT NULL",
                (rs, i) -> rs.getObject(1, UUID.class), hash);
        if (reusedFamily.isEmpty()) {
            return new ApiException(HttpStatus.UNAUTHORIZED, INVALID, "Refresh token is invalid or expired");
        }
        jdbc.update("UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = ? AND revoked_at IS NULL",
                reusedFamily.get(0));
        return new ApiException(HttpStatus.UNAUTHORIZED, REUSED, "Refresh token was already used");
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
