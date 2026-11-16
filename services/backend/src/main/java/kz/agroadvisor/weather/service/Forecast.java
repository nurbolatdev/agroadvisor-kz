package kz.agroadvisor.weather.service;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

/**
 * What the weather source gave for a point, in metric units, as it is kept in the Redis cache (so every part is
 * {@link Serializable}). Times are local to the point; {@code utcOffsetSeconds} turns them into instants.
 */
public record Forecast(String timezone, int utcOffsetSeconds, Current current, List<Hour> hours)
        implements Serializable {

    /** The weather now: degrees Celsius, metres per second, millimetres, WMO weather code. */
    public record Current(LocalDateTime time, double temperatureC, double windMs, double precipitationMm,
            int weatherCode) implements Serializable {
    }

    /**
     * One hour of the forecast. {@code precipitationMm} is the sum over the <em>preceding</em> hour (the way the
     * source reports it). The probability and the weather code are only shown, so the source may leave them
     * empty (null) without spoiling the forecast.
     */
    public record Hour(LocalDateTime time, double temperatureC, double precipitationMm,
            Integer precipitationProbability, double windMs, Integer weatherCode) implements Serializable {
    }
}
