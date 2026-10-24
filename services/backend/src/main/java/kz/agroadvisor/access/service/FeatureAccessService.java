package kz.agroadvisor.access.service;

import java.util.UUID;

import kz.agroadvisor.common.web.ApiException;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/**
 * "May this user use feature X". Business code asks this instead of checking roles, so paid plans can
 * be added later. Deny by default: access exists only when the user's plan explicitly lists the feature.
 *
 * <p>Users are not linked to a plan yet (the {@code user_subscription} table is deferred), so everyone is
 * explicitly on {@link #DEFAULT_PLAN}. Plan features with a daily limit are denied until
 * counting uses is implemented; today every FREE feature is unlimited.
 *
 * <p>Usage: {@code @PreAuthorize("@featureAccess.allows(authentication, 'diagnosis')")}.
 */
@Service("featureAccess")
public class FeatureAccessService {

    public static final String DEFAULT_PLAN = "FREE";
    public static final String NOT_AVAILABLE = "feature_not_available";

    private final JdbcTemplate jdbc;

    public FeatureAccessService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public String planOf(UUID userId) {
        return DEFAULT_PLAN;
    }

    public boolean isAllowed(UUID userId, String featureCode) {
        if (userId == null || featureCode == null || featureCode.isBlank()) {
            return false;
        }
        Integer rows = jdbc.queryForObject("""
                SELECT count(*) FROM plan_feature
                WHERE plan_code = ? AND feature_code = ? AND daily_limit IS NULL
                """, Integer.class, planOf(userId), featureCode);
        return rows != null && rows > 0;
    }

    public void require(UUID userId, String featureCode) {
        if (!isAllowed(userId, featureCode)) {
            throw new ApiException(HttpStatus.FORBIDDEN, NOT_AVAILABLE, "This feature is not available on your plan");
        }
    }

    /** For method security. */
    public boolean allows(Authentication authentication, String featureCode) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return false;
        }
        try {
            return isAllowed(UUID.fromString(authentication.getName()), featureCode);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
