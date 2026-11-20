package kz.agroadvisor.diagnosis.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Month;
import java.time.ZoneOffset;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.diagnosis.repository.AiQualityRepository;
import kz.agroadvisor.diagnosis.repository.AiQualityRepository.ClassCount;
import kz.agroadvisor.diagnosis.repository.AiQualityRepository.Mismatch;
import kz.agroadvisor.diagnosis.repository.AiQualityRepository.Training;

/** Admin: how the model performs, from the diagnoses and the experts' checks of them. */
@Service
public class AiQualityService {

    public static final int TOP_DISEASES = 6;
    public static final int TOP_MISMATCHES = 5;

    /** {@code 7d} and {@code 30d} count back from now; {@code season} starts on 1 March (UTC), last year's before it. */
    public enum Period {
        D7("7d"), D30("30d"), SEASON("season");

        private final String code;

        Period(String code) {
            this.code = code;
        }

        public String code() {
            return code;
        }

        public static Period parse(String code) {
            for (Period p : values()) {
                if (p.code.equals(code)) {
                    return p;
                }
            }
            throw new IllegalArgumentException("period must be 7d, 30d or season");
        }
    }

    public record DiseaseCount(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Class code; the catalog entry id when it is in the catalog") String code,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Name in the asked language, the code if the catalog has no such class") String name,
            @Schema(requiredMode = RequiredMode.REQUIRED) int count) {
    }

    public record MismatchView(
            @Schema(requiredMode = RequiredMode.REQUIRED) String aiCode,
            @Schema(requiredMode = RequiredMode.REQUIRED) String aiName,
            @Schema(requiredMode = RequiredMode.REQUIRED) String confirmedCode,
            @Schema(requiredMode = RequiredMode.REQUIRED) String confirmedName,
            @Schema(requiredMode = RequiredMode.REQUIRED) int cases) {
    }

    public record TrainingView(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Photos with an expert decision, all time") int labeled,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Of them, decided in the last 7 days") int addedThisWeek,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Classes those decisions cover") int classes) {
    }

    public record AiQualityView(
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "7d", "30d", "season" }) String period,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Diagnoses in the period") int total,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Diagnoses per confidence bucket: 0–10 %, 10–20 %, … 90–100 %; always 10 numbers") List<Integer> confidenceHistogram,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "At most 6 diseases (no healthy classes), most frequent first") List<DiseaseCount> topDiseases,
            @Schema(requiredMode = RequiredMode.REQUIRED) TrainingView trainingData,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "At most 5, most frequent first") List<MismatchView> mismatches) {
    }

    private final AiQualityRepository repository;
    private final Clock clock;

    public AiQualityService(AiQualityRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /** One snapshot for the four queries, so the totals and the lists agree with each other. */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AiQualityView stats(Period period, String lang) {
        Instant now = clock.instant();
        Instant since = since(period, now);
        int[] buckets = repository.confidenceHistogram(since);
        List<Integer> histogram = java.util.Arrays.stream(buckets).boxed().toList();
        int total = java.util.Arrays.stream(buckets).sum();
        List<DiseaseCount> top = repository.topDiseases(since, lang, TOP_DISEASES).stream()
                .map(AiQualityService::view).toList();
        Training training = repository.training(now.minus(Duration.ofDays(7)));
        List<MismatchView> mismatches = repository.mismatches(since, lang, TOP_MISMATCHES).stream()
                .map(AiQualityService::view).toList();
        return new AiQualityView(period.code(), total, histogram, top,
                new TrainingView(training.labeled(), training.addedSince(), training.classes()), mismatches);
    }

    public static Instant since(Period period, Instant now) {
        return switch (period) {
            case D7 -> now.minus(Duration.ofDays(7));
            case D30 -> now.minus(Duration.ofDays(30));
            case SEASON -> {
                LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
                int year = today.getMonth().getValue() >= Month.MARCH.getValue() ? today.getYear()
                        : today.getYear() - 1;
                yield LocalDate.of(year, Month.MARCH, 1).atStartOfDay(ZoneOffset.UTC).toInstant();
            }
        };
    }

    private static DiseaseCount view(ClassCount c) {
        return new DiseaseCount(c.code(), c.name(), c.count());
    }

    private static MismatchView view(Mismatch m) {
        return new MismatchView(m.aiCode(), m.aiName(), m.confirmedCode(), m.confirmedName(), m.cases());
    }
}
