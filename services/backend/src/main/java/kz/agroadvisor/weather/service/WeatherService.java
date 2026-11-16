package kz.agroadvisor.weather.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.weather.config.WeatherProperties;
import kz.agroadvisor.weather.service.SprayAdvisor.Window;

/** The weather for a point: now, the hours ahead and the windows good for spraying. */
@Service
@EnableConfigurationProperties(WeatherProperties.class)
public class WeatherService {

    private static final BigDecimal MAX_LATITUDE = new BigDecimal("90");
    private static final BigDecimal MAX_LONGITUDE = new BigDecimal("180");

    private final ForecastCache forecasts;
    private final RateLimiter limiter;
    private final WeatherProperties props;
    private final Clock clock;

    public WeatherService(ForecastCache forecasts, RateLimiter limiter, WeatherProperties props, Clock clock) {
        this.forecasts = forecasts;
        this.limiter = limiter;
        this.props = props;
        this.clock = clock;
    }

    /** The weather now in degrees Celsius, metres per second and millimetres, with local times of the point. */
    public record WeatherView(
            @Schema(description = "IANA zone of the point; every time below is local to it",
                    example = "Asia/Almaty", requiredMode = REQUIRED) String timezone,
            @Schema(requiredMode = REQUIRED) int utcOffsetSeconds,
            @Schema(requiredMode = REQUIRED) Now current,
            @Schema(description = "From the current hour on, up to the end of the fifth day, one per hour",
                    requiredMode = REQUIRED) List<HourView> hours,
            @Schema(description = "Stretches of good hours for spraying: wind up to 4 m/s, 10 to 25 degrees, "
                    + "no precipitation for 6 hours from the start", requiredMode = REQUIRED)
            List<SprayWindowView> sprayWindows) {
    }

    public record Now(
            @Schema(requiredMode = REQUIRED) LocalDateTime time,
            @Schema(description = "Degrees Celsius", requiredMode = REQUIRED) double temperatureC,
            @Schema(description = "Metres per second", requiredMode = REQUIRED) double windMs,
            @Schema(description = "Millimetres", requiredMode = REQUIRED) double precipitationMm,
            @Schema(description = "WMO weather code", requiredMode = REQUIRED) int weatherCode) {
    }

    public record HourView(
            @Schema(requiredMode = REQUIRED) LocalDateTime time,
            @Schema(requiredMode = REQUIRED) double temperatureC,
            @Schema(requiredMode = REQUIRED) double precipitationMm,
            @Schema(description = "Percent", requiredMode = REQUIRED) int precipitationProbability,
            @Schema(requiredMode = REQUIRED) double windMs,
            @Schema(requiredMode = REQUIRED) int weatherCode,
            @Schema(description = "This hour is good to start spraying", requiredMode = REQUIRED)
            boolean sprayOk) {
    }

    public record SprayWindowView(
            @Schema(requiredMode = REQUIRED) LocalDateTime from,
            @Schema(description = "The end of the last good hour", requiredMode = REQUIRED) LocalDateTime to) {
    }

    /**
     * The weather for a point. The point is rounded to 0.01 degree, which is also the key of the shared cache.
     * Each user may ask {@code requestsPerMinute} times a minute; every ask counts, cached or not.
     */
    public WeatherView weather(UUID user, BigDecimal latitude, BigDecimal longitude) {
        if (latitude == null || longitude == null || latitude.abs().compareTo(MAX_LATITUDE) > 0
                || longitude.abs().compareTo(MAX_LONGITUDE) > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "Latitude must be from -90 to 90 and longitude from -180 to 180");
        }
        limiter.check("weather", user.toString(), props.requestsPerMinute(), Duration.ofMinutes(1));

        Forecast forecast = forecasts.forecast(latitude.setScale(2, RoundingMode.HALF_UP),
                longitude.setScale(2, RoundingMode.HALF_UP));
        return view(forecast);
    }

    private WeatherView view(Forecast forecast) {
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), ZoneOffset.ofTotalSeconds(forecast.utcOffsetSeconds()));
        LocalDateTime start = now.truncatedTo(ChronoUnit.HOURS);
        List<Forecast.Hour> ahead = forecast.hours().stream().filter(h -> !h.time().isBefore(start)).toList();

        boolean[] good = SprayAdvisor.goodHours(ahead);
        List<HourView> hours = new ArrayList<>(ahead.size());
        for (int i = 0; i < ahead.size(); i++) {
            Forecast.Hour h = ahead.get(i);
            hours.add(new HourView(h.time(), h.temperatureC(), h.precipitationMm(), h.precipitationProbability(),
                    h.windMs(), h.weatherCode(), good[i]));
        }
        List<SprayWindowView> windows = SprayAdvisor.windows(ahead, good).stream()
                .map((Window w) -> new SprayWindowView(w.from(), w.to())).toList();

        Forecast.Current c = forecast.current();
        return new WeatherView(forecast.timezone(), forecast.utcOffsetSeconds(),
                new Now(c.time(), c.temperatureC(), c.windMs(), c.precipitationMm(), c.weatherCode()), hours, windows);
    }
}
