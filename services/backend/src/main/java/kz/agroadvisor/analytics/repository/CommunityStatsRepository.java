package kz.agroadvisor.analytics.repository;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Read-only aggregates over the community tables for the admin statistics screen. Plain SQL; nothing here writes.
 * Hidden questions and hidden answers are never counted, and an answer of the question's own author does not
 * make the question answered.
 */
@Repository
public class CommunityStatsRepository {

    /** How long a question may wait for a first answer before it shows up in the unanswered list. */
    static final Duration UNANSWERED_AFTER = Duration.ofHours(24);

    /** What the visible questions created in a window [from, to) add up to. */
    public record QuestionTotals(int questions, int solved, Double avgFirstAnswerMinutes) {
    }

    public record UnansweredQuestion(UUID id, String title, String cropCode, long regionId, Instant createdAt) {
    }

    /** How the activity of a window is cut into buckets; the value is the SQL expression over a timestamp column. */
    public enum Bucket {
        /** Day of the week in UTC, 0 = Monday. */
        DAY_OF_WEEK("extract(isodow FROM %s AT TIME ZONE 'UTC')::int - 1", false),
        /** Week of the window counted from 1; the window start is the first bound parameter. */
        WEEK("1 + floor(extract(epoch FROM %s - ?::timestamptz) / 604800)::int", true),
        /** Calendar month in UTC, 0 = January. */
        MONTH("extract(month FROM %s AT TIME ZONE 'UTC')::int - 1", false);

        private final String expression;
        private final boolean needsWindowStart;

        Bucket(String expression, boolean needsWindowStart) {
            this.expression = expression;
            this.needsWindowStart = needsWindowStart;
        }
    }

    /** Questions and visible answers created in one bucket; buckets without activity are absent. */
    public record ActivityBucket(int bucket, int questions, int answers) {
    }

    /** A member with the number of visible answers in a window; {@code role} is "agrochemist" or "farmer". */
    public record TopAnswerer(UUID userId, String name, String role, int answers) {
    }

    /** Consultations of a window: requested, closed, and the mean minutes from request to acceptance (or null). */
    public record ConsultationTotals(int requests, int closed, Double avgAcceptMinutes) {
    }

    private final JdbcTemplate jdbc;

    public CommunityStatsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Visible questions created in [from, to), how many of them are solved, and the mean minutes from the question
     * to its first visible answer of somebody else (null when no question has one).
     */
    public QuestionTotals totals(Instant from, Instant to) {
        return jdbc.queryForObject("""
                SELECT count(*) AS n,
                       count(*) FILTER (WHERE q.status = 'solved') AS solved,
                       avg(extract(epoch FROM f.first_at - q.created_at) / 60) AS avg_first
                FROM community_questions q
                LEFT JOIN LATERAL (
                    SELECT min(a.created_at) AS first_at FROM community_answers a
                    WHERE a.question_id = q.id AND a.hidden_at IS NULL AND a.author_id <> q.author_id) f ON true
                WHERE q.hidden_at IS NULL AND q.created_at >= ? AND q.created_at < ?""", (rs, i) -> {
                    int questions = rs.getInt("n");
                    int solved = rs.getInt("solved");
                    double avg = rs.getDouble("avg_first");
                    return new QuestionTotals(questions, solved, rs.wasNull() ? null : avg);
                }, Timestamp.from(from), Timestamp.from(to));
    }

    /**
     * Visible questions and visible answers created in [from, to) per bucket, ordered by bucket. Answers to hidden
     * questions still count: they were written, and the question may be shown again.
     */
    public List<ActivityBucket> activity(Instant from, Instant to, Bucket bucket) {
        String sql = "SELECT bucket, count(*) FILTER (WHERE kind = 'q') AS questions,"
                + " count(*) FILTER (WHERE kind = 'a') AS answers FROM ("
                + " SELECT " + bucket.expression.formatted("q.created_at") + " AS bucket, 'q' AS kind"
                + " FROM community_questions q WHERE q.hidden_at IS NULL AND q.created_at >= ? AND q.created_at < ?"
                + " UNION ALL"
                + " SELECT " + bucket.expression.formatted("a.created_at") + " AS bucket, 'a' AS kind"
                + " FROM community_answers a WHERE a.hidden_at IS NULL AND a.created_at >= ? AND a.created_at < ?"
                + ") t GROUP BY bucket ORDER BY bucket";
        Timestamp start = Timestamp.from(from);
        Timestamp end = Timestamp.from(to);
        Object[] args = bucket.needsWindowStart
                ? new Object[] {start, start, end, start, start, end}
                : new Object[] {start, end, start, end};
        return jdbc.query(sql, (rs, i) -> new ActivityBucket(rs.getInt("bucket"), rs.getInt("questions"),
                rs.getInt("answers")), args);
    }

    /**
     * The members with the most visible answers created in [from, to), admins left out, the most answers first and
     * by name on a tie. The role is "agrochemist" for an agrochemist, otherwise "farmer".
     */
    public List<TopAnswerer> topAnswerers(Instant from, Instant to, int limit) {
        return jdbc.query("""
                SELECT u.id, u.full_name, count(*) AS n,
                       EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id
                               AND r.role_code = 'agrochemist') AS agrochemist
                FROM community_answers a JOIN users u ON u.id = a.author_id
                WHERE a.hidden_at IS NULL AND a.created_at >= ? AND a.created_at < ?
                  AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role_code = 'admin')
                GROUP BY u.id, u.full_name
                ORDER BY n DESC, u.full_name, u.id LIMIT ?""", (rs, i) -> new TopAnswerer(
                rs.getObject("id", UUID.class), rs.getString("full_name"),
                rs.getBoolean("agrochemist") ? "agrochemist" : "farmer", rs.getInt("n")),
                Timestamp.from(from), Timestamp.from(to), limit);
    }

    /**
     * Consultations requested in [from, to), those closed (status closed, not declined) in it, and the mean minutes
     * from request to acceptance over those accepted in it (null when none was).
     */
    public ConsultationTotals consultations(Instant from, Instant to) {
        Timestamp start = Timestamp.from(from);
        Timestamp end = Timestamp.from(to);
        return jdbc.queryForObject("""
                SELECT (SELECT count(*) FROM consultations WHERE created_at >= ? AND created_at < ?) AS requests,
                       (SELECT count(*) FROM consultations
                        WHERE status = 'closed' AND closed_at >= ? AND closed_at < ?) AS closed,
                       (SELECT avg(extract(epoch FROM accepted_at - created_at) / 60) FROM consultations
                        WHERE accepted_at >= ? AND accepted_at < ?) AS avg_accept""", (rs, i) -> {
                    int requests = rs.getInt("requests");
                    int closed = rs.getInt("closed");
                    double avg = rs.getDouble("avg_accept");
                    return new ConsultationTotals(requests, closed, rs.wasNull() ? null : avg);
                }, start, end, start, end, start, end);
    }

    /**
     * Visible questions that were at least 24 hours old at {@code at} and had no visible answer of somebody else
     * created before {@code at}. Hiding flags are the current ones, so for a past moment this is an approximation.
     */
    public int unansweredCount(Instant at) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*) FROM community_questions q
                WHERE q.hidden_at IS NULL AND q.created_at < ?
                  AND NOT EXISTS (SELECT 1 FROM community_answers a
                                  WHERE a.question_id = q.id AND a.hidden_at IS NULL
                                    AND a.author_id <> q.author_id AND a.created_at < ?)""", Integer.class,
                Timestamp.from(at.minus(UNANSWERED_AFTER)), Timestamp.from(at));
        return n == null ? 0 : n;
    }

    /** The unanswered questions of {@link #unansweredCount} at {@code now}, the oldest first, at most {@code limit}. */
    public List<UnansweredQuestion> unanswered(Instant now, int limit) {
        return jdbc.query("""
                SELECT q.id, q.title, q.crop_code, q.region_id, q.created_at FROM community_questions q
                WHERE q.hidden_at IS NULL AND q.created_at < ?
                  AND NOT EXISTS (SELECT 1 FROM community_answers a
                                  WHERE a.question_id = q.id AND a.hidden_at IS NULL
                                    AND a.author_id <> q.author_id AND a.created_at < ?)
                ORDER BY q.created_at, q.id LIMIT ?""", (rs, i) -> new UnansweredQuestion(
                rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("crop_code"),
                rs.getLong("region_id"), rs.getTimestamp("created_at").toInstant()),
                Timestamp.from(now.minus(UNANSWERED_AFTER)), Timestamp.from(now), limit);
    }
}
