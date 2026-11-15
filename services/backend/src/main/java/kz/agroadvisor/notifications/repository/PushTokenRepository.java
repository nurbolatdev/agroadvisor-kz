package kz.agroadvisor.notifications.repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Device push tokens ({@code push_tokens}, V21). The token itself is never read back. */
@Repository
public class PushTokenRepository {

    public record PushToken(UUID id, UUID userId, String platform, Instant createdAt, Instant updatedAt) {
    }

    private static final RowMapper<PushToken> PUSH_TOKEN = (rs, i) -> new PushToken(
            rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class), rs.getString("platform"),
            rs.getObject("created_at", OffsetDateTime.class).toInstant(),
            rs.getObject("updated_at", OffsetDateTime.class).toInstant());

    private final JdbcTemplate jdbc;

    public PushTokenRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Registers a token for the user. A token is unique across all users: registering one that exists
     * keeps its row and id, refreshes {@code updated_at} and hands it to the given user and platform.
     */
    public PushToken upsert(UUID userId, String token, String platform) {
        return jdbc.queryForObject("""
                INSERT INTO push_tokens (user_id, token, platform, created_at, updated_at)
                VALUES (?, ?, ?, clock_timestamp(), clock_timestamp())
                ON CONFLICT (token) DO UPDATE
                   SET user_id = EXCLUDED.user_id,
                       platform = EXCLUDED.platform,
                       updated_at = clock_timestamp()
                RETURNING id, user_id, platform, created_at, updated_at""", PUSH_TOKEN, userId, token, platform);
    }

    /** Deletes the user's tokens beyond the {@code keep} most recently registered; returns how many. */
    public int trimToNewest(UUID userId, int keep) {
        return jdbc.update("""
                DELETE FROM push_tokens
                 WHERE id IN (SELECT id FROM push_tokens
                               WHERE user_id = ?
                               ORDER BY updated_at DESC, id DESC
                               OFFSET ?)""", userId, keep);
    }

    /** Deletes the user's token; 0 when the user has no such token. */
    public int delete(UUID userId, UUID id) {
        return jdbc.update("DELETE FROM push_tokens WHERE id = ? AND user_id = ?", id, userId);
    }

    /** Serializes token registrations of one user until the transaction ends. */
    public void lockUser(UUID userId) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended('push_tokens:' || ?, 0))",
                rs -> {
                }, userId.toString());
    }
}
