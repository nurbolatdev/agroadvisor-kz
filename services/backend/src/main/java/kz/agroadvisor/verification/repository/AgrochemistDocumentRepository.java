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

/** Documents of agrochemists and the verification state kept in {@code agrochemist_profiles} (V3, V13). */
@Repository
public class AgrochemistDocumentRepository {

    public record Document(UUID id, UUID userId, String kind, String objectKey, String title, String issuer,
            Integer year, String contentType, int sizeBytes, Instant uploadedAt) {
    }

    public record Profile(UUID userId, String status, Instant submittedAt, Instant reviewedAt, UUID reviewedBy,
            String rejectionReason, List<String> specializations, Integer experienceYears) {
    }

    private static final String DOCUMENT_COLUMNS =
            "id, user_id, kind, object_key, title, issuer, year, content_type, size_bytes, uploaded_at";

    private static final String PROFILE_SQL = """
            SELECT user_id, verification_status, submitted_at, reviewed_at, reviewed_by, rejection_reason,
                   specialization, experience_years
            FROM agrochemist_profiles WHERE user_id = ?""";

    private static final RowMapper<Document> DOCUMENT = (rs, i) -> new Document(
            rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class), rs.getString("kind"),
            rs.getString("object_key"), rs.getString("title"), rs.getString("issuer"), nullableInt(rs, "year"),
            rs.getString("content_type"), rs.getInt("size_bytes"), instant(rs, "uploaded_at"));

    private static final RowMapper<Profile> PROFILE = (rs, i) -> new Profile(
            rs.getObject("user_id", UUID.class), rs.getString("verification_status"), instant(rs, "submitted_at"),
            instant(rs, "reviewed_at"), rs.getObject("reviewed_by", UUID.class), rs.getString("rejection_reason"),
            codes(rs.getString("specialization")), nullableInt(rs, "experience_years"));

    /** The column keeps the codes joined by commas; empty or missing means none. */
    private static List<String> codes(String stored) {
        return stored == null || stored.isBlank() ? List.of() : List.of(stored.split(","));
    }

    private final JdbcTemplate jdbc;

    public AgrochemistDocumentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Profile> findProfile(UUID userId) {
        return jdbc.query(PROFILE_SQL, PROFILE, userId).stream().findFirst();
    }

    /**
     * Reads the profile and locks its row until the end of the transaction. Everything that depends on the
     * status or on the number of documents (send, remove, approve) takes this lock first, so an approval
     * cannot be undone by an upload that was checked a moment earlier, and the limit cannot be passed by
     * two uploads at once.
     */
    public Optional<Profile> lockProfile(UUID userId) {
        return jdbc.query(PROFILE_SQL + " FOR UPDATE", PROFILE, userId).stream().findFirst();
    }

    public int countDocuments(UUID userId) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM agrochemist_documents WHERE user_id = ?",
                Integer.class, userId);
        return count == null ? 0 : count;
    }

    public List<Document> listDocuments(UUID userId) {
        return jdbc.query("SELECT " + DOCUMENT_COLUMNS
                + " FROM agrochemist_documents WHERE user_id = ? ORDER BY uploaded_at, id", DOCUMENT, userId);
    }

    public Optional<Document> findDocument(UUID userId, UUID documentId) {
        return jdbc.query("SELECT " + DOCUMENT_COLUMNS
                + " FROM agrochemist_documents WHERE user_id = ? AND id = ?", DOCUMENT, userId, documentId)
                .stream().findFirst();
    }

    public Document insertDocument(UUID userId, String kind, String objectKey, String title, String issuer,
            Integer year, String contentType, int sizeBytes) {
        return jdbc.queryForObject("""
                INSERT INTO agrochemist_documents (user_id, kind, object_key, title, issuer, year, content_type, size_bytes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING """ + " " + DOCUMENT_COLUMNS, DOCUMENT,
                userId, kind, objectKey, title, issuer, year, contentType, sizeBytes);
    }

    public void deleteDocument(UUID documentId) {
        jdbc.update("DELETE FROM agrochemist_documents WHERE id = ?", documentId);
    }

    /**
     * The agrochemist sent a document: the profile is (back) in the queue of the admins. A profile that is
     * already waiting keeps its place in the queue ({@code submitted_at}).
     */
    public void markSubmitted(UUID userId) {
        jdbc.update("""
                UPDATE agrochemist_profiles
                SET submitted_at = CASE WHEN verification_status = 'pending' AND submitted_at IS NOT NULL
                                        THEN submitted_at ELSE now() END,
                    verification_status = 'pending', rejection_reason = NULL, updated_at = now()
                WHERE user_id = ?
                """, userId);
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
