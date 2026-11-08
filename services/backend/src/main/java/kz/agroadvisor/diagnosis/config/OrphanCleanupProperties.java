package kz.agroadvisor.diagnosis.config;

import java.time.Duration;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.validation.annotation.Validated;

/**
 * Settings of the job that removes photo objects no diagnosis points to (issue #69). The deletion is
 * irreversible (the bucket is not versioned), so the defaults are the cautious ones: {@code dry-run} on, a
 * limit of deletions per run, and a stop when too large a share of the old objects looks orphaned.
 *
 * @param enabled            switch the job off completely (rollback: {@code APP_PHOTOS_ORPHAN_CLEANUP_ENABLED=false})
 * @param dryRun             only count the orphans, delete nothing
 * @param minAge             objects younger than this are never touched; must exceed the claim timeout and the
 *                           age at which claim rows are cleaned up
 * @param cron               Spring cron expression (six fields), evaluated in the Asia/Almaty zone
 * @param batchSize          object keys checked against the database in one query (1-1000)
 * @param maxDeletesPerRun   the most objects one run deletes
 * @param maxOrphanRatio     if orphans / checked old objects is above this, the run aborts and deletes nothing
 */
@Validated
@ConfigurationProperties("app.photos.orphan-cleanup")
public record OrphanCleanupProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("true") boolean dryRun,
        @NotNull @DefaultValue("PT24H") Duration minAge,
        @NotBlank @DefaultValue("0 30 3 * * *") String cron,
        @Min(1) @Max(1000) @DefaultValue("500") int batchSize,
        @Min(1) @DefaultValue("500") int maxDeletesPerRun,
        @DecimalMin("0.0") @DecimalMax("1.0") @DefaultValue("0.2") double maxOrphanRatio) {

    public OrphanCleanupProperties {
        if (minAge != null && (minAge.isNegative() || minAge.isZero())) {
            throw new IllegalArgumentException("app.photos.orphan-cleanup.min-age must be positive");
        }
        if (cron != null && !cron.isBlank() && !CronExpression.isValidExpression(cron)) {
            throw new IllegalArgumentException("app.photos.orphan-cleanup.cron is not a valid cron expression: " + cron);
        }
    }
}
