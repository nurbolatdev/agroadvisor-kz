package kz.agroadvisor.verification.service;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Verification status of agrochemists. The status lives in {@code agrochemist_profiles}, not in the
 * role: the {@code agrochemist} role alone gives no right that needs a confirmed diploma. Operations
 * that do need it check {@link #isApproved} against the database on every call.
 *
 * <p>Usage: {@code @PreAuthorize("@agrochemistVerification.isApproved(authentication)")}.
 */
@Service("agrochemistVerification")
public class AgrochemistVerificationService {

    private final JdbcTemplate jdbc;

    public AgrochemistVerificationService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Creates the profile with status {@code pending}; documents are uploaded later. */
    @Transactional
    public void createPendingProfile(UUID userId) {
        jdbc.update("INSERT INTO agrochemist_profiles (user_id) VALUES (?)", userId);
    }

    @Transactional(readOnly = true)
    public boolean isApproved(UUID userId) {
        Boolean verified = jdbc.query("SELECT verified FROM agrochemist_profiles WHERE user_id = ?",
                rs -> rs.next() ? rs.getBoolean(1) : null, userId);
        return Boolean.TRUE.equals(verified);
    }

    /** For method security: authenticated agrochemist whose documents an admin has approved. */
    public boolean isApproved(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()
                || authentication.getAuthorities().stream().noneMatch(a -> a.getAuthority().equals("ROLE_AGROCHEMIST"))) {
            return false;
        }
        try {
            return isApproved(UUID.fromString(authentication.getName()));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
