package kz.agroadvisor.weather.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import kz.agroadvisor.weather.service.Forecast.Hour;
import kz.agroadvisor.weather.service.SprayAdvisor.Window;

class SprayAdvisorTest {

    private static final LocalDateTime START = LocalDateTime.of(2026, 6, 1, 0, 0);

    /** Hours from START, one per entry: wind 2 m/s, 18 degrees, dry, unless a test changes one. */
    private static List<Hour> calm(int count) {
        List<Hour> hours = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            hours.add(hour(i, 18, 0, 2));
        }
        return hours;
    }

    private static Hour hour(int index, double temperature, double rain, double wind) {
        return new Hour(START.plusHours(index), temperature, rain, 0, wind, 1);
    }

    @Test
    void aCalmDryWarmHourIsGoodWhenSixDryEntriesFollow() {
        boolean[] good = SprayAdvisor.goodHours(calm(8));

        // The last six hours have fewer than six entries after them: the dry spell cannot be shown
        assertThat(good).containsExactly(true, true, false, false, false, false, false, false);
    }

    @Test
    void windAboveFourMetresPerSecondSpoilsTheHour() {
        List<Hour> hours = calm(7);
        hours.set(0, hour(0, 18, 0, 4.1));

        assertThat(SprayAdvisor.goodHours(hours)[0]).isFalse();
        hours.set(0, hour(0, 18, 0, 4.0));
        assertThat(SprayAdvisor.goodHours(hours)[0]).isTrue();
    }

    @Test
    void temperatureMustBeFromTenToTwentyFiveDegrees() {
        for (double[] c : new double[][] {{9.9, 0}, {10, 1}, {25, 1}, {25.1, 0}}) {
            List<Hour> hours = calm(7);
            hours.set(0, hour(0, c[0], 0, 2));
            assertThat(SprayAdvisor.goodHours(hours)[0]).as("temperature %s", c[0]).isEqualTo(c[1] == 1);
        }
    }

    @Test
    void rainInTheSixHoursFromTheStartSpoilsTheHour() {
        List<Hour> hours = calm(12);
        // The entry 5 is the rain of the hour before it, from 04:00 to 05:00
        hours.set(5, hour(5, 18, 0.1, 2));

        boolean[] good = SprayAdvisor.goodHours(hours);

        // Spraying from 00:00 to 04:00 meets that rain within six hours (entries up to 6 hours later). Starting at
        // 05:00 is after the rain: it is the entries 6 to 11 that count, and they are dry
        assertThat(good).containsExactly(false, false, false, false, false, true, false, false, false, false, false,
                false);
    }

    @Test
    void theRainOfTheHourBeforeTheStartDoesNotCount() {
        List<Hour> hours = calm(8);
        // The entry 0 is the rain from the previous hour: it is before the start of hour 0
        hours.set(0, hour(0, 18, 5, 2));

        assertThat(SprayAdvisor.goodHours(hours)[0]).isTrue();
    }

    @Test
    void rainInTheLastHourOfTheWindowSpoilsIt() {
        List<Hour> hours = calm(8);
        // The entry 6 is the rain of 05:00 to 06:00, the last of the six hours that start at 00:00
        hours.set(6, hour(6, 18, 0.1, 2));

        assertThat(SprayAdvisor.goodHours(hours)[0]).isFalse();
    }

    @Test
    void joinsConsecutiveGoodHoursIntoOneWindow() {
        List<Hour> hours = calm(10);

        List<Window> windows = SprayAdvisor.windows(hours, SprayAdvisor.goodHours(hours));

        // Hours 0 to 3 are good (each has six entries after it): the window ends with hour 3, that is at 04:00
        assertThat(windows).containsExactly(new Window(START, START.plusHours(4)));
    }

    @Test
    void splitsWindowsAtABadHour() {
        List<Hour> hours = calm(20);
        hours.set(8, hour(8, 30, 0, 2));
        boolean[] good = new boolean[hours.size()];
        good[1] = true;
        good[2] = true;
        good[5] = true;

        List<Window> windows = SprayAdvisor.windows(hours, good);

        assertThat(windows).containsExactly(new Window(START.plusHours(1), START.plusHours(3)),
                new Window(START.plusHours(5), START.plusHours(6)));
    }

    @Test
    void noGoodHoursMeansNoWindows() {
        List<Hour> hours = calm(10);

        assertThat(SprayAdvisor.windows(hours, new boolean[hours.size()])).isEmpty();
        assertThat(SprayAdvisor.goodHours(List.of())).isEmpty();
    }
}
