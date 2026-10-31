package kz.agroadvisor.diagnosis.config;

import jakarta.validation.constraints.NotBlank;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * S3-compatible photo storage (SeaweedFS, see infra/README.md). The keys come from the
 * {@code S3_ACCESS_KEY} and {@code S3_SECRET_KEY} environment variables; the application does not
 * start without them.
 */
@Validated
@ConfigurationProperties("app.photos")
public record PhotoStorageProperties(
        @NotBlank @DefaultValue("http://localhost:8333") String endpoint,
        @NotBlank @DefaultValue("diagnosis-photos") String bucket,
        @NotBlank @DefaultValue("us-east-1") String region,
        @NotBlank String accessKey,
        @NotBlank String secretKey) {
}
