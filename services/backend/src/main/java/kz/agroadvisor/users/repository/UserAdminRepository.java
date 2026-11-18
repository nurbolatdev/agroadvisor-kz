package kz.agroadvisor.users.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * The admin's view of farmers and agrochemists: one row per user with the region, the district and the
 * number of diagnoses. Administrators never appear here.
 */
@Repository
public class UserAdminRepository {

    /** {@code role} is {@code farmer} or {@code agrochemist}; {@code region} and {@code district} are names in the asked language. */
    public record Row(UUID id, String fullName, String role, String region, String district, String status,
            Instant registeredAt, int diagnosesCount) {
    }

    private static final RowMapper<Row> ROW = (rs, i) -> new Row(rs.getObject("id", UUID.class),
            rs.getString("full_name"), rs.getString("role"), rs.getString("region_name"),
            rs.getString("district_name"), rs.getString("status"), instant(rs, "created_at"),
            rs.getInt("diagnoses_count"));

    /** A farmer or an agrochemist (V17: never both), and not an administrator. */
    private static final String SELECT = """
            SELECT u.id, u.full_name, u.status, u.created_at,
                   (SELECT ur.role_code FROM user_roles ur
                     WHERE ur.user_id = u.id AND ur.role_code IN ('farmer', 'agrochemist')
                     LIMIT 1) AS role,
                   r.names ->> ? AS region_name,
                   d.names ->> ? AS district_name,
                   (SELECT count(*) FROM diagnoses dg WHERE dg.user_id = u.id) AS diagnoses_count
            FROM users u
            LEFT JOIN regions r ON r.id = u.region_id
            LEFT JOIN districts d ON d.id = u.district_id
            WHERE EXISTS (SELECT 1 FROM user_roles ur
                           WHERE ur.user_id = u.id AND ur.role_code IN ('farmer', 'agrochemist'))
              AND NOT EXISTS (SELECT 1 FROM user_roles ad WHERE ad.user_id = u.id AND ad.role_code = 'admin')
            """;

    private final JdbcTemplate jdbc;

    public UserAdminRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Newest first. {@code role} and {@code search} may be null. The search matches part of the name or of
     * the e-mail without regard to case, and part of the phone by its digits.
     */
    public List<Row> list(String role, String search, String lang, int limit, int offset) {
        StringBuilder sql = new StringBuilder(SELECT);
        List<Object> args = new ArrayList<>();
        args.add(lang);
        args.add(lang);
        if (role != null) {
            sql.append(" AND EXISTS (SELECT 1 FROM user_roles f WHERE f.user_id = u.id AND f.role_code = ?)\n");
            args.add(role);
        }
        String query = search == null ? "" : search.trim();
        if (!query.isEmpty()) {
            String like = "%" + escape(query) + "%";
            sql.append(" AND (u.full_name ILIKE ? ESCAPE '\\' OR lower(u.email) LIKE ? ESCAPE '\\'");
            args.add(like);
            args.add(like.toLowerCase(java.util.Locale.ROOT));
            String digits = query.replaceAll("\\D", "");
            if (!digits.isEmpty()) {
                sql.append(" OR replace(u.phone, '+', '') LIKE ?");
                args.add("%" + digits + "%");
            }
            sql.append(")\n");
        }
        sql.append(" ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?");
        args.add(limit);
        args.add(offset);
        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    /** One user in the same shape as the list; empty for an unknown id or an administrator. */
    public Optional<Row> find(UUID id, String lang) {
        return jdbc.query(SELECT + " AND u.id = ?", ROW, lang, lang, id).stream().findFirst();
    }

    /**
     * Locks the row of the user until the end of the transaction. Empty when there is no such user, otherwise
     * whether the user is an administrator.
     */
    public Optional<Boolean> lockForStatusChange(UUID id) {
        return jdbc.query("""
                SELECT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_code = 'admin')
                FROM users u WHERE u.id = ? FOR UPDATE OF u
                """, (rs, i) -> rs.getBoolean(1), id).stream().findFirst();
    }

    public void updateStatus(UUID id, String status) {
        jdbc.update("UPDATE users SET status = ?, updated_at = now() WHERE id = ?", status, id);
    }

    private static String escape(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
