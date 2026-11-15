package kz.agroadvisor.notifications.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.notifications.repository.PushTokenRepository;
import kz.agroadvisor.notifications.repository.PushTokenRepository.PushToken;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class PushTokenServiceTest {

    @Autowired
    private PushTokenRepository repository;
    @Autowired
    private RateLimitProperties limits;
    @Autowired
    private JdbcTemplate jdbc;

    private final RateLimiter rateLimiter = mock(RateLimiter.class);
    private PushTokenService service;
    private UUID alice;
    private UUID bob;
    private int seq;

    @BeforeEach
    void setUp() {
        service = new PushTokenService(repository, rateLimiter, limits);
        alice = user();
        bob = user();
    }

    @Test
    void theEleventhDeviceReplacesTheOldest() {
        for (int i = 0; i < 10; i++) {
            service.register(alice, "alice-" + i, "android");
        }

        service.register(alice, "alice-new", "android");

        assertThat(count(alice)).isEqualTo(10);
        assertThat(exists("alice-new")).isTrue();
        assertThat(exists("alice-0")).isFalse();
    }

    @Test
    void registrationsAreCountedPerUserPerHourBeforeAnyWrite() {
        service.register(alice, "alice-a", "ios");

        verify(rateLimiter).check("push-tokens", alice.toString(), 20, Duration.ofHours(1));
    }

    @Test
    void anExceededLimitIsATooManyRequestsAndWritesNothing() {
        doThrow(new ApiException(HttpStatus.TOO_MANY_REQUESTS, RateLimiter.RATE_LIMITED, "slow down"))
                .when(rateLimiter).check(eq("push-tokens"), anyString(), anyInt(), eq(Duration.ofHours(1)));

        assertThatThrownBy(() -> service.register(alice, "alice-a", "ios"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(e.getCode()).isEqualTo("rate_limited");
                });
        assertThat(count(alice)).isZero();
    }

    @Test
    void deletingSomeoneElsesOrMissingTokenIsNotFound() {
        PushToken token = service.register(alice, "alice-a", "android");

        for (UUID target : new UUID[] {token.id(), UUID.randomUUID()}) {
            assertThatThrownBy(() -> service.delete(bob, target))
                    .isInstanceOfSatisfying(ApiException.class, e -> {
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                        assertThat(e.getCode()).isEqualTo("push_token_not_found");
                    });
        }
        assertThat(count(alice)).isEqualTo(1);

        service.delete(alice, token.id());
        assertThat(count(alice)).isZero();
    }

    private int count(UUID user) {
        return jdbc.queryForObject("SELECT count(*) FROM push_tokens WHERE user_id = ?", Integer.class, user);
    }

    private boolean exists(String token) {
        return jdbc.queryForObject("SELECT count(*) FROM push_tokens WHERE token = ?", Integer.class, token) > 0;
    }

    private UUID user() {
        seq++;
        return jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test') RETURNING id",
                UUID.class, "+7704300%04d".formatted(seq));
    }
}
