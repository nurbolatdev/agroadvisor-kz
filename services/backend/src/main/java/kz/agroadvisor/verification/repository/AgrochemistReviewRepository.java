package kz.agroadvisor.verification.repository;

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

/** The admin's view of agrochemist profiles: the queue, one profile with its contacts, the decision. */
@Repository
public class AgrochemistReviewRepository {

    public record Summary(UUID userId, String fullName, String specialization, String status, Instant submittedAt,
            int documentCount) {
    }

    public record Details(UUID userId, String fullName, String phone, String email, String specialization,
            Integer experienceYears, String status, Instant submittedAt, Instant reviewedAt, UUID reviewedBy,
            String rejectionReason) {
    }

    private static final RowMapper<Summary> SUMMARY = (rs, i) -> new Summary(rs.getObject("user_id", UUID.class),
            rs.getString("full_name"), rs.getString("specialization"), rs.getString("verification_status"),
            instant(rs, "submitted_at"), rs.getInt("document_count"));

    private static final RowMapper<Details> DETAILS = (rs, i) -> new Details(rs.getObject("user_id", UUID.class),
            rs.getString("full_name"), rs.getString("phone"), rs.getString("email"), rs.getString("specialization"),
            nullableInt(rs, "experience_years"), rs.getString("verification_status"), instant(rs, "submitted_at"),
            instant(rs, "reviewed_at"), rs.getObject("reviewed_by", UUID.class), rs.getString("rejection_reason"));

    private final JdbcTemplate jdbc;

    public AgrochemistReviewRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Oldest first: whoever has waited longest is reviewed first. */
    public List<Summary> list(String status, int limit, int offset) {
        return jdbc.query("""
                SELECT p.user_id, u.full_name, p.specialization, p.verification_status, p.submitted_at,
                       (SELECT count(*) FROM agrochemist_documents d WHERE d.user_id = p.user_id) AS document_count
                FROM agrochemist_profiles p JOIN users u ON u.id = p.user_id
                WHERE p.verification_status = ?
                ORDER BY p.submitted_at, p.user_id
                LIMIT ? OFFSET ?
                """, SUMMARY, status, limit, offset);
    }

    public Optional<Details> find(UUID userId) {
        return jdbc.query("""
                SELECT p.user_id, u.full_name, u.phone, u.email, p.specialization, p.experience_years,
                       p.verification_status, p.submitted_at, p.reviewed_at, p.reviewed_by, p.rejection_reason
                FROM agrochemist_profiles p JOIN users u ON u.id = p.user_id
                WHERE p.user_id = ?
                """, DETAILS, userId).stream().findFirst();
    }

    /** Records the decision. {@code reason} is stored for a rejection or a request for documents, cleared otherwise. */
    public void decide(UUID userId, String status, String reason, UUID adminId) {
        jdbc.update("""
                UPDATE agrochemist_profiles
                SET verification_status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = now(),
                    updated_at = now()
                WHERE user_id = ?
                """, status, reason, adminId, userId);
    }

    private static Integer nullableInt(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
