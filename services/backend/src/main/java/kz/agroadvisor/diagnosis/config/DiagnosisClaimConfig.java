package kz.agroadvisor.diagnosis.config;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Claim settings and the check that the claim timeout covers the longest request. */
@Configuration
@EnableScheduling
@EnableConfigurationProperties({DiagnosisProperties.class, AiProperties.class, PhotoStorageProperties.class})
public class DiagnosisClaimConfig {

    /** Fails the start-up when a request can outlive its claim; see {@link RequestDeadline}. */
    @Bean
    ClaimTimeoutCheck claimTimeoutCheck(DiagnosisProperties diagnosis, AiProperties ai, PhotoStorageProperties photos,
            @Value("${spring.datasource.hikari.connection-timeout:30s}") Duration poolConnectionTimeout) {
        return new ClaimTimeoutCheck(diagnosis.claimTimeout(), RequestDeadline.of(ai, photos, poolConnectionTimeout));
    }

    /** Holds the verified numbers; the constructor is the check. */
    public record ClaimTimeoutCheck(Duration claimTimeout, Duration requestDeadline) {

        public ClaimTimeoutCheck {
            if (claimTimeout.compareTo(requestDeadline) <= 0) {
                throw new IllegalStateException("app.diagnosis.claim-timeout (" + claimTimeout + ") must be longer "
                        + "than the longest diagnosis request (" + requestDeadline + ": strip, photo upload, model "
                        + "call with retries, finalizing transaction); otherwise a request that is still working "
                        + "could be taken over. Raise the claim timeout or lower the AI/storage timeouts.");
            }
        }
    }
}
