package kz.agroadvisor.common.ratelimit;

import jakarta.validation.constraints.Min;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Request limits per user. There are no daily limits: the service is free for now (decision of 21 Oct 2026).
 *
 * <p>Two limits guard a diagnosis, for two different reasons (see docs/api/ai-predict.md): {@code
 * diagnosisPerMinute} (5) is the fair share of a farmer and is given back when a diagnosis fails for a
 * reason of ours; {@code diagnosisAttemptsPerMinute} (20) protects the AI service from a retry storm and is
 * never given back, whatever the outcome.
 */
@Validated
@ConfigurationProperties("app.rate-limit")
public record RateLimitProperties(
        @Min(1) @DefaultValue("5") int diagnosisPerMinute,
        @Min(1) @DefaultValue("20") int diagnosisAttemptsPerMinute) {
}
