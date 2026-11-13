package kz.agroadvisor.fields.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import kz.agroadvisor.users.service.UserService;

/**
 * Finds the region and the district of a field on the server. A point inside a district outline gives that
 * district and its region. Without a point, or when no outline holds it (the outlines are filled in later),
 * the region is the one from the owner's profile and the district stays empty. Nothing is guessed.
 */
@Component
public class FieldPlacement {

    /** Both ids are null when nothing is known. */
    public record Place(Long regionId, Long districtId) {
    }

    private static final String DISTRICT_AT_POINT = """
            SELECT id, region_id FROM districts
            WHERE boundary IS NOT NULL
              AND ST_Within(ST_SetSRID(ST_MakePoint(?::float8, ?::float8), 4326), boundary)
            ORDER BY id
            LIMIT 1
            """;

    private final JdbcTemplate jdbc;
    private final UserService users;

    public FieldPlacement(JdbcTemplate jdbc, UserService users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    /** Takes part in the transaction of the caller. */
    public Place place(UUID owner, BigDecimal latitude, BigDecimal longitude) {
        if (latitude != null && longitude != null) {
            List<Place> found = jdbc.query(DISTRICT_AT_POINT,
                    (rs, row) -> new Place(rs.getLong("region_id"), rs.getLong("id")), longitude, latitude);
            if (!found.isEmpty()) {
                return found.get(0);
            }
        }
        return new Place(users.regionOf(owner).orElse(null), null);
    }
}
