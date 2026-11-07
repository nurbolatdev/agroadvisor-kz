package kz.agroadvisor.diagnosis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import kz.agroadvisor.common.web.ApiException;

class ModelInfoServiceTest {

    private static final ModelInfo V1 = new ModelInfo("effnet-b0-v1", 1, true);
    private static final ModelInfo V2 = new ModelInfo("effnet-b0-v2", 2, true);

    /** A clock the test moves by hand. */
    private static final class Moving extends Clock {
        private Instant now = Instant.parse("2026-11-07T10:00:00Z");

        void advance(Duration by) {
            now = now.plus(by);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private final AiClient ai = mock(AiClient.class);
    private final Moving clock = new Moving();
    private final ModelInfoService service = new ModelInfoService(ai, clock, Duration.ofSeconds(60));

    @Test
    void asksTheAiServiceOnceWhileTheAnswerIsFresh() {
        when(ai.modelInfo()).thenReturn(V1);

        assertThat(service.current()).isEqualTo(V1);
        clock.advance(Duration.ofSeconds(59));
        assertThat(service.current()).isEqualTo(V1);

        verify(ai, times(1)).modelInfo();
    }

    @Test
    void asksAgainWhenTheTimeIsOverAndShowsANewModel() {
        when(ai.modelInfo()).thenReturn(V1, V2);

        assertThat(service.current()).isEqualTo(V1);
        clock.advance(Duration.ofSeconds(60));

        assertThat(service.current()).isEqualTo(V2);
        verify(ai, times(2)).modelInfo();
    }

    @Test
    void aFailureIsPassedOnAndNeverKept() {
        ApiException down = new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ai_unavailable", "down");
        when(ai.modelInfo()).thenThrow(down).thenReturn(V1);

        assertThatThrownBy(service::current).isSameAs(down);
        // the next call asks again at once, there is no failure in the cache
        assertThat(service.current()).isEqualTo(V1);
        verify(ai, times(2)).modelInfo();
    }

    @Test
    void anOldAnswerIsNotServedAfterItsTimeWhenTheAiServiceIsDown() {
        ApiException down = new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ai_unavailable", "down");
        when(ai.modelInfo()).thenReturn(V1).thenThrow(down);

        service.current();
        clock.advance(Duration.ofSeconds(61));

        assertThatThrownBy(service::current).isSameAs(down);
    }
}
