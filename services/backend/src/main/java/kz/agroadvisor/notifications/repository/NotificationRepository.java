package kz.agroadvisor.notifications.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.notifications.model.NotificationType;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** The notification feed ({@code notifications}, V21). */
@Repository
public class NotificationRepository {

    /** Ids a notification points to; which of them are set depends on the type. */
    public record Refs(UUID consultationId, UUID messageId, UUID diagnosisId, UUID questionId, UUID answerId) {

        public static final Refs NONE = new Refs(null, null, null, null, null);
    }

    public record Notification(UUID id, UUID recipientId, NotificationType type, UUID consultationId,
            UUID messageId, UUID diagnosisId, UUID questionId, UUID answerId, int count, Instant createdAt,
            Instant updatedAt, Instant readAt) {
    }

    private static final String COLUMNS = """
            id, recipient_id, type, consultation_id, message_id, diagnosis_id, question_id, answer_id,
            event_count, created_at, updated_at, read_at""";

    private static final RowMapper<Notification> NOTIFICATION = (rs, i) -> new Notification(
            rs.getObject("id", UUID.class), rs.getObject("recipient_id", UUID.class),
            NotificationType.fromCode(rs.getString("type")), rs.getObject("consultation_id", UUID.class),
            rs.getObject("message_id", UUID.class), rs.getObject("diagnosis_id", UUID.class),
            rs.getObject("question_id", UUID.class), rs.getObject("answer_id", UUID.class),
            rs.getInt("event_count"), instant(rs, "created_at"), instant(rs, "updated_at"),
            instant(rs, "read_at"));

    private final JdbcTemplate jdbc;

    public NotificationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Adds a notification. When the recipient already has an unread row with the same non-null
     * {@code collapseKey}, that row is bumped instead: its counter grows, it moves to the top and its
     * message, question and answer references point to the newest event. The unique index settles concurrent inserts.
     */
    public Notification insertOrCollapse(UUID recipientId, NotificationType type, Refs refs, String collapseKey) {
        return jdbc.queryForObject("""
                WITH now_ts AS (SELECT clock_timestamp() AS ts)
                INSERT INTO notifications (recipient_id, type, consultation_id, message_id, diagnosis_id,
                                           question_id, answer_id, collapse_key, created_at, updated_at)
                SELECT ?::uuid, ?::varchar, ?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::varchar, ts, ts
                  FROM now_ts
                ON CONFLICT (recipient_id, collapse_key) WHERE read_at IS NULL DO UPDATE
                   SET event_count = notifications.event_count + 1,
                       message_id = EXCLUDED.message_id,
                       question_id = EXCLUDED.question_id,
                       answer_id = EXCLUDED.answer_id,
                       updated_at = EXCLUDED.updated_at
                RETURNING\s""" + COLUMNS, NOTIFICATION, recipientId, type.code(), refs.consultationId(),
                refs.messageId(), refs.diagnosisId(), refs.questionId(), refs.answerId(), collapseKey);
    }

    /** The recipient's rows, newest first; {@code limit} and {@code offset} page through them. */
    public List<Notification> list(UUID recipientId, boolean unreadOnly, int limit, int offset) {
        return jdbc.query("SELECT " + COLUMNS + """

                FROM notifications
                WHERE recipient_id = ? AND (? = false OR read_at IS NULL)
                ORDER BY updated_at DESC, id DESC
                LIMIT ? OFFSET ?""", NOTIFICATION, recipientId, unreadOnly, limit, offset);
    }

    public int countUnread(UUID recipientId) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM notifications WHERE recipient_id = ? AND read_at IS NULL",
                Integer.class, recipientId);
        return count == null ? 0 : count;
    }

    /** Marks the recipient's row read; false when the recipient has no such row. A read row keeps its time. */
    public boolean markRead(UUID recipientId, UUID id) {
        return jdbc.update("""
                UPDATE notifications SET read_at = COALESCE(read_at, now())
                 WHERE id = ? AND recipient_id = ?""", id, recipientId) > 0;
    }

    public void markAllRead(UUID recipientId) {
        jdbc.update("UPDATE notifications SET read_at = now() WHERE recipient_id = ? AND read_at IS NULL",
                recipientId);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
