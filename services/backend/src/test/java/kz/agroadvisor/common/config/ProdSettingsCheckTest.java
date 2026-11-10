package kz.agroadvisor.common.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class ProdSettingsCheckTest {

    private static final String SECRET = "super-secret-jwt-value";

    private static MockEnvironment valid() {
        return new MockEnvironment()
                .withProperty("spring.datasource.url", "jdbc:postgresql://db/agroadvisor")
                .withProperty("spring.datasource.username", "agro")
                .withProperty("spring.datasource.password", "db-password-value")
                .withProperty("spring.data.redis.host", "redis")
                .withProperty("spring.data.redis.password", "redis-password-value")
                .withProperty("app.photos.endpoint", "http://s3:8333")
                .withProperty("app.photos.access-key", "access-key-value")
                .withProperty("app.photos.secret-key", "secret-key-value")
                .withProperty("app.security.jwt.secret", SECRET)
                .withProperty("app.ai.url", "http://ai:8000")
                .withProperty("app.ai.client", "http")
                .withProperty("app.ai.allow-placeholder", "false")
                .withProperty("springdoc.api-docs.enabled", "false")
                .withProperty("springdoc.swagger-ui.enabled", "false");
    }

    @Test
    void acceptsACompleteSafeSet() {
        assertThatCode(() -> ProdSettingsCheck.check(valid())).doesNotThrowAnyException();
    }

    @Test
    void namesEveryMissingVariableAndNoValues() {
        MockEnvironment env = valid()
                .withProperty("spring.datasource.password", "")
                .withProperty("spring.data.redis.host", "");

        assertThatThrownBy(() -> ProdSettingsCheck.check(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DB_PASSWORD")
                .hasMessageContaining("REDIS_HOST")
                .hasMessageNotContaining("JWT_SECRET")
                .hasMessageNotContaining(SECRET)
                .hasMessageNotContaining("redis-password-value");
    }

    @Test
    void refusesAnUnsetVariable() {
        MockEnvironment env = new MockEnvironment().withProperty("app.ai.client", "http");

        assertThatThrownBy(() -> ProdSettingsCheck.check(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DB_URL")
                .hasMessageContaining("JWT_SECRET");
    }

    @Test
    void refusesThePlaceholderModel() {
        MockEnvironment env = valid().withProperty("app.ai.allow-placeholder", "true");

        assertThatThrownBy(() -> ProdSettingsCheck.check(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("allow-placeholder");
    }

    @Test
    void refusesTheStubClient() {
        MockEnvironment env = valid().withProperty("app.ai.client", "stub");

        assertThatThrownBy(() -> ProdSettingsCheck.check(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("app.ai.client");
    }

    @Test
    void refusesApiDocs() {
        MockEnvironment env = valid().withProperty("springdoc.api-docs.enabled", "true");

        assertThatThrownBy(() -> ProdSettingsCheck.check(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("springdoc");
    }
}
