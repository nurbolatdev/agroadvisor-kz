package kz.agroadvisor.auth.service;

import java.time.Duration;
import java.util.Locale;

import org.springframework.stereotype.Component;

import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.users.model.Login;

/**
 * Limits of the public auth endpoints. Called first in the controller, so a refused request never reaches
 * BCrypt, the database or a transaction.
 *
 * <p>Login has two buckets, the address first: {@code login-ip} stops one source spraying many accounts,
 * {@code login-account} stops many sources guessing one account. If the address bucket refuses, the account
 * bucket is not spent, so one flooding source cannot drain the bucket of a victim.
 *
 * <p>The account subject is the SHA-256 of the normalized login (so "8 701 ...", "+7 701 ..." and "7701 ..."
 * are one account), which keeps phones and e-mails out of Redis keys and bounds the key length. It is
 * hygiene, not a secret. The user table is not read, so the answer does not reveal whether an account exists.
 *
 * <p>Every attempt counts and nothing is given back: the tickets are ignored on purpose.
 */
@Component
public class AuthRateLimits {

    private static final Duration MINUTE = Duration.ofMinutes(1);
    private static final Duration HOUR = Duration.ofHours(1);

    private final RateLimiter limiter;
    private final RateLimitProperties limits;

    public AuthRateLimits(RateLimiter limiter, RateLimitProperties limits) {
        this.limiter = limiter;
        this.limits = limits;
    }

    public void login(String clientIp, String rawLogin) {
        limiter.check("login-ip", clientIp, limits.loginPerIpPerMinute(), MINUTE);
        limiter.check("login-account", accountKey(rawLogin), limits.loginPerAccountPerMinute(), MINUTE);
    }

    public void register(String clientIp) {
        limiter.check("register-ip", clientIp, limits.registerPerIpPerHour(), HOUR);
    }

    public void refresh(String clientIp) {
        limiter.check("refresh-ip", clientIp, limits.refreshPerIpPerMinute(), MINUTE);
    }

    /** Logout has its own bucket, with the size of the refresh one: the two are one family of calls. */
    public void logout(String clientIp) {
        limiter.check("logout-ip", clientIp, limits.refreshPerIpPerMinute(), MINUTE);
    }

    private static String accountKey(String rawLogin) {
        String normalized;
        try {
            normalized = Login.parse(rawLogin).value();
        } catch (IllegalArgumentException e) {
            normalized = rawLogin == null ? "" : rawLogin.trim().toLowerCase(Locale.ROOT);
        }
        return RefreshTokenService.hash(normalized);
    }
}
