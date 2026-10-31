package kz.agroadvisor.diagnosis.config;

import java.time.Duration;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * S3-compatible photo storage (SeaweedFS, see infra/README.md). The keys come from the
 * {@code S3_ACCESS_KEY} and {@code S3_SECRET_KEY} environment variables; the application does not
 * start without them.
 *
 * <p>Timeouts keep a stuck storage from holding request threads: the SDK defaults (30 s read, 4 attempts)
 * block a thread for about two minutes. {@code attemptTimeout} bounds one try, {@code totalTimeout} all
 * tries of one call together.
 */
@Validated
@ConfigurationProperties("app.photos")
public record PhotoStorageProperties(
        @NotBlank @DefaultValue("http://localhost:8333") String endpoint,
        @NotBlank @DefaultValue("diagnosis-photos") String bucket,
        @NotBlank @DefaultValue("us-east-1") String region,
        @NotBlank String accessKey,
        @NotBlank String secretKey,
        @NotNull @DefaultValue("PT2S") Duration connectTimeout,
        @NotNull @DefaultValue("PT10S") Duration attemptTimeout,
        @NotNull @DefaultValue("PT25S") Duration totalTimeout) {
}
