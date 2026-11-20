package kz.agroadvisor.analytics.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.analytics.repository.DashboardRepository;
import kz.agroadvisor.analytics.repository.DashboardRepository.DayCount;
import kz.agroadvisor.analytics.repository.DashboardRepository.DiagnosisTotals;
import kz.agroadvisor.analytics.repository.DashboardRepository.SignupBucket;
import kz.agroadvisor.diagnosis.service.AiQualityService;
import kz.agroadvisor.diagnosis.service.AiQualityService.Period;

/**
 * Admin overview: what the backend can count today (diagnoses, people, agrochemist applications). Every change
 * is against the previous window of the same length that ends where this one starts.
 */
@Service
public class DashboardService {

    private static final long WEEK_SECONDS = 7 * 24 * 3600L;

    public record DashboardChange(
            @Schema(requiredMode = RequiredMode.REQUIRED) int value,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Percent against the previous window; 0 when it had none") int changePercent) {
    }

    public record DashboardShare(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "0–100, whole numbers") int percent,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Percentage points against the previous window; 0 when either window had no diagnoses") int changePoints) {
    }

    public record DashboardDay(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "UTC date; the first day of the week for the season") String date,
            @Schema(requiredMode = RequiredMode.REQUIRED) int count) {
    }

    public record DashboardSignup(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Week (from 1) for 7d and 30d, month (0 = January) for the season") int bucket,
            @Schema(requiredMode = RequiredMode.REQUIRED) int farmers,
            @Schema(requiredMode = RequiredMode.REQUIRED) int agrochemists) {
    }

    public record DashboardOverview(
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "7d", "30d", "season" }) String period,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Users who made a diagnosis in the window") DashboardChange activeUsers,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Diagnoses in the window") DashboardChange diagnoses,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Mean confidence of the model's top answer; 0 with no diagnoses") DashboardShare avgConfidence,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Share of diagnoses below the asked confidence threshold") DashboardShare lowConfidenceShare,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Agrochemist applications waiting for the admin: pending and documents requested (all time)") int pendingVerifications,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "One point per day (per week for the season) from the first day of the window to today, zeros included") List<DashboardDay> diagnosesByDay,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "New accounts without the admin role, every bucket of the window, zeros included") List<DashboardSignup> newUsers) {
    }

    private final DashboardRepository repository;
    private final Clock clock;

    public DashboardService(DashboardRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /** @param threshold confidence below which a diagnosis counts as low, in percent (0–100) */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public DashboardOverview overview(Period period, int threshold) {
        Instant now = clock.instant();
        Instant from = AiQualityService.since(period, now);
        Instant previousFrom = from.minus(Duration.between(from, now));
        double limit = threshold / 100.0;
        DiagnosisTotals current = repository.totals(from, now, limit);
        DiagnosisTotals previous = repository.totals(previousFrom, from, limit);
        // a change against a window with no diagnoses (or from one) says nothing
        boolean comparable = current.diagnoses() > 0 && previous.diagnoses() > 0;

        boolean season = period == Period.SEASON;
        List<DayCount> series = season ? repository.perWeek(from, now) : repository.perDay(from, now);
        List<DashboardSignup> signups = season ? monthlySignups(from, now) : weeklySignups(from, now);

        int avg = percent(current.avgConfidence());
        int low = share(current);
        return new DashboardOverview(period.code(), now,
                new DashboardChange(current.activeUsers(),
                        percentChange(current.activeUsers(), previous.activeUsers())),
                new DashboardChange(current.diagnoses(), percentChange(current.diagnoses(), previous.diagnoses())),
                new DashboardShare(avg, comparable ? avg - percent(previous.avgConfidence()) : 0),
                new DashboardShare(low, comparable ? low - share(previous) : 0),
                repository.pendingVerifications(),
                series.stream().map(d -> new DashboardDay(d.date().toString(), d.count())).toList(),
                signups);
    }

    /** Weeks 1..n of the window, n = the weeks it touches (a part of a week counts). */
    private List<DashboardSignup> weeklySignups(Instant from, Instant to) {
        Map<Integer, SignupBucket> found = byBucket(repository.signupsPerWeek(from, to));
        int weeks = (int) Math.ceil(Duration.between(from, to).toSeconds() / (double) WEEK_SECONDS);
        List<DashboardSignup> out = new ArrayList<>();
        for (int week = 1; week <= Math.max(weeks, 1); week++) {
            out.add(signup(week, found.get(week)));
        }
        return out;
    }

    /** Every calendar month from the one of {@code from} to the one of {@code to}, oldest first. */
    private List<DashboardSignup> monthlySignups(Instant from, Instant to) {
        Map<Integer, SignupBucket> found = byBucket(repository.signupsPerMonth(from, to));
        YearMonth last = YearMonth.from(to.atZone(ZoneOffset.UTC));
        List<DashboardSignup> out = new ArrayList<>();
        for (YearMonth m = YearMonth.from(from.atZone(ZoneOffset.UTC)); !m.isAfter(last); m = m.plusMonths(1)) {
            int bucket = m.getMonthValue() - 1;
            out.add(signup(bucket, found.get(bucket)));
        }
        return out;
    }

    private static Map<Integer, SignupBucket> byBucket(List<SignupBucket> rows) {
        Map<Integer, SignupBucket> map = new HashMap<>();
        rows.forEach(r -> map.put(r.bucket(), r));
        return map;
    }

    private static DashboardSignup signup(int bucket, SignupBucket row) {
        return row == null ? new DashboardSignup(bucket, 0, 0)
                : new DashboardSignup(bucket, row.farmers(), row.agrochemists());
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
