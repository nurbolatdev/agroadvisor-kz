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
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.analytics.repository.CommunityStatsRepository;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.ActivityBucket;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.Bucket;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.ConsultationTotals;
import kz.agroadvisor.analytics.repository.CommunityStatsRepository.QuestionTotals;
import kz.agroadvisor.diagnosis.service.AiQualityService;
import kz.agroadvisor.diagnosis.service.AiQualityService.Period;

/**
 * Statistics of the community for the admin. Every change is against the previous window of the same length that
 * ends where this one starts; the list of unanswered questions does not depend on the window.
 */
@Service
public class CommunityStatsService {

    /** How many unanswered questions the list carries at most. */
    static final int UNANSWERED_LIMIT = 50;
    private static final int TOP_MEMBERS = 4;
    private static final long WEEK_SECONDS = 7 * 24 * 3600L;

    public record CommunityCount(
            @Schema(requiredMode = RequiredMode.REQUIRED) int value,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Percent against the previous window; 0 when it had none") int changePercent) {
    }

    public record CommunityFirstAnswer(
            @Schema(requiredMode = RequiredMode.NOT_REQUIRED, nullable = true, description = "Mean minutes from a question to the first visible answer of somebody else; null when no question of the window has one") Integer value,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Minutes against the previous window; 0 when either window has no value") int changeMinutes) {
    }

    public record CommunityShare(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "0–100, whole numbers") int percent,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Percentage points against the previous window; 0 when either window had no questions") int changePoints) {
    }

    public record CommunityUnansweredTotal(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Visible questions older than 24 hours without a visible answer of somebody else, right now") int value,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Now minus the same count at the start of the window (an approximation: current hiding flags)") int change) {
    }

    public record CommunityActivity(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Weekday (0 = Monday) for 7d, week from 1 for 30d, month (0 = January) for the season") int bucket,
            @Schema(requiredMode = RequiredMode.REQUIRED) int questions,
            @Schema(requiredMode = RequiredMode.REQUIRED) int answers) {
    }

    public record CommunityMember(
            @Schema(requiredMode = RequiredMode.REQUIRED) String name,
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "farmer", "agrochemist" }) String role,
            @Schema(requiredMode = RequiredMode.REQUIRED) int answers) {
    }

    public record CommunityInvitedAgrochemist(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String name) {
    }

    public record CommunityUnanswered(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String title,
            @Schema(requiredMode = RequiredMode.REQUIRED) String cropCode,
            @Schema(requiredMode = RequiredMode.REQUIRED) long regionId,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Whole hours since the question was created") long hoursWithoutAnswer,
            @Schema(requiredMode = RequiredMode.NOT_REQUIRED, nullable = true, description = "The agrochemist most recently invited to the question; null when nobody was invited") CommunityInvitedAgrochemist invitedAgrochemist) {
    }

    public record CommunityConsultations(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Requested in the window") int requests,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Closed in the window") int closed,
            @Schema(requiredMode = RequiredMode.NOT_REQUIRED, nullable = true, description = "Mean minutes from request to acceptance over those accepted in the window; null when none was") Integer avgResponseMinutes) {
    }

    public record CommunityStats(
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "7d", "30d", "season" }) String period,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Visible questions created in the window") CommunityCount questions,
            @Schema(requiredMode = RequiredMode.REQUIRED) CommunityFirstAnswer firstAnswerMinutes,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Share of solved questions among the visible questions of the window") CommunityShare resolvedShare,
            @Schema(requiredMode = RequiredMode.REQUIRED) CommunityUnansweredTotal unansweredOver24h,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Every bucket of the window, zeros included") List<CommunityActivity> activity,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Up to 4 members with the most visible answers in the window, admins left out") List<CommunityMember> topMembers,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "The oldest unanswered questions first, at most 50") List<CommunityUnanswered> unanswered,
            @Schema(requiredMode = RequiredMode.REQUIRED) CommunityConsultations consultations) {
    }

    private final CommunityStatsRepository repository;
    private final Clock clock;

    public CommunityStatsService(CommunityStatsRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public CommunityStats stats(Period period) {
        Instant now = clock.instant();
        Instant from = AiQualityService.since(period, now);
        Instant previousFrom = from.minus(Duration.between(from, now));

        QuestionTotals current = repository.totals(from, now);
        QuestionTotals previous = repository.totals(previousFrom, from);
        ConsultationTotals consultations = repository.consultations(from, now);

        Integer firstAnswer = minutes(current.avgFirstAnswerMinutes());
        Integer previousFirstAnswer = minutes(previous.avgFirstAnswerMinutes());
        int changeMinutes = firstAnswer == null || previousFirstAnswer == null ? 0
                : firstAnswer - previousFirstAnswer;

        int share = share(current);
        boolean comparable = current.questions() > 0 && previous.questions() > 0;
        int unanswered = repository.unansweredCount(now);

        return new CommunityStats(period.code(),
                new CommunityCount(current.questions(),
                        DashboardService.percentChange(current.questions(), previous.questions())),
                new CommunityFirstAnswer(firstAnswer, changeMinutes),
                new CommunityShare(share, comparable ? share - share(previous) : 0),
                new CommunityUnansweredTotal(unanswered, unanswered - repository.unansweredCount(from)),
                activity(period, from, now),
                repository.topAnswerers(from, now, TOP_MEMBERS).stream()
                        .map(t -> new CommunityMember(t.name(), t.role(), t.answers())).toList(),
                repository.unanswered(now, UNANSWERED_LIMIT).stream()
                        .map(q -> new CommunityUnanswered(q.id(), q.title(), q.cropCode(), q.regionId(),
                                Duration.between(q.createdAt(), now).toHours(),
                                q.invited() == null ? null
                                        : new CommunityInvitedAgrochemist(q.invited().id(), q.invited().name())))
                        .toList(),
                new CommunityConsultations(consultations.requests(), consultations.closed(),
                        minutes(consultations.avgAcceptMinutes())));
    }

    /** Every bucket of the window, oldest first: 7 weekdays, weeks 1..n, or the calendar months of the season. */
    private List<CommunityActivity> activity(Period period, Instant from, Instant to) {
        Bucket bucket = switch (period) {
            case D7 -> Bucket.DAY_OF_WEEK;
            case D30 -> Bucket.WEEK;
            case SEASON -> Bucket.MONTH;
        };
        Map<Integer, ActivityBucket> found = new HashMap<>();
        repository.activity(from, to, bucket).forEach(b -> found.put(b.bucket(), b));
        List<Integer> keys = new ArrayList<>();
        switch (bucket) {
            case DAY_OF_WEEK -> {
                for (int day = 0; day < 7; day++) {
                    keys.add(day);
                }
            }
            case WEEK -> {
                int weeks = (int) Math.ceil(Duration.between(from, to).toSeconds() / (double) WEEK_SECONDS);
                for (int week = 1; week <= Math.max(weeks, 1); week++) {
                    keys.add(week);
                }
            }
            case MONTH -> {
                YearMonth last = YearMonth.from(to.atZone(ZoneOffset.UTC));
                for (YearMonth m = YearMonth.from(from.atZone(ZoneOffset.UTC)); !m.isAfter(last);
                        m = m.plusMonths(1)) {
                    keys.add(m.getMonthValue() - 1);
                }
            }
        }
        return keys.stream().map(key -> {
            ActivityBucket row = found.get(key);
            return row == null ? new CommunityActivity(key, 0, 0)
                    : new CommunityActivity(key, row.questions(), row.answers());
        }).toList();
    }

    private static Integer minutes(Double value) {
        return value == null ? null : (int) Math.round(value);
    }

    private static int share(QuestionTotals t) {
        return t.questions() == 0 ? 0 : (int) Math.round(t.solved() * 100.0 / t.questions());
    }
}
