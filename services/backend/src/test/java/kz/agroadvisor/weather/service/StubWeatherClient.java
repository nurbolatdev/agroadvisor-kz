package kz.agroadvisor.weather.service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Supplier;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The weather source of the Spring tests ({@code app.weather.client=stub}): answers from memory and remembers
 * every point it was asked for. A test changes the answer with {@link #answer} and calls {@link #reset} first.
 */
@Component
@ConditionalOnProperty(name = "app.weather.client", havingValue = "stub")
public class StubWeatherClient implements WeatherClient {

    private final List<BigDecimal[]> points = new CopyOnWriteArrayList<>();
    private volatile Supplier<Forecast> answer = StubWeatherClient::calmFiveDays;

    @Override
    public Forecast fetch(BigDecimal latitude, BigDecimal longitude) {
        points.add(new BigDecimal[] {latitude, longitude});
        return answer.get();
    }

    /** Back to the calm forecast, forgetting the points. */
    public void reset() {
        points.clear();
        answer = StubWeatherClient::calmFiveDays;
    }

    /** What the source gives from now on (it may throw an {@code ApiException}). */
    public void answer(Supplier<Forecast> next) {
        answer = next;
    }

    /** The points the source was asked for, in order. */
    public List<BigDecimal[]> points() {
        return List.copyOf(points);
    }

    /** Five days of calm dry 18-degree hours from two hours ago, local time equal to UTC. */
    public static Forecast calmFiveDays() {
        LocalDateTime start = LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.HOURS).minusHours(2);
        List<Forecast.Hour> hours = new ArrayList<>();
        for (int i = 0; i < 120; i++) {
            hours.add(new Forecast.Hour(start.plusHours(i), 18, 0, 5, 2, 1));
        }
        return new Forecast("Asia/Almaty", 0, new Forecast.Current(start.plusHours(2), 18.5, 2.5, 0, 1), hours);
    }
}
