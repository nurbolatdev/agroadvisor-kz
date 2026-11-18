package kz.agroadvisor.diagnosis.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Read-only statistics of the model's work for the admin: what the model answered ({@code diagnoses}) against
 * what experts decided ({@code diagnosis_reviews}). Plain SQL; nothing here writes.
 *
 * <p>An expert decision of a diagnosis follows {@code DiagnosisReviewService.effective}: only {@code confirmed}
 * and {@code corrected} verdicts decide, and when they differ the diagnosis is disputed and counts as neither.
 */
@Repository
public class AiQualityRepository {

    public static final int HISTOGRAM_BUCKETS = 10;

    /** A class of the catalog (or a code the catalog does not know yet, then {@code name} is the code). */
    public record ClassCount(String code, String name, int count) {
    }

    public record Mismatch(String aiCode, String aiName, String confirmedCode, String confirmedName, int cases) {
    }

    public record Training(int labeled, int addedSince, int classes) {
    }

    /** Diagnoses with exactly one decisive opinion: the verdict, the class and when the last review was saved. */
    private static final String DECIDED = """
            WITH decided AS (
                SELECT r.diagnosis_id, min(r.verdict) AS verdict, min(r.correct_code) AS code,
                       max(r.updated_at) AS decided_at
                FROM diagnosis_reviews r
                WHERE r.verdict <> 'unclear'
                GROUP BY r.diagnosis_id
                HAVING count(DISTINCT r.verdict || ':' || r.correct_code) = 1
            )
            """;

    private final JdbcTemplate jdbc;

    public AiQualityRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Number of diagnoses since {@code since} per confidence bucket: 0–10 %, 10–20 %, … 90–100 %. */
    public int[] confidenceHistogram(Instant since) {
        int[] counts = new int[HISTOGRAM_BUCKETS];
        jdbc.query("""
                SELECT least(floor(top1_confidence * 10), 9)::int AS bucket, count(*) AS n
                FROM diagnoses WHERE created_at >= ? GROUP BY bucket""", rs -> {
            counts[rs.getInt("bucket")] = rs.getInt("n");
        }, Timestamp.from(since));
        return counts;
    }

    /**
     * The diseases the model named most since {@code since}, among answers it stood behind. Healthy classes and
     * {@code unknown} are not diseases and are left out.
     */
    public List<ClassCount> topDiseases(Instant since, String lang, int limit) {
        return jdbc.query("""
                SELECT d.top1_code AS code, coalesce(c.names ->> ?, d.top1_code) AS name, d.n
                FROM (SELECT top1_code, count(*) AS n FROM diagnoses
                       WHERE created_at >= ? AND status IN ('ok', 'low_confidence')
                         AND top1_code <> 'unknown'
                       GROUP BY top1_code) d
                LEFT JOIN diseases c ON c.code = d.top1_code
                WHERE c.kind IS NULL OR c.kind <> 'healthy'
                ORDER BY d.n DESC, d.top1_code
                LIMIT ?""", (rs, i) -> new ClassCount(rs.getString("code"), rs.getString("name"), rs.getInt("n")),
                lang, Timestamp.from(since), limit);
    }

    /**
     * Photos with an expert decision (all time), how many were decided since {@code weekAgo} and how many
     * classes they cover.
     */
    public Training training(Instant weekAgo) {
        return jdbc.queryForObject(DECIDED + """
                SELECT count(*) AS labeled,
                       count(*) FILTER (WHERE decided_at >= ?) AS added,
                       count(DISTINCT code) AS classes
                FROM decided""", (rs, i) -> new Training(rs.getInt("labeled"), rs.getInt("added"),
                rs.getInt("classes")), Timestamp.from(weekAgo));
    }

    /** Pairs "the model said A, the experts decided B" for diagnoses made since {@code since}, most frequent first. */
    public List<Mismatch> mismatches(Instant since, String lang, int limit) {
        return jdbc.query(DECIDED + """
                SELECT g.top1_code AS ai_code, coalesce(a.names ->> ?, g.top1_code) AS ai_name,
                       x.code AS confirmed_code, coalesce(b.names ->> ?, x.code) AS confirmed_name,
                       count(*) AS cases
                FROM decided x
                JOIN diagnoses g ON g.id = x.diagnosis_id
                LEFT JOIN diseases a ON a.code = g.top1_code
                LEFT JOIN diseases b ON b.code = x.code
                WHERE g.created_at >= ? AND g.status IN ('ok', 'low_confidence') AND x.code <> g.top1_code
                GROUP BY g.top1_code, a.names, x.code, b.names
                ORDER BY cases DESC, g.top1_code, x.code
                LIMIT ?""", (rs, i) -> new Mismatch(rs.getString("ai_code"), rs.getString("ai_name"),
                rs.getString("confirmed_code"), rs.getString("confirmed_name"), rs.getInt("cases")),
                lang, lang, Timestamp.from(since), limit);
    }
}
