package kz.agroadvisor.diagnosis.config;

import java.time.Duration;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * The AI service ({@code services/ai-service}, contract in {@code docs/api/ai-predict.md}).
 *
 * <p>{@code client} is {@code http} (the real service) or {@code stub} (a fake that answers "healthy";
 * local experiments and tests only). Inference takes about 100 ms on a CPU (p95 172 ms), so
 * {@code readTimeout} of 10 s leaves a wide margin. {@code retries} extra tries are made only for a
 * service that is not up or not ready (connection errors and {@code 503 model_not_loaded}), after a
 * pause of {@code retryDelay} so that a model that is still loading gets a moment; a read timeout or
 * a {@code 500} is never retried, because the model may already have run. An answer of the
 * placeholder model ({@code model_version} starting with {@code placeholder}) is refused unless
 * {@code allowPlaceholder} is true; it is true only in the local and test profiles.
 */
@Validated
@ConfigurationProperties("app.ai")
public record AiProperties(
        @NotBlank @DefaultValue("http") String client,
        @NotBlank @DefaultValue("http://localhost:8000") String url,
        @NotNull @DefaultValue("PT2S") Duration connectTimeout,
        @NotNull @DefaultValue("PT10S") Duration readTimeout,
        @Min(0) @Max(3) @DefaultValue("1") int retries,
        @NotNull @DefaultValue("PT0.4S") Duration retryDelay,
        @DefaultValue("false") boolean allowPlaceholder) {
}
