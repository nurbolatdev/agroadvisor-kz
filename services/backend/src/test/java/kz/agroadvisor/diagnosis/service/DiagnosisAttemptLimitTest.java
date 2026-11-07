package kz.agroadvisor.diagnosis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.catalog.repository.DiseaseRepository;
import kz.agroadvisor.common.image.ImageMetadataStripper;
import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.diagnosis.config.DiagnosisProperties;
import kz.agroadvisor.diagnosis.model.ClassScore;
import kz.agroadvisor.diagnosis.model.Diagnosis;
import kz.agroadvisor.diagnosis.repository.DiagnosisClaims;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;

/**
 * The two limits of a diagnosis against a real Redis: the diagnosis token (5 a minute, given back when we
 * fail) and the attempts (20 a minute, never given back).
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DiagnosisAttemptLimitTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF,
        (byte) 0xD9};
    // A moment at the start of a window, so a run of calls never straddles a boundary
    private static final Instant START = Instant.parse("2026-11-01T10:00:00Z");

    @Autowired
    private StringRedisTemplate redis;
    @Autowired
    private RateLimitProperties limits;

    private final AiClient ai = mock(AiClient.class);
    private final PhotoStorage photos = mock(PhotoStorage.class);
    private final DiagnosisRepository diagnoses = mock(DiagnosisRepository.class);
    private final DiseaseRepository diseases = mock(DiseaseRepository.class);
    private final DiagnosisClaims claims = mock(DiagnosisClaims.class);
    private final PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);
    private final UUID userId = UUID.randomUUID();
    private DiagnosisService service;

    @BeforeEach
    void wire() {
        when(txManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(ai.crops()).thenReturn(List.of("tomato"));
        when(photos.store(any(), anyString(), any(), anyString())).thenReturn("diagnoses/key.jpg");
        when(diagnoses.saveAndFlush(any(Diagnosis.class))).thenAnswer(call -> call.getArgument(0));
        when(diseases.findAllById(any())).thenReturn(List.of());
        when(claims.find(any(), anyString(), any())).thenReturn(Optional.empty());
        service = new DiagnosisService(ai, photos, diagnoses, diseases, new SimpleMeterRegistry(),
                new RateLimiter(redis, Clock.fixed(START, ZoneOffset.UTC)), limits, new ImageMetadataStripper(),
                claims, new TransactionTemplate(txManager), new DiagnosisProperties(Duration.ofSeconds(90)));
    }

    @AfterEach
    void cleanUp() {
        Set<String> keys = redis.keys("agroadvisor:ratelimit:*:" + userId + ":*");
        if (keys != null && !keys.isEmpty()) {
            redis.delete(keys);
        }
    }

    private long counter(String bucket) {
        Set<String> keys = redis.keys("agroadvisor:ratelimit:" + bucket + ":" + userId + ":*");
        if (keys == null || keys.isEmpty()) {
            return 0;
        }
        return Long.parseLong(redis.opsForValue().get(keys.iterator().next()));
    }

    private void fiveHundredTwoFromTheModel() {
        doThrow(new ApiException(HttpStatus.BAD_GATEWAY, "ai_error", "Bad answer")).when(ai)
                .predict(anyString(), any());
    }

    private ClassScore healthy() {
        return new ClassScore("tomato__healthy", 0.9);
    }

    private Prediction ok() {
        return new Prediction("ok", "tomato", healthy(), List.of(healthy()), null, "efficientnet-b0-v3", 3, 25);
    }

    @Test
    void theDefaultsAreFiveDiagnosesAndTwentyAttemptsAMinute() {
        assertThat(limits.diagnosisPerMinute()).isEqualTo(5);
        assertThat(limits.diagnosisAttemptsPerMinute()).isEqualTo(20);
    }

    @Test
    void aSeriesOfBadGatewaysNeverUsesUpTheDiagnosisLimitButTheTwentyFirstAttemptIs429() {
        fiveHundredTwoFromTheModel();

        for (int i = 1; i <= 20; i++) {
            assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, null))
                    .isInstanceOfSatisfying(ApiException.class,
                            e -> assertThat(e.getCode()).isEqualTo("ai_error"));
            // every failure gives its diagnosis token back; the attempt stays counted
            assertThat(counter("diagnosis")).isZero();
        }
        assertThat(counter("diagnosis-attempts")).isEqualTo(20);

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(e.getCode()).isEqualTo("rate_limited");
                    assertThat(e.getHeaders()).containsEntry("Retry-After", "60");
                });
        // the refused attempt spent no diagnosis token and the model was asked 20 times, not 21
        assertThat(counter("diagnosis")).isZero();
        verify(ai, times(20)).predict(anyString(), any());
    }

    @Test
    void anAttemptIsNeverGivenBackWhateverTheOutcome() {
        doReturn(ok()).when(ai).predict(anyString(), any());
        service.create(userId, "tomato", JPEG, null); // a diagnosis
        assertThatThrownBy(() -> service.create(userId, "banana", JPEG, null)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.create(userId, "tomato", new byte[] {1, 2, 3}, null))
                .isInstanceOf(ApiException.class);
        doThrow(new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "low_quality", "Blurry")).when(ai)
                .predict(anyString(), any());
        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, null)).isInstanceOf(ApiException.class);
        fiveHundredTwoFromTheModel();
        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, null)).isInstanceOf(ApiException.class);
        doThrow(new IllegalStateException("boom")).when(ai).predict(anyString(), any());
        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, null))
                .isInstanceOf(IllegalStateException.class);

        // all six attempts stay counted, whatever came of them
        assertThat(counter("diagnosis-attempts")).isEqualTo(6);
        // four kept their diagnosis token (a diagnosis and three refusals of the input); the 502 and the
        // unexpected failure gave theirs back
        assertThat(counter("diagnosis")).isEqualTo(4);
    }

    @Test
    void theDiagnosisLimitStillStopsTheSixthDiagnosisOfAMinute() {
        doReturn(ok()).when(ai).predict(anyString(), any());
        for (int i = 0; i < 5; i++) {
            service.create(userId, "tomato", JPEG, null);
        }

        assertThatThrownBy(() -> service.create(userId, "tomato", JPEG, null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(e.getHeaders()).containsKey("Retry-After");
                });
    }
}
