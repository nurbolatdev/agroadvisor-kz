package kz.agroadvisor.community.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Invitations of agrochemists to community questions ({@code community_invitations}, V27). */
@Repository
public class CommunityInvitationRepository {

    /** The user an admin wants to invite: the name, whether the account is active and has the agrochemist role. */
    public record Candidate(UUID id, String name, boolean active, boolean agrochemist) {
    }

    private final JdbcTemplate jdbc;

    public CommunityInvitationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Whether the question exists and is not hidden. */
    public boolean isQuestionVisible(UUID questionId) {
        Boolean visible = jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM community_questions WHERE id = ? AND hidden_at IS NULL)",
                Boolean.class, questionId);
        return Boolean.TRUE.equals(visible);
    }

    public Optional<Candidate> findCandidate(UUID userId) {
        return jdbc.query("""
                SELECT u.id, u.full_name, u.status = 'active',
                       EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role_code = 'agrochemist')
                FROM users u WHERE u.id = ?""",
                (rs, i) -> new Candidate(rs.getObject(1, UUID.class), rs.getString(2), rs.getBoolean(3),
                        rs.getBoolean(4)),
                userId).stream().findFirst();
    }

    /**
     * Adds the invitation and returns its time; empty when the pair was already invited, in which case nothing
     * changes.
     */
    public Optional<Instant> insert(UUID questionId, UUID agrochemistId, UUID invitedBy) {
        return jdbc.query("""
                INSERT INTO community_invitations (question_id, agrochemist_id, invited_by) VALUES (?, ?, ?)
                ON CONFLICT (question_id, agrochemist_id) DO NOTHING
                RETURNING created_at""",
                (rs, i) -> rs.getTimestamp(1).toInstant(), questionId, agrochemistId, invitedBy)
                .stream().findFirst();
    }

    /** The time of an existing invitation. */
    public Optional<Instant> createdAt(UUID questionId, UUID agrochemistId) {
        return jdbc.query(
                "SELECT created_at FROM community_invitations WHERE question_id = ? AND agrochemist_id = ?",
                (rs, i) -> rs.getTimestamp(1).toInstant(), questionId, agrochemistId).stream().findFirst();
    }
}
