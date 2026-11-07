package kz.agroadvisor.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
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
    @Value("${spring.data.redis.timeout}")
    private Duration commandTimeout;
    @Value("${spring.data.redis.connect-timeout}")
    private Duration connectTimeout;

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
    void aRefundMakesRoomForAnotherCallInTheSameWindow() {
        RateLimiter limiter = limiterAt(START);
        String user = UUID.randomUUID().toString();
        RateLimiter.Ticket first = limiter.check("diagnosis", user, 5, MINUTE);
        RateLimiter.Ticket second = limiter.check("diagnosis", user, 5, MINUTE);
        RateLimiter.Ticket third = limiter.check("diagnosis", user, 5, MINUTE);

        // two of the three calls came to nothing (a failure that was not the caller's): the room comes back
        limiter.refund(first);
        limiter.refund(second);

        // the counter is 1 now, so four more calls fit in the window and the next one does not
        for (int i = 0; i < 4; i++) {
            limiter.check("diagnosis", user, 5, MINUTE);
        }
        assertThatThrownBy(() -> limiter.check("diagnosis", user, 5, MINUTE)).isInstanceOf(ApiException.class);
        assertThat(third.key()).isEqualTo(first.key());
    }

    @Test
    void aRefundNeverGoesBelowZero() {
        RateLimiter limiter = limiterAt(START);
        String user = UUID.randomUUID().toString();
        RateLimiter.Ticket ticket = limiter.check("diagnosis", user, 5, MINUTE);

        limiter.refund(ticket);
        limiter.refund(ticket);
        limiter.refund(ticket);

        assertThat(redis.opsForValue().get(ticket.key())).isEqualTo("0");
    }

    @Test
    void aRefundGoesToTheWindowItWasSpentInAndNeverRevivesAnExpiredKey() {
        String user = UUID.randomUUID().toString();
        RateLimiter before = limiterAt(START);
        RateLimiter.Ticket old = before.check("diagnosis", user, 5, MINUTE);

        RateLimiter after = limiterAt(START.plusSeconds(61));
        after.check("diagnosis", user, 5, MINUTE);
        RateLimiter.Ticket current = after.check("diagnosis", user, 5, MINUTE);

        // the old window's counter is given back, the current one keeps both of its calls
        after.refund(old);
        assertThat(redis.opsForValue().get(old.key())).isEqualTo("0");
        assertThat(redis.opsForValue().get(current.key())).isEqualTo("2");

        // a key that has expired is not brought back by a refund
        redis.delete(old.key());
        after.refund(old);
        assertThat(redis.hasKey(old.key())).isFalse();
    }

    @Test
    void aNullTicketIsNothingToGiveBack() {
        assertThatCode(() -> limiterAt(START).refund(null)).doesNotThrowAnyException();
    }

    @Test
    void aRefundWithRedisDownDoesNotFail() {
        StringRedisTemplate broken = new StringRedisTemplate() {
            @Override
            public <T> T execute(RedisScript<T> script, List<String> keys, Object... args) {
                throw new IllegalStateException("redis down");
            }
        };
        RateLimiter limiter = new RateLimiter(broken, Clock.fixed(START, ZoneOffset.UTC));

        assertThatCode(() -> limiter.refund(new RateLimiter.Ticket("some-key"))).doesNotThrowAnyException();
    }

    @Test
    void whenRedisIsDownThereIsNothingCountedSoTheTicketIsNull() {
        StringRedisTemplate broken = new StringRedisTemplate() {
            @Override
            public <T> T execute(RedisScript<T> script, List<String> keys, Object... args) {
                throw new IllegalStateException("redis down");
            }
        };
        RateLimiter limiter = new RateLimiter(broken, Clock.fixed(START, ZoneOffset.UTC));

        assertThat(limiter.check("diagnosis", "anyone", 1, MINUTE)).isNull();
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
    void windowShorterThanASecondIsRejected() {
        assertThatThrownBy(() -> limiterAt(START).check("diagnosis", "anyone", 5, Duration.ofMillis(500)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void redisCallsFailFastWhenRedisIsDown() {
        // The Lettuce default is 60 s per command, which would hang every request during an outage
        assertThat(commandTimeout).isLessThanOrEqualTo(Duration.ofSeconds(1));
        assertThat(connectTimeout).isLessThanOrEqualTo(Duration.ofSeconds(2));
    }

    @Test
    void allowsRequestsWhenRedisIsDown() {
        StringRedisTemplate broken = new StringRedisTemplate() {
            @Override
            public <T> T execute(RedisScript<T> script, List<String> keys, Object... args) {
                throw new IllegalStateException("redis is down");
            }
        };
        RateLimiter limiter = new RateLimiter(broken, Clock.fixed(START, ZoneOffset.UTC));

        assertThatCode(() -> limiter.check("diagnosis", "anyone", 1, MINUTE)).doesNotThrowAnyException();
    }
}
