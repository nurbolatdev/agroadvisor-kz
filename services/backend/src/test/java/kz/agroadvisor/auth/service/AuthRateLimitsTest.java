package kz.agroadvisor.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.http.HttpStatus;

import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;

class AuthRateLimitsTest {

    private static final Duration MINUTE = Duration.ofMinutes(1);
    private static final Duration HOUR = Duration.ofHours(1);

    private RateLimiter limiter;
    private AuthRateLimits limits;

    @BeforeEach
    void setUp() {
        limiter = mock(RateLimiter.class);
        limits = new AuthRateLimits(limiter, new RateLimitProperties(5, 20, 30, 10, 20, 60, 10, 30));
    }

    @Test
    void loginChecksTheAddressAndThenTheAccount() {
        limits.login("203.0.113.5", "user@mail.kz");

        InOrder order = inOrder(limiter);
        order.verify(limiter).check(eq("login-ip"), eq("203.0.113.5"), eq(30), eq(MINUTE));
        order.verify(limiter).check(eq("login-account"), anyString(), eq(10), eq(MINUTE));
        verifyNoMoreInteractions(limiter);
    }

    @Test
    void registerIsLimitedPerAddressPerHour() {
        limits.register("203.0.113.6");

        verify(limiter).check("register-ip", "203.0.113.6", 20, HOUR);
        verifyNoMoreInteractions(limiter);
    }

    @Test
    void refreshIsLimitedPerAddressPerMinute() {
        limits.refresh("2001:db8::1");

        verify(limiter).check("refresh-ip", "2001:db8::1", 60, MINUTE);
        verifyNoMoreInteractions(limiter);
    }

    @Test
    void threeSpellingsOfOnePhoneAreOneAccount() {
        String a = accountSubject("8 701 123 45 67");
        String b = accountSubject("+7 (701) 123-45-67");
        String c = accountSubject("77011234567");

        assertThat(a).isEqualTo(b).isEqualTo(c);
    }

    @Test
    void anEmailIsOneAccountWhateverItsCaseAndSpaces() {
        assertThat(accountSubject(" User@Mail.KZ ")).isEqualTo(accountSubject("user@mail.kz"));
    }

    @Test
    void anUnparsableLoginIsTrimmedAndLowerCased() {
        assertThat(accountSubject("  Some Name ")).isEqualTo(accountSubject("some name"));
        assertThat(accountSubject("  Some Name ")).isNotEqualTo(accountSubject("other"));
    }

    @Test
    void theSubjectIsAHashAndNeverTheRawLogin() {
        String subject = accountSubject("+7 701 123 45 67");

        assertThat(subject).matches("[0-9a-f]{64}");
        assertThat(subject).doesNotContain("701").doesNotContain("123");

        String emailSubject = accountSubject("user@mail.kz");
        assertThat(emailSubject).matches("[0-9a-f]{64}").doesNotContain("user");
    }

    @Test
    void whenTheAddressIsRefusedTheAccountBucketIsNotSpent() {
        doThrow(new ApiException(HttpStatus.TOO_MANY_REQUESTS, RateLimiter.RATE_LIMITED, "slow down"))
                .when(limiter).check(eq("login-ip"), anyString(), anyInt(), eq(MINUTE));

        assertThatThrownBy(() -> limits.login("203.0.113.7", "user@mail.kz"))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo("rate_limited"));

        verify(limiter, never()).check(eq("login-account"), anyString(), anyInt(), eq(MINUTE));
    }

    @Test
    void theAuthLimitsFallBackToTheirDefaultsAndTheDiagnosisOnesAreUnchanged() {
        RateLimitProperties defaults = new Binder(new MapConfigurationPropertySource())
                .bindOrCreate("app.rate-limit", RateLimitProperties.class);

        assertThat(defaults.loginPerIpPerMinute()).isEqualTo(30);
        assertThat(defaults.loginPerAccountPerMinute()).isEqualTo(10);
        assertThat(defaults.registerPerIpPerHour()).isEqualTo(20);
        assertThat(defaults.refreshPerIpPerMinute()).isEqualTo(60);
        assertThat(defaults.diagnosisPerMinute()).isEqualTo(5);
        assertThat(defaults.diagnosisAttemptsPerMinute()).isEqualTo(20);
    }

    private String accountSubject(String rawLogin) {
        RateLimiter spy = mock(RateLimiter.class);
        AuthRateLimits subject = new AuthRateLimits(spy, new RateLimitProperties(5, 20, 30, 10, 20, 60, 10, 30));
        subject.login("203.0.113.1", rawLogin);
        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        verify(spy).check(eq("login-account"), key.capture(), anyInt(), eq(MINUTE));
        return key.getValue();
    }
}
