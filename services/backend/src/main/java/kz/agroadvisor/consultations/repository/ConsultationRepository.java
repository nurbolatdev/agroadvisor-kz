package kz.agroadvisor.consultations.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import kz.agroadvisor.consultations.model.ConsultationStatus;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Consultations ({@code consultations}, V20) and the request message that opens each of them. */
@Repository
public class ConsultationRepository {

    /** Length of the last-message preview in lists. */
    static final int PREVIEW_LENGTH = 140;

    public record Consultation(UUID id, UUID farmerId, UUID agrochemistId, UUID diagnosisId,
            ConsultationStatus status, Instant createdAt, Instant acceptedAt, Instant closedAt, UUID closedBy,
            Instant lastMessageAt) {
    }

    public record LastMessage(UUID id, UUID senderId, String text, boolean hasPhoto, Instant createdAt) {
    }

    /** A consultation as one participant sees it: names of both sides, the last message, unread count. */
    public record Item(Consultation consultation, String farmerName, Long farmerRegionId, String agrochemistName,
            LastMessage lastMessage, int unreadCount) {
    }

    private static final String COLUMNS = """
            c.id, c.farmer_id, c.agrochemist_id, c.diagnosis_id, c.status, c.created_at, c.accepted_at,
            c.closed_at, c.closed_by, c.last_message_at""";

    private static final RowMapper<Consultation> CONSULTATION = (rs, i) -> consultation(rs);

    private static final String ITEM_SQL = "SELECT " + COLUMNS + """
            , f.full_name AS farmer_name, f.region_id AS farmer_region_id, a.full_name AS agrochemist_name,
                   m.id AS message_id, m.sender_id AS message_sender_id,
                   left(m.body, %d) AS message_text, (m.photo_key IS NOT NULL) AS message_has_photo,
                   m.created_at AS message_created_at,
                   (SELECT count(*) FROM consultation_messages u
                     WHERE u.consultation_id = c.id AND c.status IN ('requested', 'active')
                       AND u.sender_id <> ? AND u.read_at IS NULL) AS unread_count
            FROM consultations c
            JOIN users f ON f.id = c.farmer_id
            JOIN users a ON a.id = c.agrochemist_id
            LEFT JOIN LATERAL (SELECT id, sender_id, body, photo_key, created_at
                                 FROM consultation_messages
                                WHERE consultation_id = c.id
                                ORDER BY created_at DESC, id DESC LIMIT 1) m ON true
            """.formatted(PREVIEW_LENGTH);

    private static final RowMapper<Item> ITEM = (rs, i) -> {
        UUID messageId = rs.getObject("message_id", UUID.class);
        LastMessage last = messageId == null ? null : new LastMessage(messageId,
                rs.getObject("message_sender_id", UUID.class), rs.getString("message_text"),
                rs.getBoolean("message_has_photo"), instant(rs, "message_created_at"));
        long region = rs.getLong("farmer_region_id");
        return new Item(consultation(rs), rs.getString("farmer_name"), rs.wasNull() ? null : region,
                rs.getString("agrochemist_name"), last, rs.getInt("unread_count"));
    };

    private final JdbcTemplate jdbc;

    public ConsultationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Creates a consultation in {@code requested}. The unique index rejects a second open one for the pair. */
    public Consultation insert(UUID farmerId, UUID agrochemistId, UUID diagnosisId) {
        return jdbc.queryForObject("""
                INSERT INTO consultations (farmer_id, agrochemist_id, diagnosis_id, status)
                VALUES (?, ?, ?, 'requested')
                RETURNING id, farmer_id, agrochemist_id, diagnosis_id, status, created_at, accepted_at,
                          closed_at, closed_by, last_message_at""",
                CONSULTATION, farmerId, agrochemistId, diagnosisId);
    }

    /** Adds the text message that opens a consultation and moves {@code last_message_at} to it. */
    public UUID insertMessage(UUID consultationId, UUID senderId, String body) {
        UUID id = jdbc.queryForObject("""
                INSERT INTO consultation_messages (consultation_id, sender_id, body)
                VALUES (?, ?, ?) RETURNING id""", UUID.class, consultationId, senderId, body);
        jdbc.update("""
                UPDATE consultations SET last_message_at = (SELECT created_at FROM consultation_messages
                                                             WHERE id = ?)
                WHERE id = ?""", id, consultationId);
        return id;
    }

    /** The consultation if {@code me} is its farmer or its agrochemist; anyone else gets nothing. */
    public Optional<Item> findForParticipant(UUID id, UUID me) {
        return jdbc.query(ITEM_SQL + " WHERE c.id = ? AND (c.farmer_id = ? OR c.agrochemist_id = ?)",
                ITEM, me, id, me, me).stream().findFirst();
    }

    /** The id of the open (requested or active) consultation of the pair, if there is one. */
    public Optional<UUID> findOpenId(UUID farmerId, UUID agrochemistId) {
        return jdbc.queryForList("""
                SELECT id FROM consultations
                WHERE farmer_id = ? AND agrochemist_id = ? AND status IN ('requested', 'active')""",
                UUID.class, farmerId, agrochemistId).stream().findFirst();
    }

    /** Reads the row and locks it until the end of the transaction; every status change takes this first. */
    public Optional<Consultation> lock(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM consultations c WHERE c.id = ? FOR UPDATE",
                CONSULTATION, id).stream().findFirst();
    }

    /** The consultations of {@code me}, the latest activity first. An empty set of statuses means all. */
    public List<Item> listFor(UUID me, Collection<ConsultationStatus> statuses, int page, int size) {
        List<Object> args = new ArrayList<>();
        args.add(me);
        String where = participantFilter(me, statuses, args);
        args.add(size);
        args.add((long) page * size);
        return jdbc.query(ITEM_SQL + where + " ORDER BY c.last_message_at DESC, c.id DESC LIMIT ? OFFSET ?",
                ITEM, args.toArray());
    }

    /** Whether {@code me} is the farmer or the agrochemist of the consultation. */
    public boolean isParticipant(UUID id, UUID me) {
        Boolean found = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM consultations WHERE id = ? "
                + "AND (farmer_id = ? OR agrochemist_id = ?))", Boolean.class, id, me, me);
        return Boolean.TRUE.equals(found);
    }

    /** Requests of the farmer that still wait for an answer. */
    public int countPending(UUID farmerId) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM consultations WHERE farmer_id = ? AND status = 'requested'",
                Integer.class, farmerId);
        return count == null ? 0 : count;
    }

    /**
     * Moves the consultation to a new status and sets the matching dates: {@code accepted_at} for active,
     * {@code closed_at} and {@code closed_by} for declined and closed.
     */
    public void updateStatus(UUID id, ConsultationStatus status, UUID closedBy) {
        switch (status) {
            case ACTIVE -> jdbc.update("UPDATE consultations SET status = 'active', accepted_at = now() "
                    + "WHERE id = ?", id);
            case DECLINED, CLOSED -> jdbc.update("UPDATE consultations SET status = ?, closed_at = now(), "
                    + "closed_by = ? WHERE id = ?", status.code(), closedBy, id);
            default -> throw new IllegalArgumentException("A consultation cannot go back to " + status.code());
        }
    }

    private static String participantFilter(UUID me, Collection<ConsultationStatus> statuses, List<Object> args) {
        args.add(me);
        args.add(me);
        StringBuilder where = new StringBuilder(" WHERE (c.farmer_id = ? OR c.agrochemist_id = ?)");
        if (statuses != null && !statuses.isEmpty()) {
            where.append(" AND c.status IN (").append(String.join(", ", Collections.nCopies(
                    statuses.size(), "?"))).append(')');
            statuses.forEach(status -> args.add(status.code()));
        }
        return where.toString();
    }

    private static Consultation consultation(ResultSet rs) throws SQLException {
        return new Consultation(rs.getObject("id", UUID.class), rs.getObject("farmer_id", UUID.class),
                rs.getObject("agrochemist_id", UUID.class), rs.getObject("diagnosis_id", UUID.class),
                ConsultationStatus.fromCode(rs.getString("status")), instant(rs, "created_at"),
                instant(rs, "accepted_at"), instant(rs, "closed_at"), rs.getObject("closed_by", UUID.class),
                instant(rs, "last_message_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
