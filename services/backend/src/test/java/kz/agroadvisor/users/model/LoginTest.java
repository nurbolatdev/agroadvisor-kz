package kz.agroadvisor.users.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class LoginTest {

    @ParameterizedTest
    @ValueSource(strings = {"+77011234567", "87011234567", "77011234567", "+7 (701) 123-45-67", " 8 701 123 45 67 "})
    void kazakhstanPhonesBecomeE164(String raw) {
        assertThat(Login.parse(raw)).isEqualTo(new Login(Login.Type.PHONE, "+77011234567"));
    }

    @Test
    void foreignE164PhoneIsKept() {
        assertThat(Login.parse("+996555123456").value()).isEqualTo("+996555123456");
    }

    @Test
    void emailIsTrimmedAndLowerCased() {
        assertThat(Login.parse("  Farmer@Example.KZ ")).isEqualTo(new Login(Login.Type.EMAIL, "farmer@example.kz"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "12345", "+0123456789", "abc", "a@b", "two words@example.kz", "@example.kz"})
    void invalidLoginIsRejected(String raw) {
        assertThatThrownBy(() -> Login.parse(raw)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void nullIsRejected() {
        assertThatThrownBy(() -> Login.parse(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rolesMapBetweenDatabaseCodesAndAuthorities() {
        assertThat(Role.AGROCHEMIST.code()).isEqualTo("agrochemist");
        assertThat(Role.AGROCHEMIST.authority()).isEqualTo("ROLE_AGROCHEMIST");
        assertThat(Role.fromCode("admin")).isEqualTo(Role.ADMIN);
    }
}
