package kz.agroadvisor.auth.service;

import kz.agroadvisor.auth.config.RefreshCleanupProperties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Nightly removal of refresh tokens that expired more than {@code retention} ago, in batches (one transaction
 * each, so locks stay short). Two instances deleting the same rows is harmless, so there is no lock.
 */
@Component
@EnableConfigurationProperties(RefreshCleanupProperties.class)
@ConditionalOnProperty(prefix = "app.security.refresh-cleanup", name = "enabled", havingValue = "true",
        matchIfMissing = true)
public class RefreshTokenCleanup {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenCleanup.class);

    private final RefreshTokenService tokens;
    private final RefreshCleanupProperties props;

    public RefreshTokenCleanup(RefreshTokenService tokens, RefreshCleanupProperties props) {
        this.tokens = tokens;
        this.props = props;
    }

    @Scheduled(cron = "${app.security.refresh-cleanup.cron:0 0 4 * * *}", zone = "Asia/Almaty")
    void scheduled() {
        run();
    }

    /** Returns the number of rows removed; never throws, so the scheduler keeps the job. */
    long run() {
        long removed = 0;
        try {
            int batch;
            do {
                batch = tokens.deleteExpired(props.retention(), props.batchSize());
                removed += batch;
            } while (batch >= props.batchSize());
            log.info("Removed {} refresh tokens that expired more than {} ago", removed, props.retention());
        } catch (RuntimeException e) {
            log.error("Refresh token cleanup failed after removing {} rows", removed, e);
        }
        return removed;
    }
}
