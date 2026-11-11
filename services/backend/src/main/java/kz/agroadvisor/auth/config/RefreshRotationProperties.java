package kz.agroadvisor.auth.config;

import java.time.Duration;

import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Settings of refresh token rotation.
 *
 * @param refreshReuseWindow how long after its first use a refresh token may be presented again (a lost response
 *                           on a bad network); inside the window the replay gets a new token pair in the same
 *                           family, later reuse revokes the family; {@code 0} means strict rotation; at most 60 s
 */
@Validated
@ConfigurationProperties("app.security")
public record RefreshRotationProperties(
        @NotNull @DefaultValue("PT10S") Duration refreshReuseWindow) {

    private static final Duration MAX = Duration.ofSeconds(60);

    public RefreshRotationProperties {
        if (refreshReuseWindow != null && (refreshReuseWindow.isNegative() || refreshReuseWindow.compareTo(MAX) > 0)) {
            throw new IllegalArgumentException("app.security.refresh-reuse-window must be between 0 and PT60S");
        }
    }
}
