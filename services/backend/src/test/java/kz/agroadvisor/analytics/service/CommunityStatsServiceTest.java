package kz.agroadvisor.analytics.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import kz.agroadvisor.analytics.repository.CommunityStatsRepository;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.ActivityBucket;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.Bucket;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.ConsultationTotals;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.QuestionTotals;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.TopAnswerer;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.UnansweredQuestion;
import kz.agroadvisor.analytics.service.CommunityStatsService.CommunityStats;
import kz.agroadvisor.diagnosis.service.AiQualityService.Period;

class CommunityStatsServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-18T12:00:00Z");

    private CommunityStatsRepository repository;
    private CommunityStatsService service;

    @BeforeEach
    void setUp() {
        repository = mock(CommunityStatsRepository.class);
        when(repository.totals(any(), any())).thenReturn(new QuestionTotals(0, 0, null));
        when(repository.consultations(any(), any())).thenReturn(new ConsultationTotals(0, 0, null));
        when(repository.activity(any(), any(), any())).thenReturn(List.of());
        when(repository.topAnswerers(any(), any(), anyInt())).thenReturn(List.of());
        when(repository.unanswered(any(), anyInt())).thenReturn(List.of());
        service = new CommunityStatsService(repository, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void anEmptyCommunityGivesZerosAndNulls() {
        CommunityStats stats = service.stats(Period.D30);

        assertThat(stats.period()).isEqualTo("30d");
        assertThat(stats.questions().value()).isZero();
        assertThat(stats.questions().changePercent()).isZero();
        assertThat(stats.firstAnswerMinutes().value()).isNull();
        assertThat(stats.firstAnswerMinutes().changeMinutes()).isZero();
        assertThat(stats.resolvedShare().percent()).isZero();
        assertThat(stats.resolvedShare().changePoints()).isZero();
        assertThat(stats.unansweredOver24h().value()).isZero();
        assertThat(stats.unansweredOver24h().change()).isZero();
        assertThat(stats.topMembers()).isEmpty();
        assertThat(stats.unanswered()).isEmpty();
        assertThat(stats.consultations().avgResponseMinutes()).isNull();
    }

    @Test
    void changesAreAgainstThePreviousWindowOfTheSameLength() {
        Instant from = NOW.minus(Duration.ofDays(7));
        Instant previousFrom = from.minus(Duration.ofDays(7));
        when(repository.totals(from, NOW)).thenReturn(new QuestionTotals(30, 21, 90.4));
        when(repository.totals(previousFrom, from)).thenReturn(new QuestionTotals(20, 10, 120.0));

        CommunityStats stats = service.stats(Period.D7);

        assertThat(stats.questions().value()).isEqualTo(30);
        assertThat(stats.questions().changePercent()).isEqualTo(50);
        assertThat(stats.firstAnswerMinutes().value()).isEqualTo(90);
        assertThat(stats.firstAnswerMinutes().changeMinutes()).isEqualTo(-30);
        assertThat(stats.resolvedShare().percent()).isEqualTo(70);
        assertThat(stats.resolvedShare().changePoints()).isEqualTo(20);
    }

    @Test
    void firstAnswerChangeIsZeroWhenOnlyOneWindowHasAValue() {
        Instant from = NOW.minus(Duration.ofDays(7));
        when(repository.totals(from, NOW)).thenReturn(new QuestionTotals(3, 1, 45.0));

        assertThat(service.stats(Period.D7).firstAnswerMinutes().changeMinutes()).isZero();
    }

    @Test
    void unansweredChangeIsTheCountNowMinusTheCountAtTheStartOfTheWindow() {
        Instant from = NOW.minus(Duration.ofDays(30));
        when(repository.unansweredCount(NOW)).thenReturn(9);
        when(repository.unansweredCount(from)).thenReturn(4);

        CommunityStats stats = service.stats(Period.D30);

        assertThat(stats.unansweredOver24h().value()).isEqualTo(9);
        assertThat(stats.unansweredOver24h().change()).isEqualTo(5);
    }

    @Test
    void everyWeekdayIsPresentForSevenDays() {
        when(repository.activity(any(), any(), any())).thenReturn(List.of(new ActivityBucket(2, 3, 5)));

        var activity = service.stats(Period.D7).activity();

        assertThat(activity).extracting(a -> a.bucket()).containsExactly(0, 1, 2, 3, 4, 5, 6);
        assertThat(activity.get(2).questions()).isEqualTo(3);
        assertThat(activity.get(2).answers()).isEqualTo(5);
        assertThat(activity.get(0).questions()).isZero();
    }

    @Test
    void thirtyDaysAreFiveWeeksFromOne() {
        var activity = service.stats(Period.D30).activity();

        assertThat(activity).extracting(a -> a.bucket()).containsExactly(1, 2, 3, 4, 5);
    }

    @Test
    void theSeasonHasEveryMonthFromMarch() {
        when(repository.activity(any(), any(), any())).thenReturn(List.of(new ActivityBucket(10, 1, 2)));

        var activity = service.stats(Period.SEASON).activity();

        // 1 March to 18 November 2026: March (2) .. November (10)
        assertThat(activity).extracting(a -> a.bucket()).containsExactly(2, 3, 4, 5, 6, 7, 8, 9, 10);
        assertThat(activity.get(8).answers()).isEqualTo(2);
    }

    @Test
    void eachPeriodAsksForItsOwnBuckets() {
        service.stats(Period.D7);
        service.stats(Period.D30);
        service.stats(Period.SEASON);

        verify(repository).activity(any(), any(), eq(Bucket.DAY_OF_WEEK));
        verify(repository).activity(any(), any(), eq(Bucket.WEEK));
        verify(repository).activity(any(), any(), eq(Bucket.MONTH));
    }

    @Test
    void theUnansweredListCarriesWholeHoursAndIsAskedForAtMostFifty() {
        UUID id = UUID.randomUUID();
        when(repository.unanswered(NOW, 50)).thenReturn(List.of(
                new UnansweredQuestion(id, "Why?", "potato", 3L, NOW.minus(Duration.ofMinutes(26 * 60 + 59)))));
        when(repository.topAnswerers(any(), any(), anyInt())).thenReturn(List.of(
                new TopAnswerer(UUID.randomUUID(), "Aigerim", "agrochemist", 7)));
        when(repository.consultations(any(), any())).thenReturn(new ConsultationTotals(5, 2, 12.6));

        CommunityStats stats = service.stats(Period.D30);

        assertThat(stats.unanswered()).hasSize(1);
        assertThat(stats.unanswered().get(0).hoursWithoutAnswer()).isEqualTo(26);
        assertThat(stats.unanswered().get(0).regionId()).isEqualTo(3L);
        assertThat(stats.topMembers().get(0).role()).isEqualTo("agrochemist");
        assertThat(stats.consultations().requests()).isEqualTo(5);
        assertThat(stats.consultations().closed()).isEqualTo(2);
        assertThat(stats.consultations().avgResponseMinutes()).isEqualTo(13);
    }
}
