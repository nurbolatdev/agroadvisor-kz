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
