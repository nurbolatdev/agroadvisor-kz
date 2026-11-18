package kz.agroadvisor.shops.service;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;

/**
 * The agro shops a farmer sees on the map and the reports a farmer sends about them. Shops are added and
 * changed by an admin; only active shops are shown. The points are searched with the GiST index of
 * {@code shops.location}, and the distance is measured on the spheroid (metres).
 */
@Service
public class ShopService {

    public static final int DEFAULT_RADIUS_KM = 10;
    public static final int MAX_RADIUS_KM = 100;
    public static final int DEFAULT_LIMIT = 50;
    public static final int MAX_LIMIT = 100;
    /** Reports one farmer may send in an hour; every attempt counts and none is given back. */
    public static final int MAX_REQUESTS_PER_HOUR = 10;
    public static final int MAX_COMMENT_LENGTH = 1000;

    /** What a report is about. */
    public static final Set<String> REQUEST_TYPES = Set.of("new_shop", "wrong_info", "closed");

    /** A shop as the API shows it; {@code distanceM} is set only for a search around a point. */
    public record ShopView(UUID id, String name, String address, String phone, String hours,
            List<String> categories, BigDecimal latitude, BigDecimal longitude, Long distanceM) {
    }

    /** A report as the API shows it. */
    public record ShopRequestView(UUID id, String type, UUID shopId, String status, Instant createdAt) {
    }

    /** What the farmer wrote; the point and the shop depend on the type. */
    public record NewShopRequest(String type, UUID shopId, String comment, BigDecimal latitude,
            BigDecimal longitude) {
    }

    private static final String COLUMNS = "id, name, address, phone, hours, categories, latitude, longitude";

    private final JdbcTemplate jdbc;
    private final RateLimiter rateLimiter;

    public ShopService(JdbcTemplate jdbc, RateLimiter rateLimiter) {
        this.jdbc = jdbc;
        this.rateLimiter = rateLimiter;
    }

    /** Active shops around a point, nearest first. */
    @Transactional(readOnly = true)
    public List<ShopView> nearby(BigDecimal latitude, BigDecimal longitude, int radiusKm, int limit) {
        requirePoint(latitude, longitude);
        if (radiusKm < 1 || radiusKm > MAX_RADIUS_KM || limit < 1 || limit > MAX_LIMIT) {
            throw invalid("radiusKm must be 1 to " + MAX_RADIUS_KM + " and limit 1 to " + MAX_LIMIT);
        }
        double lat = latitude.doubleValue();
        double lon = longitude.doubleValue();
        // A box in degrees uses the index, then the exact distance in metres cuts the corners. The box is
        // wider in longitude the further north the point is, so the cosine is kept away from zero.
        double boxDegrees = radiusKm / (111.0 * Math.max(Math.cos(Math.toRadians(lat)), 0.05));
        return jdbc.query("""
                SELECT %s, dist.metres
                FROM shops
                CROSS JOIN LATERAL (SELECT ST_Distance(location::geography,
                        ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) AS metres) dist
                WHERE status = 'active'
                  AND location && ST_Expand(ST_SetSRID(ST_MakePoint(?, ?), 4326), ?)
                  AND dist.metres <= ?
                ORDER BY dist.metres, id
                LIMIT ?
                """.formatted(COLUMNS), withDistance(), lon, lat, lon, lat, boxDegrees, radiusKm * 1000.0, limit);
    }

    /** An active shop; a hidden or missing one is a 404. */
    @Transactional(readOnly = true)
    public ShopView get(UUID id) {
        return find(id).orElseThrow(ShopService::notFound);
    }

    /**
     * A farmer reports a new shop, wrong information, or a closed shop. A new shop needs a point and no shop;
     * the other two need an active shop.
     */
    @Transactional
    public ShopRequestView request(UUID author, NewShopRequest input) {
        if (input.type() == null || !REQUEST_TYPES.contains(input.type())) {
            throw invalid("type must be one of " + String.join(", ", REQUEST_TYPES.stream().sorted().toList()));
        }
        String comment = input.comment() == null ? "" : input.comment().strip();
        if (comment.isEmpty() || comment.length() > MAX_COMMENT_LENGTH || hasControlChars(comment)) {
            throw invalid("The comment must have 1 to " + MAX_COMMENT_LENGTH + " characters");
        }
        boolean isNew = input.type().equals("new_shop");
        if (isNew) {
            if (input.shopId() != null) {
                throw invalid("A new shop has no shopId");
            }
            requirePoint(input.latitude(), input.longitude());
        } else {
            if (input.shopId() == null) {
                throw invalid("shopId is required");
            }
            if (input.latitude() != null || input.longitude() != null) {
                throw invalid("Only a new shop has a point");
            }
        }
        rateLimiter.check("shop-requests", author.toString(), MAX_REQUESTS_PER_HOUR, Duration.ofHours(1));
        if (!isNew) {
            get(input.shopId()); // a hidden or missing shop is a 404
        }
        return jdbc.queryForObject("""
                INSERT INTO shop_requests (author_id, type, shop_id, comment, latitude, longitude)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id, type, shop_id, status, created_at
                """, (rs, row) -> new ShopRequestView(rs.getObject("id", UUID.class), rs.getString("type"),
                        rs.getObject("shop_id", UUID.class), rs.getString("status"),
                        rs.getTimestamp("created_at").toInstant()),
                author, input.type(), input.shopId(), comment, input.latitude(), input.longitude());
    }

    private Optional<ShopView> find(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM shops WHERE id = ? AND status = 'active'",
                (rs, row) -> shop(rs, null), id).stream().findFirst();
    }

    private static RowMapper<ShopView> withDistance() {
        return (rs, row) -> shop(rs, Math.round(rs.getDouble("metres")));
    }

    private static ShopView shop(ResultSet rs, Long distanceM) throws SQLException {
        Array categories = rs.getArray("categories");
        List<String> codes = categories == null ? List.of() : List.of((String[]) categories.getArray());
        return new ShopView(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("address"),
                rs.getString("phone"), rs.getString("hours"), codes, rs.getBigDecimal("latitude"),
                rs.getBigDecimal("longitude"), distanceM);
    }

    private static void requirePoint(BigDecimal latitude, BigDecimal longitude) {
        if (latitude == null || longitude == null || latitude.abs().compareTo(BigDecimal.valueOf(90)) > 0
                || longitude.abs().compareTo(BigDecimal.valueOf(180)) > 0) {
            throw invalid("latitude must be -90 to 90 and longitude -180 to 180");
        }
    }

    private static boolean hasControlChars(String text) {
        return text.chars().anyMatch(c -> Character.isISOControl(c) && c != '\n');
    }

    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, message);
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, ShopErrors.SHOP_NOT_FOUND, "Shop not found");
    }
}
