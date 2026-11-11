package kz.agroadvisor.auth.config;

import java.net.URI;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Browser origins that may call the API (the admin web). The mobile app is not a browser and needs none.
 *
 * @param allowedOrigins exact origins such as {@code https://admin.example.kz} or {@code http://localhost:5173}
 *                       ({@code APP_CORS_ORIGINS}, comma separated); empty means no cross-origin access;
 *                       a wildcard, a path or a missing scheme stops the startup
 */
@Validated
@ConfigurationProperties("app.cors")
public record CorsProperties(@DefaultValue List<String> allowedOrigins) {

    public CorsProperties {
        allowedOrigins = allowedOrigins == null ? List.of()
                : allowedOrigins.stream().map(String::trim).filter(o -> !o.isEmpty()).map(CorsProperties::check)
                        .toList();
    }

    private static String check(String origin) {
        URI uri;
        try {
            uri = URI.create(origin);
        } catch (IllegalArgumentException e) {
            throw invalid(origin);
        }
        boolean scheme = "http".equals(uri.getScheme()) || "https".equals(uri.getScheme());
        boolean bare = uri.getHost() != null && uri.getUserInfo() == null && uri.getQuery() == null
                && uri.getFragment() == null && (uri.getPath() == null || uri.getPath().isEmpty());
        if (!scheme || !bare) {
            throw invalid(origin);
        }
        return origin;
    }

    private static IllegalArgumentException invalid(String origin) {
        return new IllegalArgumentException(
                "app.cors.allowed-origins: '" + origin + "' is not an origin like https://host[:port]");
    }
}
