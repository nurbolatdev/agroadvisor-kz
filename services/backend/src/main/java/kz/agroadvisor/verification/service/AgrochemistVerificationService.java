package kz.agroadvisor.verification.service;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.verification.model.Specialization;
import kz.agroadvisor.verification.model.SpecializationsConverter;

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

    /** The most specializations one profile can have: all of them. */
    public static final int MAX_SPECIALIZATIONS = Specialization.values().length;

    /** The most years of experience the column accepts (a database check, V3). */
    public static final int MAX_EXPERIENCE_YEARS = 80;

    private static final SpecializationsConverter SPECIALIZATIONS = new SpecializationsConverter();

    /** What an agrochemist gives at registration; checked as a whole before anything is written. */
    public record ProfileFields(Set<Specialization> specializations, int experienceYears) {
    }

    /**
     * Checks the profile fields of a registration before anything is written. An agrochemist must give at least
     * one specialization (different, from the known ones) and the years of experience (0-80); a farmer must give
     * neither.
     *
     * @return the checked fields for an agrochemist, {@code null} for a farmer
     */
    public ProfileFields validateProfileFields(boolean agrochemist, List<String> specializations,
            Integer experienceYears) {
        boolean sent = (specializations != null && !specializations.isEmpty()) || experienceYears != null;
        if (!agrochemist) {
            if (sent) {
                throw invalidFields("Specializations and experience are only for an agrochemist");
            }
            return null;
        }
        if (specializations == null || specializations.isEmpty()) {
            throw invalidFields("Give at least one specialization");
        }
        if (experienceYears == null) {
            throw invalidFields("Give the years of experience");
        }
        Set<Specialization> parsed = EnumSet.noneOf(Specialization.class);
        for (String code : specializations) {
            Specialization s = Specialization.fromCode(code).orElseThrow(() -> invalidFields(
                    "Unknown specialization, the known ones are "
                            + Arrays.stream(Specialization.values()).map(Specialization::code).toList()));
            if (!parsed.add(s)) {
                throw invalidFields("Each specialization can be given once");
            }
        }
        if (experienceYears < 0 || experienceYears > MAX_EXPERIENCE_YEARS) {
            throw invalidFields("Experience must be between 0 and " + MAX_EXPERIENCE_YEARS + " years");
        }
        return new ProfileFields(parsed, experienceYears);
    }

    private static ApiException invalidFields(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, VerificationErrors.INVALID_PROFILE_FIELDS, message);
    }

    /** Creates the profile with status {@code pending}; documents are uploaded later. */
    @Transactional
    public void createPendingProfile(UUID userId, ProfileFields fields) {
        jdbc.update("INSERT INTO agrochemist_profiles (user_id, specialization, experience_years) VALUES (?, ?, ?)",
                userId, SPECIALIZATIONS.convertToDatabaseColumn(fields.specializations()), fields.experienceYears());
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
