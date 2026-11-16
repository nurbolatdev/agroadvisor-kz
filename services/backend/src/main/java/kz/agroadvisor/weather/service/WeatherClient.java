package kz.agroadvisor.weather.service;

import java.math.BigDecimal;

/** The source of the forecast. A failure is an {@code ApiException} (503 or 502), never a half-filled forecast. */
public interface WeatherClient {

    /** The weather now and the hours of the next five days for a point. */
    Forecast fetch(BigDecimal latitude, BigDecimal longitude);
}
