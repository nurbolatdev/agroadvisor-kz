package kz.agroadvisor.community.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
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

    /** Adds the report to the case; a repeat from the same user changes nothing. */
    public void addReport(UUID complaintId, UUID reporterId, String reason, String comment) {
        jdbc.update("""
                INSERT INTO community_reports (complaint_id, reporter_id, reason, comment) VALUES (?, ?, ?, ?)
                ON CONFLICT (complaint_id, reporter_id) DO NOTHING""", complaintId, reporterId, reason, comment);
    }
}
