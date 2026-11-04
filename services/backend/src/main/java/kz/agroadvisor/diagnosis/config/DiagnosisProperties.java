package kz.agroadvisor.diagnosis.config;

import java.time.Duration;

import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * {@code claimTimeout}: how long a request with an Idempotency-Key may hold its claim
 * ({@code diagnosis_requests}) before another request may take it over. It must be longer than the whole
 * time one request can take; {@link RequestDeadline} computes that time and the application does not start
 * with a shorter claim timeout. The reasoning and the numbers are in {@code application.yml}.
 */
@Validated
@ConfigurationProperties("app.diagnosis")
public record DiagnosisProperties(@NotNull @DefaultValue("PT90S") Duration claimTimeout) {
}
