package kz.agroadvisor.diagnosis.service;

import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import kz.agroadvisor.diagnosis.repository.DiagnosisClaims;

/**
 * Removes claims that nobody released, e.g. when an instance died mid-request. Such a claim already stops
 * blocking its key after the claim timeout (it is taken over); this only keeps the table small. Every
 * instance runs it; deleting the same old rows twice is harmless.
 */
@Component
public class DiagnosisClaimCleanup {

    static final Duration MAX_AGE = Duration.ofHours(1);

    private static final Logger log = LoggerFactory.getLogger(DiagnosisClaimCleanup.class);

    private final DiagnosisClaims claims;

    public DiagnosisClaimCleanup(DiagnosisClaims claims) {
        this.claims = claims;
    }

    @Scheduled(initialDelayString = "PT10M", fixedDelayString = "PT10M")
    public int removeAbandonedClaims() {
        int removed = claims.deleteOlderThan(MAX_AGE);
        if (removed > 0) {
            log.info("Removed {} abandoned diagnosis claims older than {}", removed, MAX_AGE);
        }
        return removed;
    }
}
