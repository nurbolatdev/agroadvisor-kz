package kz.agroadvisor.dashboard.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.dashboard.repository.DashboardRepository;
import kz.agroadvisor.dashboard.repository.DashboardRepository.DayCount;
import kz.agroadvisor.dashboard.repository.DashboardRepository.DiagnosisTotals;
import kz.agroadvisor.dashboard.repository.DashboardRepository.SignupBucket;
import kz.agroadvisor.diagnosis.service.AiQualityService;
import kz.agroadvisor.diagnosis.service.AiQualityService.Period;

/**
 * Admin overview: what the backend can count today (diagnoses, people, agrochemist applications). Every change
 * is against the previous window of the same length that ends where this one starts.
 */
@Service
public class DashboardService {

    public record Change(
            @Schema(requiredMode = RequiredMode.REQUIRED) int value,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Percent against the previous window; 0 when it had none") int changePercent) {
    }

    public record Share(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "0–100, whole numbers") int percent,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Percentage points against the previous window") int changePoints) {
    }

    public record DayView(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "UTC date; the first day of the week for the season") String date,
            @Schema(requiredMode = RequiredMode.REQUIRED) int count) {
    }

    public record SignupView(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Week (from 1) for 7d and 30d, month (0 = January) for the season") int bucket,
            @Schema(requiredMode = RequiredMode.REQUIRED) int farmers,
            @Schema(requiredMode = RequiredMode.REQUIRED) int agrochemists) {
    }

    public record OverviewView(
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "7d", "30d", "season" }) String period,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Users who made a diagnosis in the window") Change activeUsers,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Diagnoses in the window") Change diagnoses,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Mean confidence of the model's top answer; 0 with no diagnoses") Share avgConfidence,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Share of diagnoses below the asked confidence threshold") Share lowConfidenceShare,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Agrochemist applications waiting for a decision (all time)") int pendingVerifications,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Days with at least one diagnosis; weeks for the season") List<DayView> diagnosesByDay,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "New accounts without the admin role; buckets without any are left out") List<SignupView> newUsers) {
    }

    private final DashboardRepository repository;
    private final Clock clock;

    public DashboardService(DashboardRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /** @param threshold confidence below which a diagnosis counts as low, in percent (0–100) */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public OverviewView overview(Period period, int threshold) {
        Instant now = clock.instant();
        Instant from = AiQualityService.since(period, now);
        Instant previousFrom = from.minus(Duration.between(from, now));
        double limit = threshold / 100.0;
        DiagnosisTotals current = repository.totals(from, now, limit);
        DiagnosisTotals previous = repository.totals(previousFrom, from, limit);

        boolean season = period == Period.SEASON;
        List<DayCount> series = season ? repository.perWeek(from, now) : repository.perDay(from, now);
        List<SignupBucket> signups = season ? repository.signupsPerMonth(from, now)
                : repository.signupsPerWeek(from, now);

        return new OverviewView(period.code(), now,
                new Change(current.activeUsers(), percentChange(current.activeUsers(), previous.activeUsers())),
                new Change(current.diagnoses(), percentChange(current.diagnoses(), previous.diagnoses())),
                new Share(percent(current.avgConfidence()), percent(current.avgConfidence())
                        - percent(previous.avgConfidence())),
                new Share(share(current), share(current) - share(previous)),
                repository.pendingVerifications(),
                series.stream().map(d -> new DayView(d.date().toString(), d.count())).toList(),
                signups.stream().map(s -> new SignupView(s.bucket(), s.farmers(), s.agrochemists())).toList());
    }

    static int percentChange(int now, int before) {
        return before == 0 ? 0 : (int) Math.round((now - before) * 100.0 / before);
    }

    private static int percent(Double fraction) {
        return fraction == null ? 0 : (int) Math.round(fraction * 100);
    }

    private static int share(DiagnosisTotals t) {
        return t.diagnoses() == 0 ? 0 : (int) Math.round(t.lowConfidence() * 100.0 / t.diagnoses());
    }
}
