package kz.agroadvisor.weather.config;

import java.time.Duration;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * The weather source and the limit of requests. {@code url} is the base address of Open-Meteo (no key, free
 * for non-commercial use: a commercial launch needs their paid plan or another source, see the ADR in the
 * pull request). {@code requestsPerMinute} is per user: the forecast is cached for everyone, so the limit only
 * stops a script from hammering the cache and, on a cold cache, the source.
 */
@Validated
@ConfigurationProperties("app.weather")
public record WeatherProperties(
        @NotBlank @DefaultValue("https://api.open-meteo.com") String url,
        @NotNull @DefaultValue("PT2S") Duration connectTimeout,
        @NotNull @DefaultValue("PT5S") Duration readTimeout,
        @Min(1) @DefaultValue("30") int requestsPerMinute) {
}
