package kz.agroadvisor.users.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.Set;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.config.AdminBootstrapProperties;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

class AdminBootstrapRunnerTest {

    private static final String PASSWORD = "correct horse battery";

    private final UserService users = mock(UserService.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);
    private final AdminBootstrapProperties properties =
            new AdminBootstrapProperties(true, "Root@Example.kz", PASSWORD, "Root", "en");
    private final AdminBootstrapRunner runner = new AdminBootstrapRunner(properties, users, encoder);

    @Test
    void createsTheFirstAdminWithAHashedPassword() {
        when(users.hasAdmin()).thenReturn(false);
        when(users.findByLogin(any())).thenReturn(Optional.empty());
        when(encoder.encode(PASSWORD)).thenReturn("hash");

        runner.run(null);

        verify(users).create(Login.parse("root@example.kz"), "hash", "Root", "en", Set.of(Role.ADMIN));
    }

    @Test
    void doesNothingWhenAnAdminExists() {
        when(users.hasAdmin()).thenReturn(true);

        runner.run(null);

        verify(users, never()).create(any(), anyString(), anyString(), anyString(), any());
    }

    @Test
    void neverPromotesAnExistingAccount() {
        when(users.hasAdmin()).thenReturn(false);
        when(users.findByLogin(any())).thenReturn(Optional.of(mock(User.class)));

        assertThatThrownBy(() -> runner.run(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("non-admin");
        verify(users, never()).create(any(), anyString(), anyString(), anyString(), any());
    }

    @Test
    void skipsWhenAnotherInstanceWonTheRace() {
        when(users.hasAdmin()).thenReturn(false, true);
        when(users.findByLogin(any())).thenReturn(Optional.empty());
        when(encoder.encode(PASSWORD)).thenReturn("hash");
        when(users.create(any(), anyString(), anyString(), anyString(), any()))
                .thenThrow(new ApiException(HttpStatus.CONFLICT, UserService.LOGIN_TAKEN, "taken"));

        runner.run(null);
    }

    @Test
    void skipsWhenAnotherInstanceCreatedTheAdminBetweenTheChecks() {
        when(users.hasAdmin()).thenReturn(false, true);
        when(users.findByLogin(any())).thenReturn(Optional.of(mock(User.class)));

        runner.run(null); // no exception

        verify(users, never()).create(any(), anyString(), anyString(), anyString(), any());
    }

    @Test
    void failsWhenTheLoginIsTakenButNoAdminExists() {
        when(users.hasAdmin()).thenReturn(false, false);
        when(users.findByLogin(any())).thenReturn(Optional.empty());
        when(encoder.encode(PASSWORD)).thenReturn("hash");
        when(users.create(any(), anyString(), anyString(), anyString(), any()))
                .thenThrow(new ApiException(HttpStatus.CONFLICT, UserService.LOGIN_TAKEN, "taken"));

        assertThatThrownBy(() -> runner.run(null)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void thePasswordIsMaskedInToString() {
        assertThat(properties.toString()).doesNotContain(PASSWORD).contains("password=****");
    }

    @Test
    void enabledRefusesALongName() {
        assertThatThrownBy(() -> new AdminBootstrapProperties(true, "+77001234567", PASSWORD, "n".repeat(121), "ru"))
                .hasMessageContaining("full-name");
    }

    @Test
    void isOffByDefaultAndNeedsNoCredentialsThen() {
        AdminBootstrapProperties off = new AdminBootstrapProperties(false, null, null, "Administrator", "ru");
        assertThat(off.enabled()).isFalse();
    }

    @Test
    void enabledNeedsALogin() {
        assertThatThrownBy(() -> new AdminBootstrapProperties(true, " ", PASSWORD, "Root", "ru"))
                .hasMessageContaining("login");
        assertThatThrownBy(() -> new AdminBootstrapProperties(true, "not a login", PASSWORD, "Root", "ru"))
                .hasMessageContaining("login");
    }

    @ParameterizedTest
    @ValueSource(strings = {"short", "elevenchars"})
    void enabledRefusesAShortPassword(String password) {
        assertThatThrownBy(() -> new AdminBootstrapProperties(true, "+77001234567", password, "Root", "ru"))
                .hasMessageContaining("password");
    }

    @Test
    void enabledRefusesAPasswordBcryptWouldTruncate() {
        assertThatThrownBy(
                () -> new AdminBootstrapProperties(true, "+77001234567", "a".repeat(73), "Root", "ru"))
                .hasMessageContaining("password");
    }

    @Test
    void enabledRefusesAnUnknownLanguage() {
        assertThatThrownBy(() -> new AdminBootstrapProperties(true, "+77001234567", PASSWORD, "Root", "de"))
                .hasMessageContaining("language");
    }
}
