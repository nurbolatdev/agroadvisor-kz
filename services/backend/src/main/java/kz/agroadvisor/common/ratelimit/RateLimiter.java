package kz.agroadvisor.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import kz.agroadvisor.common.web.ApiException;

/**
 * Fixed-window request limiter on Redis: at most {@code limit} calls per {@code subject} in each
 * window of the given length.
 *
 * <p>A caller names its own {@code bucket} and takes the limit from {@link RateLimitProperties}, for
 * example {@code check("diagnosis", userId, limits.diagnosisPerMinute(), Duration.ofMinutes(1))}.
 * The {@code subject} must come from the authenticated principal (the JWT subject), never from request
 * parameters, otherwise a client could dodge the limit by changing it.
 *
 * <p>Known trade-offs: windows are fixed, so a client can make up to twice the limit around a window
 * boundary (for example 5 calls at 10:00:59 and 5 more at 10:01:00); and if Redis is unavailable the
 * request is allowed and a warning is logged, because the limiter protects against abuse and an outage
 * must not lock every farmer out of the service.
 */
@Component
@EnableConfigurationProperties(RateLimitProperties.class)
public class RateLimiter {

    public static final String RATE_LIMITED = "rate_limited";

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);

    /** INCR and EXPIRE in one step, so that a counter can never be left without an expiry. */
    private static final DefaultRedisScript<Long> COUNT = new DefaultRedisScript<>("""
            local count = redis.call('INCR', KEYS[1])
            if count == 1 then
              redis.call('EXPIRE', KEYS[1], ARGV[1])
            end
            return count""", Long.class);

    private final StringRedisTemplate redis;
    private final Clock clock;

    public RateLimiter(StringRedisTemplate redis, Clock clock) {
        this.redis = redis;
        this.clock = clock;
    }

    /** Counts one call; throws 429 {@code rate_limited} when the limit of the current window is exceeded. */
    public void check(String bucket, String subject, int limit, Duration window) {
        long windowSeconds = window.toSeconds();
        if (windowSeconds < 1) {
            throw new IllegalArgumentException("The window must be at least one second: " + window);
        }
        long now = clock.instant().getEpochSecond();
        long windowIndex = now / windowSeconds;
        String key = "agroadvisor:ratelimit:" + bucket + ":" + subject + ":" + windowIndex;

        Long count;
        try {
            // The key is bound to its window, so it can expire as soon as the window is over
            count = redis.execute(COUNT, List.of(key), String.valueOf(windowSeconds + 1));
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
