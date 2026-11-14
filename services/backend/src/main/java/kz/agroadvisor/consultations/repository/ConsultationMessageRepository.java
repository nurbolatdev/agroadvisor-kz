package kz.agroadvisor.consultations.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Messages of consultations ({@code consultation_messages}, V20): history by keyset and read receipts. */
@Repository
public class ConsultationMessageRepository {

    /** A message; {@code text} or {@code photoKey} is set, {@code readAt} is when the other side read it. */
    public record Message(UUID id, UUID consultationId, UUID senderId, String text, String photoKey,
            Instant createdAt, Instant readAt) {
    }

    private static final String COLUMNS = "id, consultation_id, sender_id, body, photo_key, created_at, read_at";

    private static final RowMapper<Message> MESSAGE = (rs, i) -> message(rs);

    /** The position of a message of one consultation in the order {@code (created_at, id)}. */
    private static final String CURSOR = "(SELECT created_at, id FROM consultation_messages "
            + "WHERE id = ? AND consultation_id = ?)";

    private final JdbcTemplate jdbc;

    public ConsultationMessageRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Message> find(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM consultation_messages WHERE id = ?", MESSAGE, id)
                .stream().findFirst();
    }

    /** Whether the message exists and belongs to the consultation. */
    public boolean exists(UUID consultationId, UUID messageId) {
        Boolean found = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM consultation_messages "
                + "WHERE id = ? AND consultation_id = ?)", Boolean.class, messageId, consultationId);
        return Boolean.TRUE.equals(found);
    }

    /** The newest messages, or the ones older than {@code before}; the newest first. */
    public List<Message> older(UUID consultationId, UUID before, int limit) {
        if (before == null) {
            return jdbc.query("SELECT " + COLUMNS + " FROM consultation_messages WHERE consultation_id = ? "
                    + "ORDER BY created_at DESC, id DESC LIMIT ?", MESSAGE, consultationId, limit);
        }
        return jdbc.query("SELECT " + COLUMNS + " FROM consultation_messages WHERE consultation_id = ? "
                + "AND (created_at, id) < " + CURSOR + " ORDER BY created_at DESC, id DESC LIMIT ?",
                MESSAGE, consultationId, before, consultationId, limit);
    }

    /** The messages newer than {@code after}; the oldest first. */
    public List<Message> newer(UUID consultationId, UUID after, int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM consultation_messages WHERE consultation_id = ? "
                + "AND (created_at, id) > " + CURSOR + " ORDER BY created_at ASC, id ASC LIMIT ?",
                MESSAGE, consultationId, after, consultationId, limit);
    }

    /**
     * Marks the messages of the other side up to {@code upTo} (inclusive) as read; a message already read keeps
     * its time. Returns how many were marked now.
     */
    public int markRead(UUID consultationId, UUID reader, UUID upTo) {
        return jdbc.update("UPDATE consultation_messages SET read_at = now() WHERE consultation_id = ? "
                + "AND sender_id <> ? AND read_at IS NULL AND (created_at, id) <= " + CURSOR,
                consultationId, reader, upTo, consultationId);
    }

    /** Unread messages that others sent to {@code reader} in one consultation. */
    public int unreadIn(UUID consultationId, UUID reader) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM consultation_messages "
                + "WHERE consultation_id = ? AND sender_id <> ? AND read_at IS NULL", Integer.class,
                consultationId, reader);
        return count == null ? 0 : count;
    }

    /**
     * Unread messages that others sent to {@code reader} in the reader's requested and active consultations;
     * closed and declined ones do not count.
     */
    public long unreadTotal(UUID reader) {
        Long count = jdbc.queryForObject("""
                SELECT count(*) FROM consultation_messages m
                JOIN consultations c ON c.id = m.consultation_id
                WHERE (c.farmer_id = ? OR c.agrochemist_id = ?) AND c.status IN ('requested', 'active')
                  AND m.sender_id <> ? AND m.read_at IS NULL""",
                Long.class, reader, reader, reader);
        return count == null ? 0 : count;
    }

    private static Message message(ResultSet rs) throws SQLException {
        return new Message(rs.getObject("id", UUID.class), rs.getObject("consultation_id", UUID.class),
                rs.getObject("sender_id", UUID.class), rs.getString("body"), rs.getString("photo_key"),
                instant(rs, "created_at"), instant(rs, "read_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
