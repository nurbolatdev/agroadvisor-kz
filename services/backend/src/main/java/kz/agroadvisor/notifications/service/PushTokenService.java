package kz.agroadvisor.notifications.service;

import java.time.Duration;
import java.util.UUID;

import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.notifications.repository.PushTokenRepository;
import kz.agroadvisor.notifications.repository.PushTokenRepository.PushToken;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Device push tokens of a user. Registration is an idempotent upsert by token. A user keeps at most
 * {@value #MAX_TOKENS_PER_USER} tokens: registering one more drops the least recently registered, so a
 * forgotten device never blocks a new one. Registrations are rate limited per user before any database work.
 */
@Service
public class PushTokenService {

    public static final int MAX_TOKENS_PER_USER = 10;

    private final PushTokenRepository tokens;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties limits;

    public PushTokenService(PushTokenRepository tokens, RateLimiter rateLimiter, RateLimitProperties limits) {
        this.tokens = tokens;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
    }

    /** Registers or refreshes a token; a token that belonged to another account moves to this user. */
    @Transactional
    public PushToken register(UUID me, String token, String platform) {
        rateLimiter.check("push-tokens", me.toString(), limits.pushTokenRegistrationsPerHour(),
                Duration.ofHours(1));
        tokens.lockUser(me);
        PushToken saved = tokens.upsert(me, token, platform);
        tokens.trimToNewest(me, MAX_TOKENS_PER_USER);
        return saved;
    }

    /** Removes the caller's token; another user's and a missing id give the same 404. */
    @Transactional
    public void delete(UUID me, UUID id) {
        if (tokens.delete(me, id) == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, NotificationErrors.PUSH_TOKEN_NOT_FOUND,
                    "Push token not found");
        }
    }
}
