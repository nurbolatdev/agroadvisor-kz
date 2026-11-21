package kz.agroadvisor.community.repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Answers of the community questions ({@code community_answers}, V25) with their score and the best mark. */
@Repository
public class CommunityAnswerRepository {

    /**
     * A visible answer. {@code score} is the sum of the votes, {@code myVote} is -1, 0 or 1 for the caller,
     * {@code expert} is true only for an agrochemist whose documents are approved.
     */
    public record Answer(UUID id, UUID questionId, UUID authorId, String authorName, boolean authorExpert,
            String body, Instant createdAt, int score, int myVote, boolean accepted) {
    }

    private static final RowMapper<Answer> ANSWER = (rs, i) -> new Answer(rs.getObject("id", UUID.class),
            rs.getObject("question_id", UUID.class), rs.getObject("author_id", UUID.class),
            rs.getString("author_name"), rs.getBoolean("author_expert"), rs.getString("body"),
            rs.getObject("created_at", OffsetDateTime.class).toInstant(), rs.getInt("score"),
            rs.getInt("my_vote"), rs.getBoolean("accepted"));

    private final JdbcTemplate jdbc;

    public CommunityAnswerRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public UUID insert(UUID questionId, UUID authorId, String body) {
        return jdbc.queryForObject("""
                INSERT INTO community_answers (question_id, author_id, body) VALUES (?, ?, ?) RETURNING id""",
                UUID.class, questionId, authorId, body);
    }

    /** Number of answers of the question, hidden ones included: the limit counts every stored answer. */
    public int count(UUID questionId) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM community_answers WHERE question_id = ?",
                Integer.class, questionId);
        return count == null ? 0 : count;
    }

    /**
     * Visible answers of the question: the best one first, then by score, creation time and id.
     * {@code viewer} fills {@code myVote}.
     */
    public List<Answer> list(UUID questionId, UUID viewer) {
        return jdbc.query(SELECT + " WHERE a.question_id = ? AND a.hidden_at IS NULL " + """
                ORDER BY (q.accepted_answer_id = a.id) DESC NULLS LAST, score DESC, a.created_at, a.id""",
                ANSWER, viewer, questionId);
    }

    /** The answer of this question when it exists and is not hidden. */
    public Optional<Answer> findVisible(UUID questionId, UUID answerId, UUID viewer) {
        return jdbc.query(SELECT + " WHERE a.question_id = ? AND a.id = ? AND a.hidden_at IS NULL", ANSWER,
                viewer, questionId, answerId).stream().findFirst();
    }

    /** The answer by id when neither it nor its question is hidden. */
    public Optional<Answer> findVisibleById(UUID answerId, UUID viewer) {
        return jdbc.query(SELECT + " WHERE a.id = ? AND a.hidden_at IS NULL AND q.hidden_at IS NULL", ANSWER,
                viewer, answerId).stream().findFirst();
    }

    /** Sets the vote of the user on the answer, replacing the previous one. */
    public void upsertVote(UUID answerId, UUID userId, int value) {
        jdbc.update("""
                INSERT INTO community_votes (answer_id, user_id, value) VALUES (?, ?, ?)
                ON CONFLICT (answer_id, user_id) DO UPDATE SET value = EXCLUDED.value""", answerId, userId,
                value);
    }

    /** Removes the vote of the user on the answer; without one it does nothing. */
    public void deleteVote(UUID answerId, UUID userId) {
        jdbc.update("DELETE FROM community_votes WHERE answer_id = ? AND user_id = ?", answerId, userId);
    }

    /** Sets or, with null, clears the best answer of the question. */
    public void setAccepted(UUID questionId, UUID answerId) {
        jdbc.update("UPDATE community_questions SET accepted_answer_id = ? WHERE id = ?", answerId, questionId);
    }

    /**
     * Hides the answer or brings it back; empty when there is no such answer, otherwise the id of its
     * question. Hiding the best answer makes the question open again, and bringing it back does not restore
     * the choice. Hiding twice keeps the first time and admin.
     */
    public Optional<UUID> setHidden(UUID answerId, UUID adminId, boolean hidden) {
        List<UUID> found = hidden
                ? jdbc.queryForList("""
                        UPDATE community_answers SET hidden_at = COALESCE(hidden_at, now()),
                               hidden_by = COALESCE(hidden_by, ?) WHERE id = ? RETURNING question_id""",
                        UUID.class, adminId, answerId)
                : jdbc.queryForList("""
                        UPDATE community_answers SET hidden_at = NULL, hidden_by = NULL
                         WHERE id = ? RETURNING question_id""", UUID.class, answerId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        if (hidden) {
            jdbc.update("UPDATE community_questions SET accepted_answer_id = NULL WHERE id = ? AND accepted_answer_id = ?",
                    found.get(0), answerId);
        }
        return Optional.of(found.get(0));
    }

    private static final String SELECT = """
            SELECT a.id, a.question_id, a.author_id, u.full_name AS author_name,
                   COALESCE(ap.verified, false) AS author_expert, a.body, a.created_at,
                   COALESCE((SELECT sum(v.value) FROM community_votes v WHERE v.answer_id = a.id), 0) AS score,
                   COALESCE((SELECT v.value FROM community_votes v
                              WHERE v.answer_id = a.id AND v.user_id = ?), 0) AS my_vote,
                   (q.accepted_answer_id = a.id) AS accepted
              FROM community_answers a
              JOIN community_questions q ON q.id = a.question_id
              JOIN users u ON u.id = a.author_id
              LEFT JOIN agrochemist_profiles ap ON ap.user_id = a.author_id
            """;
}
