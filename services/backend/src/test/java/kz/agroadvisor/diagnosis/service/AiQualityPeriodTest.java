package kz.agroadvisor.diagnosis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import kz.agroadvisor.diagnosis.service.AiQualityService.Period;

class AiQualityPeriodTest {

    private static final Instant NOW = Instant.parse("2026-11-18T10:00:00Z");

    @Test
    void shortPeriodsCountBackFromNow() {
        assertThat(AiQualityService.since(Period.D7, NOW)).isEqualTo(Instant.parse("2026-11-11T10:00:00Z"));
        assertThat(AiQualityService.since(Period.D30, NOW)).isEqualTo(Instant.parse("2026-10-19T10:00:00Z"));
    }

    @Test
    void seasonStartsOnTheFirstOfMarch() {
        assertThat(AiQualityService.since(Period.SEASON, NOW)).isEqualTo(Instant.parse("2026-03-01T00:00:00Z"));
        assertThat(AiQualityService.since(Period.SEASON, Instant.parse("2026-03-01T00:00:00Z")))
                .isEqualTo(Instant.parse("2026-03-01T00:00:00Z"));
    }

    @Test
    void seasonBeforeMarchIsLastYears() {
        assertThat(AiQualityService.since(Period.SEASON, Instant.parse("2027-02-28T23:59:59Z")))
                .isEqualTo(Instant.parse("2026-03-01T00:00:00Z"));
    }

    @Test
    void parsesCodesAndRejectsOthers() {
        assertThat(Period.parse("7d")).isEqualTo(Period.D7);
        assertThat(Period.parse("season")).isEqualTo(Period.SEASON);
        assertThatThrownBy(() -> Period.parse("year")).isInstanceOf(IllegalArgumentException.class);
    }
}
