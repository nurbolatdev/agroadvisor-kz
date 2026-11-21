package kz.agroadvisor.community.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * Cases of moderation ({@code community_complaints}) and the reports under them
 * ({@code community_reports}, V25). A target has at most one open case; once it is resolved, the next
 * report opens a new one.
 */
@Repository
public class CommunityComplaintRepository {

    private final JdbcTemplate jdbc;

    public CommunityComplaintRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Makes sure the open case of the question exists (or of its answer, when {@code answerId} is not
     * null) and locks it until the end of the transaction. Two first reports at once create one case:
     * the partial unique index makes the second insert do nothing. Empty only when the case was resolved
     * between the insert and the lock, then the caller tries again.
     */
    public Optional<UUID> lockOpen(UUID questionId, UUID answerId) {
        if (answerId == null) {
            jdbc.update("""
                    INSERT INTO community_complaints (target_type, question_id) VALUES ('question', ?)
                    ON CONFLICT (question_id) WHERE answer_id IS NULL AND status <> 'resolved' DO NOTHING""",
                    questionId);
            return jdbc.queryForList("""
                    SELECT id FROM community_complaints
                     WHERE question_id = ? AND answer_id IS NULL AND status <> 'resolved' FOR UPDATE""",
                    UUID.class, questionId).stream().findFirst();
        }
        jdbc.update("""
                INSERT INTO community_complaints (target_type, question_id, answer_id) VALUES ('answer', ?, ?)
                ON CONFLICT (answer_id) WHERE answer_id IS NOT NULL AND status <> 'resolved' DO NOTHING""",
                questionId, answerId);
        return jdbc.queryForList("""
                SELECT id FROM community_complaints
                 WHERE answer_id = ? AND status <> 'resolved' FOR UPDATE""", UUID.class, answerId)
                .stream().findFirst();
    }

    /**
     * A case with its target and the author of the target. {@code topReason} is the most reported reason
     * (a tie goes to the reason that comes first in the fixed list). The target is shown even when hidden.
     */
    public record Row(UUID id, String targetType, UUID questionId, UUID answerId, String status,
            Instant createdAt, Instant resolvedAt, String action, String resolutionComment, String topReason,
            String questionTitle, String targetBody, String cropCode, long regionId, int photoCount,
            boolean targetHidden, UUID authorId, String authorName, String authorRole, boolean authorExpert,
            String authorStatus, int authorHiddenCount) {
    }

    /** How many reports of one reason a case has. */
    public record ReasonCount(UUID complaintId, String reason, int count) {
    }

    /** A comment of one report, newest first inside the case. */
    public record ReportComment(UUID complaintId, String comment) {
    }

    /** The numbers of the moderation page. */
    public record Stats(int complaintsToday, Double avgResolutionMinutes, int resolvedThisWeek, int newComplaints) {
    }

    private static final String ORDER = "ARRAY['ads', 'misinformation', 'spam', 'abuse']";

    private static final String SELECT = """
            SELECT * FROM (
              SELECT c.id, c.target_type, c.question_id, c.answer_id, c.status, c.created_at, c.resolved_at,
                     c.action, c.comment AS resolution_comment,
                     (SELECT r.reason FROM community_reports r WHERE r.complaint_id = c.id
                       GROUP BY r.reason ORDER BY count(*) DESC, array_position(%s, r.reason) LIMIT 1) AS top_reason,
                     q.title AS question_title, COALESCE(a.body, q.body) AS target_body, q.crop_code, q.region_id,
                     (SELECT count(*) FROM community_question_photos p WHERE p.question_id = q.id) AS photo_count,
                     CASE WHEN c.answer_id IS NULL THEN q.hidden_at IS NOT NULL ELSE a.hidden_at IS NOT NULL END
                         AS target_hidden,
                     u.id AS author_id, u.full_name AS author_name, u.status AS author_status,
                     (SELECT ur.role_code FROM user_roles ur
                       WHERE ur.user_id = u.id AND ur.role_code IN ('farmer', 'agrochemist')) AS author_role,
                     COALESCE(ap.verified, false) AS author_expert,
                     (SELECT count(*) FROM community_questions hq WHERE hq.author_id = u.id AND hq.hidden_at IS NOT NULL)
                     + (SELECT count(*) FROM community_answers ha WHERE ha.author_id = u.id AND ha.hidden_at IS NOT NULL)
                         AS author_hidden_count
                FROM community_complaints c
                JOIN community_questions q ON q.id = c.question_id
                LEFT JOIN community_answers a ON a.id = c.answer_id
                JOIN users u ON u.id = COALESCE(a.author_id, q.author_id)
                LEFT JOIN agrochemist_profiles ap ON ap.user_id = u.id
            ) t""".formatted(ORDER);

    private static final RowMapper<Row> ROW = (rs, i) -> new Row(rs.getObject("id", UUID.class),
            rs.getString("target_type"), rs.getObject("question_id", UUID.class),
            rs.getObject("answer_id", UUID.class), rs.getString("status"), instant(rs, "created_at"),
            instant(rs, "resolved_at"), rs.getString("action"), rs.getString("resolution_comment"),
            rs.getString("top_reason"), rs.getString("question_title"), rs.getString("target_body"),
            rs.getString("crop_code"), rs.getLong("region_id"), rs.getInt("photo_count"),
            rs.getBoolean("target_hidden"), rs.getObject("author_id", UUID.class), rs.getString("author_name"),
            rs.getString("author_role"), rs.getBoolean("author_expert"), rs.getString("author_status"),
            rs.getInt("author_hidden_count"));

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    /** Cases newest first; each filter is applied when it is not null. */
    public List<Row> list(String status, String targetType, String reason, int limit, int offset) {
        return jdbc.query(SELECT + """
                \s WHERE (?::text IS NULL OR status = ?) AND (?::text IS NULL OR target_type = ?)
                   AND (?::text IS NULL OR top_reason = ?)
                 ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""", ROW, status, status, targetType,
                targetType, reason, reason, limit, offset);
    }

    public Optional<Row> find(UUID id) {
        return jdbc.query(SELECT + " WHERE id = ?", ROW, id).stream().findFirst();
    }

    /** Reports of the cases by reason, the most reported first. */
    public List<ReasonCount> reasonCounts(Collection<UUID> complaintIds) {
        if (complaintIds.isEmpty()) {
            return List.of();
        }
        return jdbc.query("""
                SELECT complaint_id, reason, count(*) AS n FROM community_reports
                 WHERE complaint_id IN (%s) GROUP BY complaint_id, reason
                 ORDER BY complaint_id, count(*) DESC, array_position(%s, reason)""".formatted(marks(complaintIds), ORDER),
                (rs, i) -> new ReasonCount(rs.getObject("complaint_id", UUID.class), rs.getString("reason"),
                        rs.getInt("n")), complaintIds.toArray());
    }

    /** At most {@code perCase} newest comments of the reports of each case. */
    public List<ReportComment> latestComments(Collection<UUID> complaintIds, int perCase) {
        if (complaintIds.isEmpty()) {
            return List.of();
        }
        List<Object> args = new ArrayList<>(complaintIds);
        args.add(perCase);
        return jdbc.query("""
                SELECT complaint_id, comment FROM (
                  SELECT complaint_id, comment, created_at,
                         row_number() OVER (PARTITION BY complaint_id ORDER BY created_at DESC, id DESC) AS rn
                    FROM community_reports WHERE comment IS NOT NULL AND complaint_id IN (%s)) t
                 WHERE rn <= ? ORDER BY complaint_id, rn""".formatted(marks(complaintIds)),
                (rs, i) -> new ReportComment(rs.getObject("complaint_id", UUID.class), rs.getString("comment")),
                args.toArray());
    }

    /**
     * The moderation numbers: cases opened since {@code dayStart}, the mean minutes from report to decision
     * and the number of cases decided since {@code weekStart} (null mean when there are none), and the cases
     * nobody has taken yet.
     */
    public Stats stats(Instant dayStart, Instant weekStart) {
        return jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE created_at >= ?) AS today,
                       avg(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60)
                           FILTER (WHERE status = 'resolved' AND resolved_at >= ?) AS avg_minutes,
                       count(*) FILTER (WHERE status = 'resolved' AND resolved_at >= ?) AS resolved_week,
                       count(*) FILTER (WHERE status = 'new') AS new_count
                  FROM community_complaints""",
                (rs, i) -> new Stats(rs.getInt("today"),
                        rs.getBigDecimal("avg_minutes") == null ? null : rs.getBigDecimal("avg_minutes").doubleValue(),
                        rs.getInt("resolved_week"), rs.getInt("new_count")),
                Timestamp.from(dayStart), Timestamp.from(weekStart), Timestamp.from(weekStart));
    }

    private static String marks(Collection<?> values) {
        return String.join(", ", java.util.Collections.nCopies(values.size(), "?"));
    }

    /** The status of a locked case; the case is {@code answerId}'s when that is not null. */
    public record Locked(String status, UUID questionId, UUID answerId) {
    }

    /** Locks the case until the end of the transaction, so two admins cannot decide it at once. */
    public Optional<Locked> lock(UUID id) {
        return jdbc.query("SELECT status, question_id, answer_id FROM community_complaints WHERE id = ? FOR UPDATE",
                (rs, i) -> new Locked(rs.getString("status"), rs.getObject("question_id", UUID.class),
                        rs.getObject("answer_id", UUID.class)), id).stream().findFirst();
    }

    /** Takes a new case into work. */
    public void markInProgress(UUID id) {
        jdbc.update("UPDATE community_complaints SET status = 'in_progress', started_at = now() WHERE id = ?", id);
    }

    /** Writes the decision; the caller has locked the case and checked that it is not resolved. */
    public void markResolved(UUID id, UUID adminId, String action, String comment) {
        jdbc.update("""
                UPDATE community_complaints SET status = 'resolved', resolved_at = now(), resolved_by = ?,
                       action = ?, comment = ? WHERE id = ?""", adminId, action, comment, id);
    }

    /** Adds the report to the case; a repeat from the same user changes nothing. */
    public void addReport(UUID complaintId, UUID reporterId, String reason, String comment) {
        jdbc.update("""
                INSERT INTO community_reports (complaint_id, reporter_id, reason, comment) VALUES (?, ?, ?, ?)
                ON CONFLICT (complaint_id, reporter_id) DO NOTHING""", complaintId, reporterId, reason, comment);
    }
}
