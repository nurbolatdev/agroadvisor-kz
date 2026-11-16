package kz.agroadvisor.weather.service;

import java.math.BigDecimal;
import java.time.Duration;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;

import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.weather.config.WeatherProperties;

/**
 * The forecast per point rounded to 0.01 degree (about 1 km), cached in Redis for everyone: the weather does not
 * depend on the user, and the source asks not to be hit often. The cache lives as long as the global TTL of the
 * cache manager (15 minutes); the source refreshes its model hourly, so that is fresh enough. A failed call is
 * not cached. This is a separate bean so that the cache proxy is used (a call inside one class would skip it).
 *
 * <p>The method body runs only on a cache miss, so that is where the calls to the source are counted: all users
 * together may make {@code upstreamPerHour} of them (429 {@code rate_limited} after that), so one account
 * walking over many points cannot use up the quota of the source for everybody.
 */
@Component
class ForecastCache {

    static final String CACHE = "weather";
    static final String UPSTREAM_BUCKET = "weather-upstream";

    private final WeatherClient client;
    private final RateLimiter limiter;
    private final WeatherProperties props;

    ForecastCache(WeatherClient client, RateLimiter limiter, WeatherProperties props) {
        this.client = client;
        this.limiter = limiter;
        this.props = props;
    }

    @Cacheable(cacheNames = CACHE, key = "#latitude.toPlainString() + ',' + #longitude.toPlainString()")
    public Forecast forecast(BigDecimal latitude, BigDecimal longitude) {
        limiter.check(UPSTREAM_BUCKET, "global", props.upstreamPerHour(), Duration.ofHours(1));
        return client.fetch(latitude, longitude);
    }
}
