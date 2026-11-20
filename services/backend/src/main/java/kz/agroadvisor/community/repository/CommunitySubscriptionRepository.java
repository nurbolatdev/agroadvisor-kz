package kz.agroadvisor.community.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Crop subscriptions of the users ({@code community_crop_subscriptions}, V25). */
@Repository
public class CommunitySubscriptionRepository {

    private final JdbcTemplate jdbc;

    public CommunitySubscriptionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Crop codes of the user in alphabetical order. */
    public List<String> list(UUID userId) {
        return jdbc.queryForList(
                "SELECT crop_code FROM community_crop_subscriptions WHERE user_id = ? ORDER BY crop_code",
                String.class, userId);
    }

    /** How many of the codes are crops of the catalogue. */
    public int countKnownCrops(List<String> codes) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM crops WHERE code = ANY (?)", Integer.class,
                (Object) codes.toArray(new String[0]));
        return count == null ? 0 : count;
    }

    public void deleteAll(UUID userId) {
        jdbc.update("DELETE FROM community_crop_subscriptions WHERE user_id = ?", userId);
    }

    public void insert(UUID userId, String cropCode) {
        jdbc.update("INSERT INTO community_crop_subscriptions (user_id, crop_code) VALUES (?, ?)", userId,
                cropCode);
    }
}
