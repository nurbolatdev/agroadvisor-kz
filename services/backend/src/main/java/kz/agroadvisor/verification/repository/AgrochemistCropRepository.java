package kz.agroadvisor.verification.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** The crops an agrochemist works with ({@code agrochemist_crops}, V3). */
@Repository
public class AgrochemistCropRepository {

    private final JdbcTemplate jdbc;

    public AgrochemistCropRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The crop codes of the agrochemist in alphabetical order. */
    public List<String> findCodes(UUID userId) {
        return jdbc.queryForList("SELECT crop_code FROM agrochemist_crops WHERE user_id = ? ORDER BY crop_code",
                String.class, userId);
    }

    /** How many of the given codes exist in the catalog of crops. */
    public int countKnown(List<String> codes) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM crops WHERE code = ANY (?)", Integer.class,
                (Object) codes.toArray(String[]::new));
        return count == null ? 0 : count;
    }

    public void deleteAll(UUID userId) {
        jdbc.update("DELETE FROM agrochemist_crops WHERE user_id = ?", userId);
    }

    public void insert(UUID userId, List<String> codes) {
        jdbc.batchUpdate("INSERT INTO agrochemist_crops (user_id, crop_code) VALUES (?, ?)", codes, codes.size(),
                (ps, code) -> {
                    ps.setObject(1, userId);
                    ps.setString(2, code);
                });
    }
}
