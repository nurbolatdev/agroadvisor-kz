package kz.agroadvisor.diagnosis.config;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import kz.agroadvisor.diagnosis.config.DiagnosisClaimConfig.ClaimTimeoutCheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RequestDeadlineTest {

    private static final Duration POOL = Duration.ofSeconds(30);

    private final AiProperties ai = new AiProperties("http", "http://ai", Duration.ofSeconds(2),
            Duration.ofSeconds(10), 1, Duration.ofMillis(400), false);
    private final PhotoStorageProperties photos = new PhotoStorageProperties("http://s3", "b", "us-east-1", "k", "s",
            Duration.ofSeconds(2), Duration.ofSeconds(10), Duration.ofSeconds(25));

    @Test
    void theModelCallCountsEveryTryAndThePauseBetweenThem() {
        // (2 s connect + 10 s read) x 2 tries + 0.4 s pause
        assertThat(RequestDeadline.aiCall(ai)).isEqualTo(Duration.ofMillis(24_400));
    }

    @Test
    void theDeadlineIsStripPlusUploadPlusModelPlusPoolWaitPlusStatements() {
        // 2 + 25 + 24.4 + 30 + 1, the sum written in application.yml
        assertThat(RequestDeadline.of(ai, photos, POOL)).isEqualTo(Duration.ofMillis(82_400));
    }

    @Test
    void theDefaultClaimTimeoutOf90SecondsCoversTheDefaultDeadline() {
        Duration deadline = RequestDeadline.of(ai, photos, POOL);

        assertThat(new ClaimTimeoutCheck(new DiagnosisProperties(Duration.ofSeconds(90)).claimTimeout(), deadline))
                .isNotNull();
    }

    @Test
    void aClaimTimeoutNotLongerThanTheDeadlineStopsTheStartUp() {
        Duration deadline = RequestDeadline.of(ai, photos, POOL);

        assertThatThrownBy(() -> new ClaimTimeoutCheck(deadline, deadline))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("claim-timeout");
        assertThatThrownBy(() -> new ClaimTimeoutCheck(Duration.ofSeconds(60), deadline))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aClaimTimeoutAtTheCleanupAgeStopsTheStartUp() {
        Duration deadline = RequestDeadline.of(ai, photos, POOL);

        assertThatThrownBy(() -> new ClaimTimeoutCheck(DiagnosisProperties.CLEANUP_AGE, deadline))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("cleanup");
        assertThat(new ClaimTimeoutCheck(Duration.ofMinutes(59), deadline)).isNotNull();
    }

    @Test
    void raisingATimeoutRaisesTheDeadline() {
        AiProperties slower = new AiProperties("http", "http://ai", Duration.ofSeconds(2), Duration.ofSeconds(30), 1,
                Duration.ofMillis(400), false);

        assertThat(RequestDeadline.of(slower, photos, POOL)).isGreaterThan(Duration.ofSeconds(90));
        assertThatThrownBy(() -> new ClaimTimeoutCheck(Duration.ofSeconds(90), RequestDeadline.of(slower, photos, POOL)))
                .isInstanceOf(IllegalStateException.class);
    }
}
