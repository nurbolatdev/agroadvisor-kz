package kz.agroadvisor.auth.config;

import java.time.Duration;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.validation.annotation.Validated;

/**
 * Settings of the nightly job that deletes expired refresh tokens.
 *
 * @param enabled   switch the job off ({@code APP_SECURITY_REFRESH_CLEANUP_ENABLED=false})
 * @param cron      Spring cron expression (six fields), evaluated in the Asia/Almaty zone
 * @param retention rows are deleted only when they expired more than this long ago; it is how long a replayed
 *                  old token is still recognised as reuse (and revokes its family) instead of a plain 401
 * @param batchSize rows deleted per transaction (1-10000)
 */
@Validated
@ConfigurationProperties("app.security.refresh-cleanup")
public record RefreshCleanupProperties(
        @DefaultValue("true") boolean enabled,
        @NotBlank @DefaultValue("0 0 4 * * *") String cron,
        @NotNull @DefaultValue("P7D") Duration retention,
        @Min(1) @Max(10000) @DefaultValue("1000") int batchSize) {

    public RefreshCleanupProperties {
        if (retention != null && (retention.isNegative() || retention.isZero())) {
            throw new IllegalArgumentException("app.security.refresh-cleanup.retention must be positive");
        }
        if (cron != null && !cron.isBlank() && !CronExpression.isValidExpression(cron)) {
            throw new IllegalArgumentException(
                    "app.security.refresh-cleanup.cron is not a valid cron expression: " + cron);
        }
    }
}
