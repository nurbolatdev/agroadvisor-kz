package kz.agroadvisor.auth.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.Base64;

import org.junit.jupiter.api.Test;

class JwtConfigTest {

    private final JwtConfig config = new JwtConfig();

    @Test
    void acceptsBase64SecretOf32BytesOrMore() {
        String secret = Base64.getEncoder().encodeToString(new byte[32]);
        assertThat(config.jwtSecretKey(properties(secret)).getEncoded()).hasSize(32);
    }

    @Test
    void rejectsShortSecret() {
        String secret = Base64.getEncoder().encodeToString(new byte[31]);
        assertThatThrownBy(() -> config.jwtSecretKey(properties(secret)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("at least 32 bytes");
    }

    @Test
    void rejectsSecretThatIsNotBase64() {
        assertThatThrownBy(() -> config.jwtSecretKey(properties("not base64 !!!")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Base64");
    }

    private static JwtProperties properties(String secret) {
        return new JwtProperties(secret, Duration.ofMinutes(15), Duration.ofDays(7), "agroadvisor-kz");
    }
}
