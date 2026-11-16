package kz.agroadvisor.weather.service;

/** Error codes of the weather module. */
public final class WeatherErrors {

    /** The weather source did not answer in time, refused or is out of reach (503). */
    public static final String WEATHER_UNAVAILABLE = "weather_unavailable";
    /** The weather source answered, but not with a forecast we can read (502). */
    public static final String WEATHER_ERROR = "weather_error";

    private WeatherErrors() {
    }
}
