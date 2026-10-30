package kz.agroadvisor.common.ratelimit;

import jakarta.validation.constraints.Min;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Request limits per user. The diagnosis limit is 5 photos per minute and there are no
 * daily limits: the service is free for now (decision of 21 Oct 2026).
 */
@Validated
@ConfigurationProperties("app.rate-limit")
public record RateLimitProperties(@Min(1) @DefaultValue("5") int diagnosisPerMinute) {
}
