package kz.agroadvisor.weather.service;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.weather.config.WeatherProperties;

/**
 * Open-Meteo: one request gives the weather now and 5 days of hours. Wind is asked in metres per second
 * and the times in the local zone of the point ({@code timezone=auto}).
 */
@Component
// http is the default; the tests switch to a stub with app.weather.client=stub, so they need no network and no
// extra Spring context (a mock bean in a test would start another context with its own containers)
@ConditionalOnProperty(name = "app.weather.client", havingValue = "http", matchIfMissing = true)
class OpenMeteoClient implements WeatherClient {

    private static final Logger log = LoggerFactory.getLogger(OpenMeteoClient.class);
    private static final int MIN_HOURS = 24;

    private final RestClient http;

    OpenMeteoClient(WeatherProperties props) {
        HttpClient jdk = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(props.connectTimeout())
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(props.readTimeout());
        this.http = RestClient.builder().baseUrl(props.url()).requestFactory(factory).build();
    }

    @Override
    public Forecast fetch(BigDecimal latitude, BigDecimal longitude) {
        Wire wire;
        try {
            wire = http.get()
                    .uri(uri -> uri.path("/v1/forecast")
                            .queryParam("latitude", latitude.toPlainString())
                            .queryParam("longitude", longitude.toPlainString())
                            .queryParam("current", "temperature_2m,wind_speed_10m,precipitation,weather_code")
                            .queryParam("hourly", "temperature_2m,precipitation,precipitation_probability,"
                                    + "wind_speed_10m,weather_code")
                            .queryParam("wind_speed_unit", "ms")
                            .queryParam("timezone", "auto")
                            .queryParam("forecast_days", 5)
                            .build())
                    .retrieve()
                    .body(Wire.class);
        } catch (ResourceAccessException e) {
            log.warn("Open-Meteo did not answer: {}", e.getMessage());
            throw unavailable();
        } catch (RestClientResponseException e) {
            // 429 and 5xx: the source is busy or down; a 4xx of ours (a bad point) cannot be fixed by waiting
            log.warn("Open-Meteo answered {}", e.getStatusCode().value());
            throw e.getStatusCode().is4xxClientError() && e.getStatusCode().value() != 429 ? error() : unavailable();
        } catch (RuntimeException e) {
            log.error("Unreadable answer of Open-Meteo: {}", e.toString());
            throw error();
        }
        try {
            return map(wire);
        } catch (RuntimeException e) {
            log.error("Open-Meteo gave a forecast we cannot use: {}", e.toString());
            throw error();
        }
    }

    private static Forecast map(Wire wire) {
        if (wire == null || wire.current() == null || wire.hourly() == null || wire.utcOffsetSeconds() == null
                || wire.timezone() == null) {
            throw new IllegalStateException("missing parts");
        }
        WireCurrent c = wire.current();
        if (c.time() == null || c.temperature() == null || c.wind() == null || c.precipitation() == null
                || c.weatherCode() == null) {
            throw new IllegalStateException("the current weather has holes");
        }
        Forecast.Current current = new Forecast.Current(LocalDateTime.parse(c.time()), c.temperature(), c.wind(),
                c.precipitation(), c.weatherCode());

        WireHourly h = wire.hourly();
        int n = h.time().size();
        if (n < MIN_HOURS || h.temperature().size() != n || h.precipitation().size() != n
                || h.probability().size() != n || h.wind().size() != n || h.weatherCode().size() != n) {
            throw new IllegalStateException("hourly arrays differ in length");
        }
        List<Forecast.Hour> hours = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            // A hole in the series would make a spray window false, so one null spoils the whole forecast
            hours.add(new Forecast.Hour(LocalDateTime.parse(h.time().get(i)), h.temperature().get(i),
                    h.precipitation().get(i), h.probability().get(i), h.wind().get(i), h.weatherCode().get(i)));
        }
        return new Forecast(wire.timezone(), wire.utcOffsetSeconds(), current, List.copyOf(hours));
    }

    private static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, WeatherErrors.WEATHER_UNAVAILABLE,
                "The weather service is not available, try again later");
    }

    private static ApiException error() {
        return new ApiException(HttpStatus.BAD_GATEWAY, WeatherErrors.WEATHER_ERROR,
                "The weather service gave an unusable answer");
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Wire(String timezone, @JsonProperty("utc_offset_seconds") Integer utcOffsetSeconds,
            WireCurrent current, WireHourly hourly) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record WireCurrent(String time, @JsonProperty("temperature_2m") Double temperature,
            @JsonProperty("wind_speed_10m") Double wind, Double precipitation,
            @JsonProperty("weather_code") Integer weatherCode) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record WireHourly(List<String> time, @JsonProperty("temperature_2m") List<Double> temperature,
            List<Double> precipitation, @JsonProperty("precipitation_probability") List<Integer> probability,
            @JsonProperty("wind_speed_10m") List<Double> wind,
            @JsonProperty("weather_code") List<Integer> weatherCode) {
    }
}
