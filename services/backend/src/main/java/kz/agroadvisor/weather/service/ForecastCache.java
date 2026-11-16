package kz.agroadvisor.weather.service;

import java.math.BigDecimal;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;

/**
 * The forecast per point rounded to 0.01 degree (about 1 km), cached in Redis for everyone: the weather does not
 * depend on the user, and the source asks not to be hit often. The cache lives as long as the global TTL of the
 * cache manager (15 minutes); the source refreshes its model hourly, so that is fresh enough. A failed call is
 * not cached. This is a separate bean so that the cache proxy is used (a call inside one class would skip it).
 */
@Component
class ForecastCache {

    static final String CACHE = "weather";

    private final WeatherClient client;

    ForecastCache(WeatherClient client) {
        this.client = client;
    }

    @Cacheable(cacheNames = CACHE, key = "#latitude.toPlainString() + ',' + #longitude.toPlainString()")
    public Forecast forecast(BigDecimal latitude, BigDecimal longitude) {
        return client.fetch(latitude, longitude);
    }
}
