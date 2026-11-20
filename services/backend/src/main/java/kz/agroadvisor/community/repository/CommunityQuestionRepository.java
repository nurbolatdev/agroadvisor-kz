package kz.agroadvisor.community.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Questions of the community and their photos ({@code community_questions}, V25). */
@Repository
public class CommunityQuestionRepository {

    /**
     * A question with its author and the number of visible answers; {@code hiddenAt} is set for a hidden one.
     * {@code authorExpert} is true only for an agrochemist whose documents are approved.
     */
    public record Question(UUID id, UUID authorId, String authorName, boolean authorExpert, String cropCode,
            long regionId, Long districtId, UUID diagnosisId, String title, String body,
            UUID acceptedAnswerId, String status, Instant hiddenAt, Instant createdAt, int answerCount) {
    }

    public record Photo(UUID id, UUID questionId, String key, String contentType, int sizeBytes, int position) {
    }

    /**
     * Feed filters; every empty one is skipped. {@code status} is {@code open} or {@code solved},
     * {@code unanswered} keeps questions without a visible answer, {@code authorId} gives one's own questions.
     */
    public record Filter(List<String> crops, Long regionId, String status, boolean unanswered, UUID authorId) {

        public static final Filter NONE = new Filter(List.of(), null, null, false, null);
    }

    /** Position of a question in the feed order, used as the page boundary. */
    public record Cursor(Instant createdAt, UUID id) {
    }

    private static final String QUESTION_SELECT = """
            SELECT q.id, q.author_id, u.full_name AS author_name, COALESCE(ap.verified, false) AS author_expert,
                   q.crop_code, q.region_id, q.district_id, q.diagnosis_id, q.title, q.body,
                   q.accepted_answer_id, q.status, q.hidden_at, q.created_at,
                   (SELECT count(*) FROM community_answers a
                     WHERE a.question_id = q.id AND a.hidden_at IS NULL) AS answer_count
              FROM community_questions q
              JOIN users u ON u.id = q.author_id
              LEFT JOIN agrochemist_profiles ap ON ap.user_id = q.author_id
            """;

    private static final RowMapper<Question> QUESTION = (rs, i) -> new Question(
            rs.getObject("id", UUID.class), rs.getObject("author_id", UUID.class), rs.getString("author_name"),
            rs.getBoolean("author_expert"), rs.getString("crop_code"), rs.getLong("region_id"),
            (Long) rs.getObject("district_id"), rs.getObject("diagnosis_id", UUID.class), rs.getString("title"),
            rs.getString("body"), rs.getObject("accepted_answer_id", UUID.class), rs.getString("status"),
            instant(rs, "hidden_at"), instant(rs, "created_at"), rs.getInt("answer_count"));

    private static final RowMapper<Photo> PHOTO = (rs, i) -> new Photo(rs.getObject("id", UUID.class),
            rs.getObject("question_id", UUID.class), rs.getString("photo_key"), rs.getString("content_type"),
            rs.getInt("size_bytes"), rs.getInt("position"));

    private final JdbcTemplate jdbc;

    public CommunityQuestionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Adds a question; the region and district come from the author's profile at this moment. False when the
     * author is unknown or has no region, and then nothing is added.
     */
    public boolean insert(UUID id, UUID authorId, String cropCode, UUID diagnosisId, String title, String body) {
        return jdbc.update("""
                INSERT INTO community_questions (id, author_id, crop_code, region_id, district_id, diagnosis_id,
                                                 title, body)
                SELECT ?, u.id, ?, u.region_id, u.district_id, ?, ?, ?
                  FROM users u
                 WHERE u.id = ? AND u.region_id IS NOT NULL""", id, cropCode, diagnosisId, title, body,
                authorId) > 0;
    }

    public UUID insertPhoto(UUID questionId, String key, String contentType, int sizeBytes, int position) {
        return jdbc.queryForObject("""
                INSERT INTO community_question_photos (question_id, photo_key, content_type, size_bytes, position)
                VALUES (?, ?, ?, ?, ?) RETURNING id""", UUID.class, questionId, key, contentType, sizeBytes,
                position);
    }

    /** The question when it exists and is not hidden. */
    public Optional<Question> findVisible(UUID id) {
        return jdbc.query(QUESTION_SELECT + " WHERE q.id = ? AND q.hidden_at IS NULL", QUESTION, id)
                .stream().findFirst();
    }

    /** The question including a hidden one: for moderation and for the feed cursor. */
    public Optional<Question> find(UUID id) {
        return jdbc.query(QUESTION_SELECT + " WHERE q.id = ?", QUESTION, id).stream().findFirst();
    }

    /** Feed position of the question, hidden or not; empty when there is no such question. */
    public Optional<Cursor> cursorOf(UUID id) {
        return jdbc.query("SELECT created_at, id FROM community_questions WHERE id = ?",
                (rs, i) -> new Cursor(instant(rs, "created_at"), rs.getObject("id", UUID.class)), id)
                .stream().findFirst();
    }

    /**
     * Visible questions, newest first, after {@code cursor} (the first page when it is null). Equal creation
     * times are ordered by id, so pages neither repeat nor skip a question.
     */
    public List<Question> feed(Filter filter, Cursor cursor, int limit) {
        StringBuilder sql = new StringBuilder(QUESTION_SELECT).append(" WHERE q.hidden_at IS NULL");
        List<Object> args = new ArrayList<>();
        Collection<String> crops = filter.crops();
        if (crops != null && !crops.isEmpty()) {
            sql.append(" AND q.crop_code IN (").append(String.join(", ", crops.stream().map(c -> "?").toList()))
                    .append(')');
            args.addAll(crops);
        }
        if (filter.regionId() != null) {
            sql.append(" AND q.region_id = ?");
            args.add(filter.regionId());
        }
        if (filter.status() != null) {
            sql.append(" AND q.status = ?");
            args.add(filter.status());
        }
        if (filter.unanswered()) {
            sql.append(" AND NOT EXISTS (SELECT 1 FROM community_answers a"
                    + " WHERE a.question_id = q.id AND a.hidden_at IS NULL)");
        }
        if (filter.authorId() != null) {
            sql.append(" AND q.author_id = ?");
            args.add(filter.authorId());
        }
        if (cursor != null) {
            sql.append(" AND (q.created_at, q.id) < (?::timestamptz, ?::uuid)");
            args.add(OffsetDateTime.ofInstant(cursor.createdAt(), ZoneOffset.UTC));
            args.add(cursor.id());
        }
        sql.append(" ORDER BY q.created_at DESC, q.id DESC LIMIT ?");
        args.add(limit);
        return jdbc.query(sql.toString(), QUESTION, args.toArray());
    }

    /** Photos of the questions in order of position, in one query. */
    public List<Photo> photos(List<UUID> questionIds) {
        if (questionIds.isEmpty()) {
            return List.of();
        }
        String marks = String.join(", ", questionIds.stream().map(id -> "?").toList());
        return jdbc.query("""
                SELECT id, question_id, photo_key, content_type, size_bytes, position
                  FROM community_question_photos
                 WHERE question_id IN (""" + marks + ") ORDER BY question_id, position", PHOTO,
                questionIds.toArray());
    }

    /** Locks the question row until the end of the transaction; false when there is no such question. */
    public boolean lock(UUID id) {
        return !jdbc.queryForList("SELECT id FROM community_questions WHERE id = ? FOR UPDATE", UUID.class, id)
                .isEmpty();
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
