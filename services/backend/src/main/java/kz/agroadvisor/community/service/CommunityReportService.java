package kz.agroadvisor.community.service;

import static kz.agroadvisor.community.service.CommunityQuestionService.hasControlChars;
import static kz.agroadvisor.community.service.CommunityQuestionService.normalize;

import java.time.Duration;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.community.repository.CommunityAnswerRepository;
import kz.agroadvisor.community.repository.CommunityAnswerRepository.Answer;
import kz.agroadvisor.community.repository.CommunityComplaintRepository;
import kz.agroadvisor.community.repository.CommunityQuestionRepository;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Question;

/**
 * Reports of users about a question or an answer. All reports about one target hang under its open case,
 * which the admin decides once; after the decision a new report opens a new case.
 */
@Service
public class CommunityReportService {

    public static final String QUESTION = "question";
    public static final String ANSWER = "answer";
    public static final Set<String> REASONS = Set.of("ads", "misinformation", "spam", "abuse");
    public static final int MAX_COMMENT = 500;

    /**
     * The open case can be resolved between the insert and the lock, then the next attempt opens a new one. After
     * this many attempts in a row the report fails with 409 {@code complaint_resolved} and the user may repeat it.
     */
    private static final int ATTEMPTS = 3;

    private final CommunityQuestionRepository questions;
    private final CommunityAnswerRepository answers;
    private final CommunityComplaintRepository complaints;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties limits;
    private final TransactionTemplate tx;

    public CommunityReportService(CommunityQuestionRepository questions, CommunityAnswerRepository answers,
            CommunityComplaintRepository complaints, RateLimiter rateLimiter, RateLimitProperties limits,
            TransactionTemplate tx) {
        this.questions = questions;
        this.answers = answers;
        this.complaints = complaints;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
        this.tx = tx;
    }

    /**
     * Reports a visible question or answer of someone else. The input is checked first, then the rate limit
     * (every attempt counts, as with shop requests), then the target. A repeat from the same user changes
     * nothing.
     */
    public void report(UUID me, String targetType, UUID targetId, String reason, String comment) {
        if (!QUESTION.equals(targetType) && !ANSWER.equals(targetType)) {
            throw validation("The target type must be question or answer");
        }
        if (targetId == null) {
            throw validation("The target is required");
        }
        if (reason == null || !REASONS.contains(reason)) {
            throw validation("The reason must be one of " + String.join(", ", REASONS.stream().sorted().toList()));
        }
        String note = comment == null ? null : normalize(comment);
        if (note != null && (note.length() > MAX_COMMENT || hasControlChars(note, true))) {
            throw validation("The comment must have up to " + MAX_COMMENT + " characters, without control characters");
        }
        if (note != null && note.isEmpty()) {
            note = null;
        }
        rateLimiter.check("community-reports", me.toString(), limits.communityReportsPerHour(),
                Duration.ofHours(1));

        UUID questionId;
        UUID answerId;
        UUID authorId;
        if (QUESTION.equals(targetType)) {
            Question question = questions.findVisible(targetId).orElseThrow(CommunityReportService::questionNotFound);
            questionId = question.id();
            answerId = null;
            authorId = question.authorId();
        } else {
            Answer answer = answers.findVisibleById(targetId, me).orElseThrow(CommunityReportService::answerNotFound);
            questionId = answer.questionId();
            answerId = answer.id();
            authorId = answer.authorId();
        }
        if (authorId.equals(me)) {
            throw new ApiException(HttpStatus.CONFLICT, CommunityErrors.OWN_CONTENT,
                    "You cannot report your own question or answer");
        }
        String savedNote = note;
        tx.executeWithoutResult(status -> {
            for (int attempt = 0; attempt < ATTEMPTS; attempt++) {
                var complaint = complaints.lockOpen(questionId, answerId);
                if (complaint.isPresent()) {
                    complaints.addReport(complaint.get(), me, reason, savedNote);
                    return;
                }
            }
            throw new ApiException(HttpStatus.CONFLICT, CommunityErrors.COMPLAINT_RESOLVED,
                    "The case was resolved while the report was sent; try again");
        });
    }

    private static ApiException validation(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, detail);
    }

    private static ApiException questionNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, CommunityErrors.QUESTION_NOT_FOUND, "Question not found");
    }

    private static ApiException answerNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, CommunityErrors.ANSWER_NOT_FOUND, "Answer not found");
    }
}
