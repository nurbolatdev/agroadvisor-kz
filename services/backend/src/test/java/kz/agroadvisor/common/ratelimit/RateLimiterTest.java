package kz.agroadvisor.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RateLimiterTest {

    private static final Duration MINUTE = Duration.ofMinutes(1);
    // A moment at the start of a window, so five calls never straddle a window boundary
    private static final Instant START = Instant.parse("2026-11-01T10:00:00Z");

    @Autowired
    private StringRedisTemplate redis;
    @Autowired
    private RateLimitProperties limits;

    private RateLimiter limiterAt(Instant now) {
        return new RateLimiter(redis, Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test
    void diagnosisLimitIsFivePhotosPerMinute() {
        assertThat(limits.diagnosisPerMinute()).isEqualTo(5);
    }

    @Test
    void allowsTheLimitAndRejectsTheNextCall() {
        RateLimiter limiter = limiterAt(START);
        String user = UUID.randomUUID().toString();

        for (int i = 0; i < 5; i++) {
            limiter.check("diagnosis", user, 5, MINUTE);
        }

        assertThatThrownBy(() -> limiter.check("diagnosis", user, 5, MINUTE))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(e.getCode()).isEqualTo("rate_limited");
                    assertThat(e.getMessage()).contains("retry in 60 s");
                });
    }

    @Test
    void usersAndBucketsAreCountedSeparately() {
        RateLimiter limiter = limiterAt(START);
        String first = UUID.randomUUID().toString();
        String second = UUID.randomUUID().toString();
        for (int i = 0; i < 5; i++) {
            limiter.check("diagnosis", first, 5, MINUTE);
        }

        assertThatCode(() -> limiter.check("diagnosis", second, 5, MINUTE)).doesNotThrowAnyException();
        assertThatCode(() -> limiter.check("other", first, 5, MINUTE)).doesNotThrowAnyException();
    }

    @Test
    void theLimitResetsInTheNextWindow() {
        String user = UUID.randomUUID().toString();
        RateLimiter limiter = limiterAt(START);
        for (int i = 0; i < 5; i++) {
            limiter.check("diagnosis", user, 5, MINUTE);
        }
        assertThatThrownBy(() -> limiter.check("diagnosis", user, 5, MINUTE)).isInstanceOf(ApiException.class);

        RateLimiter later = limiterAt(START.plusSeconds(60));

        assertThatCode(() -> later.check("diagnosis", user, 5, MINUTE)).doesNotThrowAnyException();
    }

    @Test
    void countersExpireWithTheirWindow() {
        String user = UUID.randomUUID().toString();
        limiterAt(START).check("expiry", user, 5, MINUTE);

        Long ttl = redis.getExpire("agroadvisor:ratelimit:expiry:" + user + ":" + START.getEpochSecond() / 60);

        assertThat(ttl).isBetween(1L, 61L);
    }

    @Test
    void allowsRequestsWhenRedisIsDown() {
        StringRedisTemplate broken = new StringRedisTemplate() {
            @Override
            public org.springframework.data.redis.core.ValueOperations<String, String> opsForValue() {
                throw new IllegalStateException("redis is down");
            }
        };
        RateLimiter limiter = new RateLimiter(broken, Clock.fixed(START, ZoneOffset.UTC));

        assertThatCode(() -> limiter.check("diagnosis", "anyone", 1, MINUTE)).doesNotThrowAnyException();
    }
}
