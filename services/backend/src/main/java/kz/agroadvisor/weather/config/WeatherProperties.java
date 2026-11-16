package kz.agroadvisor.weather.config;

import java.time.Duration;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * The weather source and the limits of requests. {@code url} is the base address of Open-Meteo (no key, free
 * for non-commercial use: a commercial launch needs their paid plan or another source, see
 * docs/adr/0010-weather-source.md). {@code requestsPerMinute} is per user: the forecast is cached for everyone,
 * so it only stops a script from hammering the cache. {@code upstreamPerHour} is for the whole service: only a
 * cold cache goes to the source, but each new point of one user's script would, and the source allows about
 * 10 000 calls a day for one address, so one account must not be able to use that up for every farmer.
 */
@Validated
@ConfigurationProperties("app.weather")
public record WeatherProperties(
        @NotBlank @DefaultValue("https://api.open-meteo.com") String url,
        @NotNull @DefaultValue("PT2S") Duration connectTimeout,
        @NotNull @DefaultValue("PT5S") Duration readTimeout,
        @Min(1) @DefaultValue("30") int requestsPerMinute,
        @Min(1) @DefaultValue("300") int upstreamPerHour) {
}
