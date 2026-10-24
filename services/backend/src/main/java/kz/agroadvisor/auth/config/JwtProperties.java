package kz.agroadvisor.auth.config;

import java.time.Duration;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Token settings. {@code secret} is a Base64 string of at least 32 random bytes (HS256);
 * it comes from the {@code JWT_SECRET} environment variable and the application does not start without it.
 */
@Validated
@ConfigurationProperties("app.security.jwt")
public record JwtProperties(
        @NotBlank String secret,
        @NotNull @DefaultValue("PT15M") Duration accessTtl,
        @NotNull @DefaultValue("P7D") Duration refreshTtl,
        @NotBlank @DefaultValue("agroadvisor-kz") String issuer) {
}
