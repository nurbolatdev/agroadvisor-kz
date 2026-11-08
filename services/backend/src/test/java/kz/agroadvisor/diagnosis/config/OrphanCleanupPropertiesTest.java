package kz.agroadvisor.diagnosis.config;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OrphanCleanupPropertiesTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(OrphanCleanupConfig.class);

    @Test
    void theDefaultsAreTheCautiousOnes() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            OrphanCleanupProperties p = context.getBean(OrphanCleanupProperties.class);
            assertThat(p.enabled()).isTrue();
            assertThat(p.dryRun()).isTrue();
            assertThat(p.minAge()).isEqualTo(Duration.ofHours(24));
            assertThat(p.cron()).isEqualTo("0 30 3 * * *");
            assertThat(p.batchSize()).isEqualTo(500);
            assertThat(p.maxDeletesPerRun()).isEqualTo(500);
            assertThat(p.maxOrphanRatio()).isEqualTo(0.2);
        });
    }

    @Test
    void theValuesCanBeSetFromTheConfiguration() {
        runner.withPropertyValues("app.photos.orphan-cleanup.dry-run=false",
                "app.photos.orphan-cleanup.min-age=48h", "app.photos.orphan-cleanup.max-deletes-per-run=100",
                "app.photos.orphan-cleanup.max-orphan-ratio=0.05").run(context -> {
                    OrphanCleanupProperties p = context.getBean(OrphanCleanupProperties.class);
                    assertThat(p.dryRun()).isFalse();
                    assertThat(p.minAge()).isEqualTo(Duration.ofHours(48));
                    assertThat(p.maxDeletesPerRun()).isEqualTo(100);
                    assertThat(p.maxOrphanRatio()).isEqualTo(0.05);
                });
    }

    @Test
    void aMinAgeNotLongerThanTheClaimCleanupAgeStopsTheStartup() {
        runner.withPropertyValues("app.photos.orphan-cleanup.min-age=1h").run(context ->
                assertThat(context).hasFailed().getFailure().rootCause().hasMessageContaining("min-age"));
    }

    @Test
    void aMinAgeNotLongerThanALongClaimTimeoutStopsTheStartup() {
        runner.withPropertyValues("app.photos.orphan-cleanup.min-age=2h", "app.diagnosis.claim-timeout=3h")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void aMinAgeJustAboveBothIsAccepted() {
        runner.withPropertyValues("app.photos.orphan-cleanup.min-age=61m").run(context ->
                assertThat(context).hasNotFailed());
    }

    @Test
    void invalidValuesStopTheStartup() {
        for (String bad : new String[] {"batch-size=0", "batch-size=1001", "max-deletes-per-run=0",
                "max-orphan-ratio=1.5", "max-orphan-ratio=-0.1", "cron=not-a-cron", "min-age=0s"}) {
            runner.withPropertyValues("app.photos.orphan-cleanup." + bad).run(context ->
                    assertThat(context).as(bad).hasFailed());
        }
    }

    @Test
    void theMinAgeCheckNamesBothNumbers() {
        assertThatThrownBy(() -> new OrphanCleanupConfig.MinAgeCheck(Duration.ofMinutes(30), Duration.ofSeconds(90)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("PT30M").hasMessageContaining("PT1M30S");
    }
}
