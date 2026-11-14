package kz.agroadvisor.diagnosis.service;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.catalog.repository.DiseaseRepository;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.diagnosis.model.Diagnosis;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;
import kz.agroadvisor.diagnosis.repository.DiagnosisReviewRepository;
import kz.agroadvisor.diagnosis.repository.DiagnosisReviewRepository.Review;

/**
 * Expert checks of diagnoses. The caller decides <em>who</em> may review (an agrochemist of a consultation the
 * diagnosis is attached to, or an administrator); this service keeps the rules of a verdict and works out what
 * all verdicts of one diagnosis add up to.
 */
@Service
public class DiagnosisReviewService {

    public static final String CONFIRMED = "confirmed";
    public static final String CORRECTED = "corrected";
    public static final String UNCLEAR = "unclear";
    public static final Set<String> VERDICTS = Set.of(CONFIRMED, CORRECTED, UNCLEAR);

    public static final int MAX_COMMENT_LENGTH = 2000;

    /** What all verdicts of a diagnosis add up to. {@code correctCode} is set for confirmed and corrected. */
    public record Effective(String status, String correctCode, int reviews) {
        public static final String NONE = "none";
        public static final String DISPUTED = "disputed";
    }

    /** The caller's own review (null if none) and the combined result. */
    public record State(Review mine, Effective effective) {
    }

    private final DiagnosisRepository diagnoses;
    private final DiagnosisReviewRepository reviews;
    private final DiseaseRepository diseases;

    public DiagnosisReviewService(DiagnosisRepository diagnoses, DiagnosisReviewRepository reviews,
            DiseaseRepository diseases) {
        this.diagnoses = diagnoses;
        this.reviews = reviews;
        this.diseases = diseases;
    }

    /**
     * Records the reviewer's verdict (or replaces their earlier one). {@code confirmed} agrees with the model's
     * first class and is possible only for an answer the model stood behind ({@code ok} or {@code low_confidence});
     * {@code corrected} names another class of the catalog; {@code unclear} names none.
     */
    @Transactional
    public State review(UUID reviewer, UUID diagnosisId, String verdict, String correctCode, String comment) {
        Diagnosis diagnosis = diagnoses.findById(diagnosisId).orElseThrow(DiagnosisReviewService::notFound);
        String note = note(comment);
        String code = correctCode == null || correctCode.isBlank() ? null : correctCode.strip();
        String stored = switch (verdict == null ? "" : verdict) {
            case CONFIRMED -> confirmedCode(diagnosis, code);
            case CORRECTED -> correctedCode(diagnosis, code);
            case UNCLEAR -> {
                if (code != null) {
                    throw invalid("An unclear verdict names no class");
                }
                yield null;
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "verdict must be confirmed, corrected or unclear");
        };
        Review saved = reviews.save(diagnosisId, reviewer, verdict, stored, note);
        return new State(saved, effective(reviews.findAll(diagnosisId)));
    }

    /** The caller's review and the combined result; 404 for a missing diagnosis. */
    @Transactional(readOnly = true)
    public State state(UUID reviewer, UUID diagnosisId) {
        if (!diagnoses.existsById(diagnosisId)) {
            throw notFound();
        }
        Optional<Review> mine = reviews.find(diagnosisId, reviewer);
        return new State(mine.orElse(null), effective(reviews.findAll(diagnosisId)));
    }

    /**
     * The combined verdict: only {@code confirmed} and {@code corrected} decide; when they all say the same
     * (same verdict and class) that is the result, when they differ the diagnosis is {@code disputed} and counts
     * as neither. With only {@code unclear} marks the result is {@code unclear}; with no reviews, {@code none}.
     */
    public static Effective effective(List<Review> rows) {
        if (rows.isEmpty()) {
            return new Effective(Effective.NONE, null, 0);
        }
        Set<String> decisive = rows.stream().filter(r -> !UNCLEAR.equals(r.verdict()))
                .map(r -> r.verdict() + ":" + r.correctCode()).collect(Collectors.toSet());
        if (decisive.isEmpty()) {
            return new Effective(UNCLEAR, null, rows.size());
        }
        if (decisive.size() > 1) {
            return new Effective(Effective.DISPUTED, null, rows.size());
        }
        Review first = rows.stream().filter(r -> !UNCLEAR.equals(r.verdict())).findFirst().orElseThrow();
        return new Effective(first.verdict(), first.correctCode(), rows.size());
    }

    private String confirmedCode(Diagnosis diagnosis, String code) {
        if (!"ok".equals(diagnosis.getStatus()) && !"low_confidence".equals(diagnosis.getStatus())) {
            throw invalid("The model gave no answer to confirm (status " + diagnosis.getStatus()
                    + "): correct it or mark it unclear");
        }
        if (code != null && !code.equals(diagnosis.getTop1Code())) {
            throw invalid("A confirmed verdict agrees with " + diagnosis.getTop1Code() + "; use corrected");
        }
        return diagnosis.getTop1Code();
    }

    private String correctedCode(Diagnosis diagnosis, String code) {
        if (code == null) {
            throw invalid("A corrected verdict names the right class");
        }
        if (code.equals(diagnosis.getTop1Code())) {
            throw invalid("The class is the model's answer; use confirmed");
        }
        if (!diseases.existsById(code)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, DiagnosisErrors.UNKNOWN_CLASS,
                    "The class " + code + " is not in the catalog");
        }
        return code;
    }

    /** A blank note is no note; a line break and a tab are allowed, other control characters are not. */
    private static String note(String comment) {
        if (comment == null || comment.isBlank()) {
            return null;
        }
        String text = comment.strip();
        if (text.length() > MAX_COMMENT_LENGTH
                || text.chars().anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\t')) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "The comment has at most " + MAX_COMMENT_LENGTH + " characters, without control characters");
        }
        return text;
    }

    private static ApiException invalid(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, DiagnosisErrors.INVALID_VERDICT, detail);
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, DiagnosisErrors.DIAGNOSIS_NOT_FOUND, "Diagnosis not found");
    }
}
