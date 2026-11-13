package kz.agroadvisor.verification.repository;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import kz.agroadvisor.verification.model.Specialization;
import kz.agroadvisor.verification.model.SpecializationsConverter;

/**
 * Agrochemists a farmer may see: an approved profile, an active account and the agrochemist role. One query per
 * call, the crops come back as an array, so a page costs one round trip.
 */
@Repository
public class AgrochemistDirectoryRepository {

    /** A card of the directory. The phone and the e-mail are not here on purpose. */
    public record Card(UUID id, String fullName, List<String> specializations, Integer experienceYears,
            Long regionId, List<String> crops, Instant verifiedAt) {
    }

    private static final String SELECT = """
            SELECT u.id, u.full_name, u.region_id, p.specialization, p.experience_years, p.reviewed_at,
                   ARRAY(SELECT c.crop_code FROM agrochemist_crops c WHERE c.user_id = u.id
                         ORDER BY c.crop_code) AS crops
            FROM agrochemist_profiles p
            JOIN users u ON u.id = p.user_id
            WHERE p.verified AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role_code = 'agrochemist')
            """;

    private static final String ORDER = " ORDER BY p.experience_years DESC NULLS LAST, u.full_name, u.id";

    private static final SpecializationsConverter SPECIALIZATIONS = new SpecializationsConverter();

    private static final RowMapper<Card> CARD = (rs, i) -> new Card(rs.getObject("id", UUID.class),
            rs.getString("full_name"),
            SPECIALIZATIONS.convertToEntityAttribute(rs.getString("specialization")).stream()
                    .map(Specialization::code).toList(),
            nullableInt(rs, "experience_years"), nullableLong(rs, "region_id"), strings(rs.getArray("crops")),
            instant(rs, "reviewed_at"));

    private final JdbcTemplate jdbc;

    public AgrochemistDirectoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** One page, most experienced first. Both filters are optional. */
    public List<Card> list(String crop, Long regionId, int limit, long offset) {
        StringBuilder sql = new StringBuilder(SELECT);
        List<Object> args = new ArrayList<>();
        if (crop != null) {
            sql.append(" AND EXISTS (SELECT 1 FROM agrochemist_crops f WHERE f.user_id = u.id AND f.crop_code = ?)");
            args.add(crop);
        }
        if (regionId != null) {
            sql.append(" AND u.region_id = ?");
            args.add(regionId);
        }
        sql.append(ORDER).append(" LIMIT ? OFFSET ?");
        args.add(limit);
        args.add(offset);
        return jdbc.query(sql.toString(), CARD, args.toArray());
    }

    public Optional<Card> find(UUID id) {
        return jdbc.query(SELECT + " AND u.id = ?", CARD, id).stream().findFirst();
    }

    private static List<String> strings(Array array) throws SQLException {
        return List.of((String[]) array.getArray());
    }

    private static Integer nullableInt(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static Long nullableLong(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var ts = rs.getTimestamp(column);
        return ts == null ? null : ts.toInstant();
    }
}
