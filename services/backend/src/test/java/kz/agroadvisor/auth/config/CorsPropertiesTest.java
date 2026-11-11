package kz.agroadvisor.auth.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CorsPropertiesTest {

    @Test
    void emptyByDefault() {
        assertThat(new CorsProperties(null).allowedOrigins()).isEmpty();
        assertThat(new CorsProperties(List.of()).allowedOrigins()).isEmpty();
    }

    @Test
    void acceptsBareOriginsAndTrimsBlanks() {
        CorsProperties p = new CorsProperties(List.of(" https://admin.example.kz ", "http://localhost:5173", " "));
        assertThat(p.allowedOrigins()).containsExactly("https://admin.example.kz", "http://localhost:5173");
    }

    @ParameterizedTest
    @ValueSource(strings = {"*", "admin.example.kz", "ftp://example.kz", "https://example.kz/admin",
            "https://example.kz/", "https://user@example.kz", "https://example.kz?x=1", "https://exa mple.kz"})
    void rejectsAnythingThatIsNotABareOrigin(String origin) {
        assertThatThrownBy(() -> new CorsProperties(List.of(origin)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("app.cors.allowed-origins");
    }
}
