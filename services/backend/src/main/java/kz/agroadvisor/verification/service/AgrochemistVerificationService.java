package kz.agroadvisor.verification.service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.web.ApiException;

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

    /** What an agrochemist can name as the field of work at registration; the app shows a label per code. */
    public static final Set<String> SPECIALIZATIONS =
            Set.of("plant_protection", "agrochemistry", "phytopathology", "soil_science");

    /** The most specializations one profile can have (the column holds up to 160 characters). */
    public static final int MAX_SPECIALIZATIONS = 4;

    /** The most years of experience the column accepts (a database check, V3). */
    public static final int MAX_EXPERIENCE_YEARS = 80;

    /**
     * Checks the optional profile fields of a registration before anything is written. Both are optional for an
     * agrochemist and not allowed for anyone else.
     */
    public void validateProfileFields(boolean agrochemist, List<String> specializations, Integer experienceYears) {
        boolean sent = (specializations != null && !specializations.isEmpty()) || experienceYears != null;
        if (!sent) {
            return;
        }
        if (!agrochemist) {
            throw invalidFields("Specializations and experience are only for an agrochemist");
        }
        if (specializations != null) {
            if (specializations.size() > MAX_SPECIALIZATIONS || new HashSet<>(specializations).size() != specializations.size()
                    || !SPECIALIZATIONS.containsAll(specializations)) {
                throw invalidFields("Specializations must be up to " + MAX_SPECIALIZATIONS
                        + " different values of " + new TreeSet<>(SPECIALIZATIONS));
            }
        }
        if (experienceYears != null && (experienceYears < 0 || experienceYears > MAX_EXPERIENCE_YEARS)) {
            throw invalidFields("Experience must be between 0 and " + MAX_EXPERIENCE_YEARS + " years");
        }
    }

    private static ApiException invalidFields(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, VerificationErrors.INVALID_PROFILE_FIELDS, message);
    }

    /** Creates the profile with status {@code pending}; documents are uploaded later. */
    @Transactional
    public void createPendingProfile(UUID userId, List<String> specializations, Integer experienceYears) {
        String stored = specializations == null || specializations.isEmpty() ? null : String.join(",", specializations);
        jdbc.update("INSERT INTO agrochemist_profiles (user_id, specialization, experience_years) VALUES (?, ?, ?)",
                userId, stored, experienceYears);
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
