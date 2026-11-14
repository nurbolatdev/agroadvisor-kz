package kz.agroadvisor.diagnosis.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Reviews of diagnoses (table {@code diagnosis_reviews}, V18); plain SQL like the other newer repositories. */
@Repository
public class DiagnosisReviewRepository {

    /** One person's check of a diagnosis; {@code correctCode} is null exactly for {@code unclear}. */
    public record Review(UUID id, UUID diagnosisId, UUID reviewerId, String verdict, String correctCode,
            String comment, Instant createdAt, Instant updatedAt) {
    }

    private static final String COLUMNS = "id, diagnosis_id, reviewer_id, verdict, correct_code, comment, "
            + "created_at, updated_at";

    private static final RowMapper<Review> REVIEW = (rs, i) -> new Review(rs.getObject("id", UUID.class),
            rs.getObject("diagnosis_id", UUID.class), rs.getObject("reviewer_id", UUID.class),
            rs.getString("verdict"), rs.getString("correct_code"), rs.getString("comment"),
            instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")));

    private final JdbcTemplate jdbc;

    public DiagnosisReviewRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Inserts the reviewer's opinion or replaces their earlier one (one row per diagnosis and reviewer). */
    public Review save(UUID diagnosisId, UUID reviewerId, String verdict, String correctCode, String comment) {
        return jdbc.queryForObject("""
                INSERT INTO diagnosis_reviews (diagnosis_id, reviewer_id, verdict, correct_code, comment)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (diagnosis_id, reviewer_id) DO UPDATE
                   SET verdict = EXCLUDED.verdict, correct_code = EXCLUDED.correct_code,
                       comment = EXCLUDED.comment, updated_at = now()
                RETURNING """ + " " + COLUMNS, REVIEW, diagnosisId, reviewerId, verdict, correctCode, comment);
    }

    public Optional<Review> find(UUID diagnosisId, UUID reviewerId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM diagnosis_reviews WHERE diagnosis_id = ? AND reviewer_id = ?",
                REVIEW, diagnosisId, reviewerId).stream().findFirst();
    }

    public List<Review> findAll(UUID diagnosisId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM diagnosis_reviews WHERE diagnosis_id = ? "
                + "ORDER BY created_at, id", REVIEW, diagnosisId);
    }

    private static Instant instant(Timestamp t) {
        return t.toInstant();
    }
}
