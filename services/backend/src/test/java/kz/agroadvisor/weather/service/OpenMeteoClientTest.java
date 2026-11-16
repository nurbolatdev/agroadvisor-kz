package kz.agroadvisor.weather.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.weather.config.WeatherProperties;

/** The client against a fake Open-Meteo: a JDK HttpServer on a free local port, no network. */
class OpenMeteoClientTest {

    private static final BigDecimal LAT = new BigDecimal("43.25");
    private static final BigDecimal LON = new BigDecimal("76.95");

    private HttpServer server;
    private volatile int status = 200;
    private volatile String body = answer(24, "");
    private volatile String lastQuery = "";
    private volatile long delayMillis;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/forecast", this::handle);
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private void handle(HttpExchange exchange) throws IOException {
        lastQuery = exchange.getRequestURI().getRawQuery();
        try {
            Thread.sleep(delayMillis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        try {
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
        } catch (IOException clientGone) {
            // the client gave up (a timeout test)
        } finally {
            exchange.close();
        }
    }

    private OpenMeteoClient client() {
        return client("http://127.0.0.1:" + server.getAddress().getPort());
    }

    private static OpenMeteoClient client(String url) {
        return new OpenMeteoClient(new WeatherProperties(url, Duration.ofSeconds(1), Duration.ofMillis(300), 30));
    }

    /** An answer shaped like the real one (with fields we ignore); {@code hole} replaces one wind value. */
    private static String answer(int hours, String hole) {
        String times = IntStream.range(0, hours)
                .mapToObj(i -> "\"2026-06-01T%02d:00\"".formatted(i % 24)).collect(Collectors.joining(","));
        String numbers = IntStream.range(0, hours).mapToObj(i -> "1.5").collect(Collectors.joining(","));
        String wind = hole.isEmpty() ? numbers : numbers.replaceFirst("1.5", hole);
        String dry = IntStream.range(0, hours).mapToObj(i -> "0.0").collect(Collectors.joining(","));
        String ints = IntStream.range(0, hours).mapToObj(i -> "3").collect(Collectors.joining(","));
        return """
                {"latitude": 43.26, "longitude": 76.95, "elevation": 834.0, "timezone": "Asia/Almaty",
                 "utc_offset_seconds": 18000,
                 "current": {"time": "2026-06-01T10:15", "interval": 900, "temperature_2m": 18.5,
                             "wind_speed_10m": 2.5, "precipitation": 0.0, "weather_code": 1},
                 "hourly": {"time": [%s], "temperature_2m": [%s], "precipitation": [%s],
                            "precipitation_probability": [%s], "wind_speed_10m": [%s], "weather_code": [%s]}}"""
                .formatted(times, numbers, dry, ints, wind, ints);
    }

    @Test
    void readsTheCurrentWeatherAndTheHours() {
        Forecast forecast = client().fetch(LAT, LON);

        assertThat(forecast.timezone()).isEqualTo("Asia/Almaty");
        assertThat(forecast.utcOffsetSeconds()).isEqualTo(18000);
        assertThat(forecast.current().time()).isEqualTo(LocalDateTime.of(2026, 6, 1, 10, 15));
        assertThat(forecast.current().temperatureC()).isEqualTo(18.5);
        assertThat(forecast.current().windMs()).isEqualTo(2.5);
        assertThat(forecast.hours()).hasSize(24);
        assertThat(forecast.hours().getFirst().windMs()).isEqualTo(1.5);
        assertThat(forecast.hours().getFirst().precipitationProbability()).isEqualTo(3);
    }

    @Test
    void asksForMetresPerSecondLocalTimeAndFiveDays() {
        client().fetch(LAT, LON);

        assertThat(lastQuery).contains("latitude=43.25", "longitude=76.95", "wind_speed_unit=ms",
                "timezone=auto", "forecast_days=5", "hourly=temperature_2m,precipitation");
    }

    @Test
    void aBusySourceIsUnavailable() {
        for (int code : new int[] {429, 500, 503}) {
            status = code;
            body = "{\"error\": true, \"reason\": \"busy\"}";

            ApiException e = catchThrowableOfType(ApiException.class, () -> client().fetch(LAT, LON));

            assertThat(e.getStatus()).as("answer %s", code).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            assertThat(e.getCode()).isEqualTo("weather_unavailable");
        }
    }

    @Test
    void aRefusedRequestIsABadGateway() {
        status = 400;
        body = "{\"error\": true, \"reason\": \"bad point\"}";

        ApiException e = catchThrowableOfType(ApiException.class, () -> client().fetch(LAT, LON));

        assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(e.getCode()).isEqualTo("weather_error");
    }

    @Test
    void aSlowSourceIsUnavailable() {
        delayMillis = 1500;

        ApiException e = catchThrowableOfType(ApiException.class, () -> client().fetch(LAT, LON));

        assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(e.getCode()).isEqualTo("weather_unavailable");
    }

    @Test
    void aSourceThatIsDownIsUnavailable() throws IOException {
        int freePort;
        try (ServerSocket socket = new ServerSocket(0)) {
            freePort = socket.getLocalPort();
        }

        ApiException e = catchThrowableOfType(ApiException.class,
                () -> client("http://127.0.0.1:" + freePort).fetch(LAT, LON));

        assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(e.getCode()).isEqualTo("weather_unavailable");
    }

    @Test
    void aHoleOrAShortSeriesIsNotUsed() {
        for (String broken : new String[] {answer(24, "null"), answer(10, ""), "{\"timezone\": \"Asia/Almaty\"}",
                "not json"}) {
            body = broken;

            ApiException e = catchThrowableOfType(ApiException.class, () -> client().fetch(LAT, LON));

            assertThat(e.getStatus()).as(broken).isEqualTo(HttpStatus.BAD_GATEWAY);
            assertThat(e.getCode()).isEqualTo("weather_error");
        }
    }
}
