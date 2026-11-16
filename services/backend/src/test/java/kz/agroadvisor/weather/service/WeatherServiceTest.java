package kz.agroadvisor.weather.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.weather.config.WeatherProperties;
import kz.agroadvisor.weather.service.WeatherService.WeatherView;

/** The service and the cache bean without Spring: a fixed clock, a zone with an offset, a mocked limiter. */
class WeatherServiceTest {

    private static final UUID USER = UUID.randomUUID();
    private static final WeatherProperties PROPS = new WeatherProperties("http://unused", Duration.ofSeconds(1),
            Duration.ofSeconds(1), 30, 300);
    /** 05:30 UTC is 10:30 in a zone five hours ahead, like Almaty. */
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-01T05:30:00Z"), ZoneOffset.UTC);

    private final RateLimiter limiter = mock(RateLimiter.class);
    private final WeatherClient client = mock(WeatherClient.class);
    private final WeatherService service = new WeatherService(new ForecastCache(client, limiter, PROPS), limiter,
            PROPS, CLOCK);

    /** 120 calm dry hours from 00:00 of the local day. */
    private static Forecast fiveDays(int offsetSeconds) {
        LocalDateTime start = LocalDateTime.of(2026, 6, 1, 0, 0);
        List<Forecast.Hour> hours = new ArrayList<>();
        for (int i = 0; i < 120; i++) {
            hours.add(new Forecast.Hour(start.plusHours(i), 18, 0, 5, 2, 1));
        }
        return new Forecast("Asia/Almaty", offsetSeconds,
                new Forecast.Current(LocalDateTime.of(2026, 6, 1, 10, 15), 18.5, 2.5, 0, 1), hours);
    }

    private static BigDecimal d(String value) {
        return new BigDecimal(value);
    }

    @Test
    void startsAtTheCurrentLocalHourAndKeepsTheRestOfTheFiveDays() {
        when(client.fetch(any(), any())).thenReturn(fiveDays(18000));

        WeatherView view = service.weather(USER, d("43.25"), d("76.95"));

        // 05:30 UTC + 5 h = 10:30 local: the first hour is 10:00, so 10 of the 120 hours are behind us
        assertThat(view.hours()).hasSize(110);
        assertThat(view.hours().getFirst().time()).isEqualTo(LocalDateTime.of(2026, 6, 1, 10, 0));
        assertThat(view.hours().getLast().time()).isEqualTo(LocalDateTime.of(2026, 6, 5, 23, 0));
        assertThat(view.timezone()).isEqualTo("Asia/Almaty");
        assertThat(view.utcOffsetSeconds()).isEqualTo(18000);
    }

    @Test
    void withoutTheOffsetTheSameClockIsFiveHoursEarlier() {
        when(client.fetch(any(), any())).thenReturn(fiveDays(0));

        WeatherView view = service.weather(USER, d("43.25"), d("76.95"));

        assertThat(view.hours().getFirst().time()).isEqualTo(LocalDateTime.of(2026, 6, 1, 5, 0));
        assertThat(view.hours()).hasSize(115);
    }

    @Test
    void theSprayWindowEndsSixEntriesBeforeTheEndOfTheSeries() {
        when(client.fetch(any(), any())).thenReturn(fiveDays(18000));

        WeatherView view = service.weather(USER, d("43.25"), d("76.95"));

        // The last good start is the entry that still has six entries after it: 23:00 of day 5 minus six hours
        assertThat(view.sprayWindows()).hasSize(1);
        assertThat(view.sprayWindows().getFirst().from()).isEqualTo(LocalDateTime.of(2026, 6, 1, 10, 0));
        assertThat(view.sprayWindows().getFirst().to()).isEqualTo(LocalDateTime.of(2026, 6, 5, 18, 0));
    }

    @Test
    void refusesNumbersThatWouldTieUpACoreBeforeAnyArithmetic() {
        for (String bad : new String[] {"1e-100000000", "1e-999999999", "0.12345678901234567890123", "1e1000", "NaN"}) {
            long started = System.nanoTime();
            BigDecimal value;
            try {
                value = new BigDecimal(bad);
            } catch (NumberFormatException notANumber) {
                continue;
            }
            ApiException e = catchThrowableOfType(ApiException.class, () -> service.weather(USER, value, d("76.95")));

            assertThat(e).as(bad).isNotNull();
            assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(e.getCode()).isEqualTo("validation_failed");
            assertThat(Duration.ofNanos(System.nanoTime() - started)).as(bad).isLessThan(Duration.ofSeconds(1));
        }
        verify(client, never()).fetch(any(), any());
    }

    @Test
    void checksThePointBeforeSpendingTheUsersLimit() {
        catchThrowableOfType(ApiException.class, () -> service.weather(USER, d("95"), d("76.95")));

        verify(limiter, never()).check(any(), any(), anyInt(), any());
    }

    @Test
    void everyAskCountsForTheUserAndAMissCountsForTheSource() {
        when(client.fetch(any(), any())).thenReturn(fiveDays(18000));

        service.weather(USER, d("43.254"), d("76.951"));

        verify(limiter).check("weather", USER.toString(), 30, Duration.ofMinutes(1));
        verify(limiter).check(eq("weather-upstream"), eq("global"), eq(300), eq(Duration.ofHours(1)));
    }

    @Test
    void whenTheSourceQuotaIsUsedUpTheSourceIsNotCalled() {
        when(limiter.check(eq("weather-upstream"), any(), anyInt(), any()))
                .thenThrow(new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "slow down"));

        ApiException e = catchThrowableOfType(ApiException.class, () -> service.weather(USER, d("43.25"), d("76.95")));

        assertThat(e.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        verify(client, never()).fetch(any(), any());
    }
}
