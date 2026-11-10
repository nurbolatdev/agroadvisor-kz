package kz.agroadvisor.common.ratelimit;

import jakarta.validation.constraints.Min;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Request limits. There are no daily limits: the service is free for now (decision of 21 Oct 2026).
 *
 * <p>Two limits guard a diagnosis, for two different reasons (see docs/api/ai-predict.md): {@code
 * diagnosisPerMinute} (5) is the fair share of a farmer and is given back when a diagnosis fails for a
 * reason of ours; {@code diagnosisAttemptsPerMinute} (20) protects the AI service from a retry storm and is
 * never given back, whatever the outcome.
 *
 * <p>Four limits guard the public auth endpoints, which have no user yet and are keyed by client address
 * or by login: {@code loginPerIpPerMinute} (30) stops one source trying many accounts, {@code
 * loginPerAccountPerMinute} (10) stops many sources guessing one account and carries the brute-force
 * protection, {@code registerPerIpPerHour} (20) stops scripted sign-ups, {@code refreshPerIpPerMinute} (60)
 * stops token-guessing. Many farmers can share one public address (mobile carrier NAT), so the per-address
 * values are generous. Every attempt counts, and none is given back.
 */
@Validated
@ConfigurationProperties("app.rate-limit")
public record RateLimitProperties(
        @Min(1) @DefaultValue("5") int diagnosisPerMinute,
        @Min(1) @DefaultValue("20") int diagnosisAttemptsPerMinute,
        @Min(1) @DefaultValue("30") int loginPerIpPerMinute,
        @Min(1) @DefaultValue("10") int loginPerAccountPerMinute,
        @Min(1) @DefaultValue("20") int registerPerIpPerHour,
        @Min(1) @DefaultValue("60") int refreshPerIpPerMinute) {
}
