package kz.agroadvisor.weather.service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import kz.agroadvisor.weather.service.Forecast.Hour;

/**
 * The rule for spraying: wind up to 4 m/s, 10 to 25 degrees Celsius, and no precipitation for 6 hours from the
 * start of the hour (the product needs about 6 hours to dry on the leaf). The precipitation of an entry is the
 * sum of the <em>preceding</em> hour, so the hours from the start of hour T to the end of T+5 are the entries
 * T+1 to T+6. An hour with fewer than six entries after it is not good: the dry spell cannot be shown. The
 * numbers come from the product description (wind, temperature and 6 dry hours).
 */
final class SprayAdvisor {

    static final double MAX_WIND_MS = 4.0;
    static final double MIN_TEMPERATURE_C = 10.0;
    static final double MAX_TEMPERATURE_C = 25.0;
    /** Hours of dry weather needed from the start of the hour. */
    static final int DRY_HOURS = 6;

    private SprayAdvisor() {
    }

    /** One flag per hour, in the order of the given hours (consecutive, one hour apart). */
    static boolean[] goodHours(List<Hour> hours) {
        boolean[] good = new boolean[hours.size()];
        for (int i = 0; i < hours.size(); i++) {
            Hour hour = hours.get(i);
            good[i] = hour.windMs() <= MAX_WIND_MS
                    && hour.temperatureC() >= MIN_TEMPERATURE_C && hour.temperatureC() <= MAX_TEMPERATURE_C
                    && dryFor(hours, i);
        }
        return good;
    }

    /** Runs of good hours as windows: from the start of the first hour to the end of the last one. */
    static List<Window> windows(List<Hour> hours, boolean[] good) {
        List<Window> windows = new ArrayList<>();
        LocalDateTime from = null;
        LocalDateTime end = null;
        for (int i = 0; i < hours.size(); i++) {
            LocalDateTime time = hours.get(i).time();
            if (good[i] && from != null && time.equals(end)) {
                end = time.plus(Duration.ofHours(1));
            } else if (good[i]) {
                if (from != null) {
                    windows.add(new Window(from, end));
                }
                from = time;
                end = time.plus(Duration.ofHours(1));
            } else if (from != null) {
                windows.add(new Window(from, end));
                from = null;
            }
        }
        if (from != null) {
            windows.add(new Window(from, end));
        }
        return windows;
    }

    private static boolean dryFor(List<Hour> hours, int start) {
        if (start + DRY_HOURS >= hours.size()) {
            return false;
        }
        for (int k = 1; k <= DRY_HOURS; k++) {
            if (hours.get(start + k).precipitationMm() > 0) {
                return false;
            }
        }
        return true;
    }

    /** A stretch of good hours, local time of the point. */
    record Window(LocalDateTime from, LocalDateTime to) {
    }
}
