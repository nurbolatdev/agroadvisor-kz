package kz.agroadvisor.common.ratelimit;

import java.time.Clock;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import kz.agroadvisor.common.web.ApiException;

/**
 * Fixed-window request limiter on Redis: at most {@code limit} calls per {@code subject}
 * (usually a user id) in each window of the given length.
 *
 * <p>A caller names its own {@code bucket} and takes the limit from {@link RateLimitProperties}, for
 * example {@code check("diagnosis", userId, limits.diagnosisPerMinute(), Duration.ofMinutes(1))}.
 *
 * <p>If Redis is unavailable the request is allowed and a warning is logged: the limiter protects
 * against abuse, and an outage must not lock every farmer out of the service.
 */
@Component
@EnableConfigurationProperties(RateLimitProperties.class)
public class RateLimiter {

    public static final String RATE_LIMITED = "rate_limited";

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);

    private final StringRedisTemplate redis;
    private final Clock clock;

    public RateLimiter(StringRedisTemplate redis, Clock clock) {
        this.redis = redis;
        this.clock = clock;
    }

    /** Counts one call; throws 429 {@code rate_limited} when the limit of the current window is exceeded. */
    public void check(String bucket, String subject, int limit, Duration window) {
        long windowSeconds = window.toSeconds();
        long now = clock.instant().getEpochSecond();
        long windowIndex = now / windowSeconds;
        String key = "agroadvisor:ratelimit:" + bucket + ":" + subject + ":" + windowIndex;

        Long count;
        try {
            count = redis.opsForValue().increment(key);
            if (count != null && count == 1) {
                // The key is bound to its window, so it can expire as soon as the window is over
                redis.expire(key, window.plusSeconds(1));
            }
        } catch (RuntimeException e) {
            log.warn("Rate limiter '{}' skipped, Redis is unavailable: {}", bucket, e.toString());
            return;
        }

        if (count != null && count > limit) {
            long retryAfter = (windowIndex + 1) * windowSeconds - now;
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, RATE_LIMITED,
                    "Too many requests, retry in " + retryAfter + " s");
        }
    }
}
