package kz.agroadvisor.shops.repository;

import java.math.BigDecimal;
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
 * The admin's view of the shop directory and of the reports farmers send about it. Plain SQL like the farmer's
 * {@code ShopService}; the region and the district are names in the asked language.
 */
@Repository
public class ShopAdminRepository {

    public record ShopRow(UUID id, String name, String address, String phone, String hours,
            List<String> categories, BigDecimal latitude, BigDecimal longitude, Long regionId, String region,
            Long districtId, String district, String status, Instant createdAt, Instant updatedAt) {
    }

    /** What the admin writes; {@code categories} are already checked codes. */
    public record ShopInput(String name, String address, String phone, String hours, List<String> categories,
            BigDecimal latitude, BigDecimal longitude, Long regionId, Long districtId) {
    }

    public record RequestRow(UUID id, String type, String status, String comment, BigDecimal latitude,
            BigDecimal longitude, UUID shopId, String shopName, UUID authorId, String authorName,
            String authorRegion, Instant createdAt) {
    }

    public record Stats(int total, int active, int addedThisMonth, int pendingRequests) {
    }

    private static final String SHOP_SELECT = """
            SELECT s.id, s.name, s.address, s.phone, s.hours, s.categories, s.latitude, s.longitude,
                   s.region_id, r.names ->> ? AS region_name, s.district_id, d.names ->> ? AS district_name,
                   s.status, s.created_at, s.updated_at
            FROM shops s
            LEFT JOIN regions r ON r.id = s.region_id
            LEFT JOIN districts d ON d.id = s.district_id
            """;

    private static final RowMapper<ShopRow> SHOP = (rs, i) -> new ShopRow(rs.getObject("id", UUID.class),
            rs.getString("name"), rs.getString("address"), rs.getString("phone"), rs.getString("hours"),
            categories(rs), rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"),
            rs.getObject("region_id", Long.class), rs.getString("region_name"),
            rs.getObject("district_id", Long.class), rs.getString("district_name"), rs.getString("status"),
            instant(rs, "created_at"), instant(rs, "updated_at"));

    private static final RowMapper<RequestRow> REQUEST = (rs, i) -> new RequestRow(
            rs.getObject("id", UUID.class), rs.getString("type"), rs.getString("status"), rs.getString("comment"),
            rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"), rs.getObject("shop_id", UUID.class),
            rs.getString("shop_name"), rs.getObject("author_id", UUID.class), rs.getString("author_name"),
            rs.getString("author_region"), instant(rs, "created_at"));

    private static final String REQUEST_SELECT = """
            SELECT q.id, q.type, q.status, q.comment, q.latitude, q.longitude, q.shop_id, q.created_at,
                   s.name AS shop_name, u.id AS author_id, u.full_name AS author_name,
                   r.names ->> ? AS author_region
            FROM shop_requests q
            JOIN users u ON u.id = q.author_id
            LEFT JOIN shops s ON s.id = q.shop_id
            LEFT JOIN regions r ON r.id = u.region_id
            """;

    private final JdbcTemplate jdbc;

    public ShopAdminRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** By name; {@code search} matches part of the name or the address without regard to case. */
    public List<ShopRow> list(String search, Long regionId, String status, String lang, int limit, int offset) {
        StringBuilder sql = new StringBuilder(SHOP_SELECT).append(" WHERE true\n");
        List<Object> args = new ArrayList<>(List.of(lang, lang));
        String query = search == null ? "" : search.trim();
        if (!query.isEmpty()) {
            sql.append(" AND (s.name ILIKE ? ESCAPE '\\' OR s.address ILIKE ? ESCAPE '\\')\n");
            String like = "%" + escape(query) + "%";
            args.add(like);
            args.add(like);
        }
        if (regionId != null) {
            sql.append(" AND s.region_id = ?\n");
            args.add(regionId);
        }
        if (status != null) {
            sql.append(" AND s.status = ?\n");
            args.add(status);
        }
        sql.append(" ORDER BY lower(s.name), s.id LIMIT ? OFFSET ?");
        args.add(limit);
        args.add(offset);
        return jdbc.query(sql.toString(), SHOP, args.toArray());
    }

    public Optional<ShopRow> find(UUID id, String lang) {
        return jdbc.query(SHOP_SELECT + " WHERE s.id = ?", SHOP, lang, lang, id).stream().findFirst();
    }

    public UUID insert(ShopInput in) {
        return jdbc.queryForObject("""
                INSERT INTO shops (name, address, phone, hours, categories, latitude, longitude, region_id,
                                   district_id)
                VALUES (?, ?, ?, ?, ?::text[], ?, ?, ?, ?) RETURNING id""", UUID.class, in.name(), in.address(),
                in.phone(), in.hours(), in.categories().toArray(String[]::new), in.latitude(), in.longitude(),
                in.regionId(), in.districtId());
    }

    /** False when there is no such shop. */
    public boolean update(UUID id, ShopInput in) {
        return jdbc.update("""
                UPDATE shops SET name = ?, address = ?, phone = ?, hours = ?, categories = ?::text[],
                       latitude = ?, longitude = ?, region_id = ?, district_id = ?, updated_at = now()
                WHERE id = ?""", in.name(), in.address(), in.phone(), in.hours(),
                in.categories().toArray(String[]::new), in.latitude(), in.longitude(), in.regionId(),
                in.districtId(), id) > 0;
    }

    /** False when there is no such shop. */
    public boolean updateStatus(UUID id, String status) {
        return jdbc.update("UPDATE shops SET status = ?, updated_at = now() WHERE id = ?", status, id) > 0;
    }

    /** The region of a district, empty when there is no such district. */
    public Optional<Long> districtRegion(long districtId) {
        return jdbc.query("SELECT region_id FROM districts WHERE id = ?", (rs, i) -> rs.getLong(1), districtId)
                .stream().findFirst();
    }

    public boolean regionExists(long regionId) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM regions WHERE id = ?)", Boolean.class, regionId));
    }

    /** Newest first; {@code status} may be null. */
    public List<RequestRow> requests(String status, String lang, int limit, int offset) {
        StringBuilder sql = new StringBuilder(REQUEST_SELECT);
        List<Object> args = new ArrayList<>(List.of(lang));
        if (status != null) {
            sql.append(" WHERE q.status = ?\n");
            args.add(status);
        }
        sql.append(" ORDER BY q.created_at DESC, q.id DESC LIMIT ? OFFSET ?");
        args.add(limit);
        args.add(offset);
        return jdbc.query(sql.toString(), REQUEST, args.toArray());
    }

    public Optional<RequestRow> findRequest(UUID id, String lang) {
        return jdbc.query(REQUEST_SELECT + " WHERE q.id = ?", REQUEST, lang, id).stream().findFirst();
    }

    /** Locks the report and returns its status; empty when there is no such report. */
    public Optional<String> lockRequest(UUID id) {
        return jdbc.query("SELECT status FROM shop_requests WHERE id = ? FOR UPDATE", (rs, i) -> rs.getString(1), id)
                .stream().findFirst();
    }

    public void updateRequestStatus(UUID id, String status) {
        jdbc.update("UPDATE shop_requests SET status = ? WHERE id = ?", status, id);
    }

    public Stats stats(Instant monthStart) {
        return jdbc.queryForObject("""
                SELECT (SELECT count(*) FROM shops) AS total,
                       (SELECT count(*) FROM shops WHERE status = 'active') AS active,
                       (SELECT count(*) FROM shops WHERE created_at >= ?) AS added,
                       (SELECT count(*) FROM shop_requests WHERE status = 'new') AS pending""",
                (rs, i) -> new Stats(rs.getInt("total"), rs.getInt("active"), rs.getInt("added"),
                        rs.getInt("pending")),
                java.sql.Timestamp.from(monthStart));
    }

    private static List<String> categories(ResultSet rs) throws SQLException {
        java.sql.Array array = rs.getArray("categories");
        return array == null ? List.of() : List.of((String[]) array.getArray());
    }

    private static String escape(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
