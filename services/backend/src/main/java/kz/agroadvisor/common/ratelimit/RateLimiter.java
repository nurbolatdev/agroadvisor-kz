package kz.agroadvisor.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

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

    /**
     * Takes one back from the counter, never below zero and never recreating a key that has expired (a
     * refund that comes after the window is over has nothing to give back).
     */
    private static final DefaultRedisScript<Long> GIVE_BACK = new DefaultRedisScript<>("""
            local count = tonumber(redis.call('GET', KEYS[1]))
            if count and count > 0 then
              return redis.call('DECR', KEYS[1])
            end
            return -1""", Long.class);

    /**
     * What one {@link #check} counted: the counter of its window. {@link #refund} gives exactly that call back,
     * in the window it was counted in, not in the one that is current when the refund is made.
     */
    public static final class Ticket {

        private final String key;
        private final AtomicBoolean refunded = new AtomicBoolean();

        public Ticket(String key) {
            this.key = key;
        }

        public String key() {
            return key;
        }

        /** True for the first caller only: a ticket gives back one call, however many paths ask for it. */
        boolean claimRefund() {
            return refunded.compareAndSet(false, true);
        }
    }

    private final StringRedisTemplate redis;
    private final Clock clock;

    public RateLimiter(StringRedisTemplate redis, Clock clock) {
        this.redis = redis;
        this.clock = clock;
    }

    /**
     * Counts one call; throws 429 {@code rate_limited} when the limit of the current window is exceeded.
     * Returns what was counted, to give it back with {@link #refund}; null when Redis is unavailable (there is
     * nothing counted to give back).
     */
    public Ticket check(String bucket, String subject, int limit, Duration window) {
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
            return null;
        }

        if (count != null && count > limit) {
            long retryAfter = (windowIndex + 1) * windowSeconds - now;
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, RATE_LIMITED,
                    "Too many requests, retry in " + retryAfter + " s")
                    .withHeader("Retry-After", String.valueOf(retryAfter));
        }
        return new Ticket(key);
    }

    /**
     * Gives back a call counted by {@link #check}, for a request that ended without doing what the limit
     * protects (see DiagnosisService). A null ticket, a window that is over, and an unavailable Redis are all
     * no-ops: a refund is a courtesy and must never fail a request. A refused call (429) has no ticket, so
     * there is nothing to refund for it; its count stays in the window, as before.
     */
    public void refund(Ticket ticket) {
        if (ticket == null || !ticket.claimRefund()) {
            return;
        }
        try {
            redis.execute(GIVE_BACK, List.of(ticket.key()));
        } catch (RuntimeException e) {
            log.warn("Rate limiter refund skipped, Redis is unavailable: {}", e.toString());
        }
    }
}
