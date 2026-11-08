package kz.agroadvisor.diagnosis.config;

import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Settings of the orphaned photo cleanup and the check that its minimum age is safe. */
@Configuration
@EnableConfigurationProperties({OrphanCleanupProperties.class, DiagnosisProperties.class})
public class OrphanCleanupConfig {

    /** Fails the start-up when the cleanup could touch an object of a request that is still working. */
    @Bean
    MinAgeCheck orphanCleanupMinAgeCheck(OrphanCleanupProperties cleanup, DiagnosisProperties diagnosis) {
        return new MinAgeCheck(cleanup.minAge(), diagnosis.claimTimeout());
    }

    /**
     * Holds the verified numbers; the constructor is the check. An object can only be live while some request
     * works on it (up to the claim timeout) or while its claim row exists (up to the cleanup age of claims), so
     * the minimum age must be longer than both. A retry of the same idempotency key writes a new object and has
     * no other time limit: it does not touch the old one.
     */
    public record MinAgeCheck(Duration minAge, Duration claimTimeout) {

        public MinAgeCheck {
            Duration floor = claimTimeout.compareTo(DiagnosisProperties.CLEANUP_AGE) > 0
                    ? claimTimeout : DiagnosisProperties.CLEANUP_AGE;
            if (minAge.compareTo(floor) <= 0) {
                throw new IllegalStateException("app.photos.orphan-cleanup.min-age (" + minAge + ") must be longer "
                        + "than the claim timeout (" + claimTimeout + ") and the age at which claim rows are cleaned "
                        + "up (" + DiagnosisProperties.CLEANUP_AGE + "); otherwise the cleanup could delete the photo "
                        + "of a request that is still working.");
            }
        }
    }
}
