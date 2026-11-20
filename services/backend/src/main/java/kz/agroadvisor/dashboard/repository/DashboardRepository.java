package kz.agroadvisor.dashboard.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Read-only aggregates for the admin overview screen. Plain SQL; nothing here writes. */
@Repository
public class DashboardRepository {

    /** What the diagnoses of a window [from, to) add up to. */
    public record DiagnosisTotals(int diagnoses, int activeUsers, Double avgConfidence, int lowConfidence) {
    }

    public record DayCount(LocalDate date, int count) {
    }

    public record SignupBucket(int bucket, int farmers, int agrochemists) {
    }

    private final JdbcTemplate jdbc;

    public DashboardRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Diagnoses in [from, to), the distinct users who made them, their mean confidence (0–1, null when there are
     * none) and how many were below {@code threshold} (0–1).
     */
    public DiagnosisTotals totals(Instant from, Instant to, double threshold) {
        return jdbc.queryForObject("""
                SELECT count(*) AS n, count(DISTINCT user_id) AS users, avg(top1_confidence) AS avg_conf,
                       count(*) FILTER (WHERE top1_confidence < ?) AS low
                FROM diagnoses WHERE created_at >= ? AND created_at < ?""", (rs, i) -> {
                    double avg = rs.getDouble("avg_conf");
                    return new DiagnosisTotals(rs.getInt("n"), rs.getInt("users"), rs.wasNull() ? null : avg,
                            rs.getInt("low"));
                }, threshold, Timestamp.from(from), Timestamp.from(to));
    }

    /** Diagnoses per UTC day in [from, to); days without any are left out. */
    public List<DayCount> perDay(Instant from, Instant to) {
        return jdbc.query("""
                SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
                FROM diagnoses WHERE created_at >= ? AND created_at < ?
                GROUP BY day ORDER BY day""", (rs, i) -> new DayCount(rs.getObject("day", LocalDate.class),
                rs.getInt("n")), Timestamp.from(from), Timestamp.from(to));
    }

    /** Diagnoses per 7-day week counted from {@code from} (day 0): week 0, 1, … in [from, to). */
    public List<DayCount> perWeek(Instant from, Instant to) {
        return jdbc.query("""
                SELECT (?::timestamptz AT TIME ZONE 'UTC')::date
                         + 7 * floor(extract(epoch FROM created_at - ?::timestamptz) / 604800)::int AS day,
                       count(*) AS n
                FROM diagnoses WHERE created_at >= ? AND created_at < ?
                GROUP BY day ORDER BY day""", (rs, i) -> new DayCount(rs.getObject("day", LocalDate.class),
                rs.getInt("n")), Timestamp.from(from), Timestamp.from(from), Timestamp.from(from),
                Timestamp.from(to));
    }

    /** New accounts per 7-day week counted from {@code from}: bucket 1, 2, … (weeks) in [from, to). */
    public List<SignupBucket> signupsPerWeek(Instant from, Instant to) {
        return signups("1 + floor(extract(epoch FROM u.created_at - ?::timestamptz) / 604800)::int",
                Timestamp.from(from), from, to);
    }

    /** New accounts per calendar month (UTC, 0 = January) in [from, to). */
    public List<SignupBucket> signupsPerMonth(Instant from, Instant to) {
        return signups("extract(month FROM u.created_at AT TIME ZONE 'UTC')::int - 1", null, from, to);
    }

    private List<SignupBucket> signups(String bucketExpr, Timestamp bucketArg, Instant from, Instant to) {
        String sql = "SELECT " + bucketExpr + " AS bucket,"
                + " count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id"
                + "   AND r.role_code = 'farmer')) AS farmers,"
                + " count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id"
                + "   AND r.role_code = 'agrochemist')) AS agrochemists"
                + " FROM users u WHERE u.created_at >= ? AND u.created_at < ?"
                + " AND NOT EXISTS (SELECT 1 FROM user_roles a WHERE a.user_id = u.id AND a.role_code = 'admin')"
                + " GROUP BY bucket ORDER BY bucket";
        List<Object> args = new ArrayList<>();
        if (bucketArg != null) {
            args.add(bucketArg);
        }
        args.add(Timestamp.from(from));
        args.add(Timestamp.from(to));
        return jdbc.query(sql, (rs, i) -> new SignupBucket(rs.getInt("bucket"), rs.getInt("farmers"),
                rs.getInt("agrochemists")), args.toArray());
    }

    /** Agrochemist applications waiting for the admin's decision. */
    public int pendingVerifications() {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM agrochemist_profiles WHERE verification_status = 'pending'", Integer.class);
        return n == null ? 0 : n;
    }
}
