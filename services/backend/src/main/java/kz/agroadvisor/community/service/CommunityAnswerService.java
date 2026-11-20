package kz.agroadvisor.community.service;

import static kz.agroadvisor.community.service.CommunityQuestionService.hasControlChars;
import static kz.agroadvisor.community.service.CommunityQuestionService.normalize;

import java.time.Duration;
import java.util.List;
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
import kz.agroadvisor.community.repository.CommunityQuestionRepository;
import kz.agroadvisor.community.repository.CommunityQuestionRepository.Question;

/**
 * Answers to community questions and the best answer, which only the author of the question picks.
 * A hidden question or answer is 404 for everyone.
 */
@Service
public class CommunityAnswerService {

    public static final int MAX_TEXT = 2000;
    public static final int MAX_ANSWERS = 200;

    private final CommunityQuestionRepository questions;
    private final CommunityAnswerRepository answers;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties limits;
    private final TransactionTemplate tx;

    public CommunityAnswerService(CommunityQuestionRepository questions, CommunityAnswerRepository answers,
            RateLimiter rateLimiter, RateLimitProperties limits, TransactionTemplate tx) {
        this.questions = questions;
        this.answers = answers;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
        this.tx = tx;
    }

    /**
     * Answers a visible question; the author of the question may answer too. The text is checked first, then
     * the rate limit; the answer count is checked under the lock of the question row, so concurrent answers
     * cannot pass the limit.
     */
    public Answer answer(UUID me, UUID questionId, String text) {
        String body = text == null ? "" : normalize(text);
        if (body.isEmpty() || body.length() > MAX_TEXT || hasControlChars(body)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "The answer must have 1 to " + MAX_TEXT + " characters, without control characters");
        }
        rateLimiter.check("community-answers", me.toString(), limits.communityAnswersPerHour(),
                Duration.ofHours(1));
        UUID id = tx.execute(status -> {
            lockVisible(questionId);
            if (answers.count(questionId) >= MAX_ANSWERS) {
                throw new ApiException(HttpStatus.CONFLICT, CommunityErrors.ANSWER_LIMIT,
                        "The question already has " + MAX_ANSWERS + " answers");
            }
            return answers.insert(questionId, me, body);
        });
        return answers.findVisible(questionId, id, me).orElseThrow(CommunityAnswerService::answerNotFound);
    }

    /** Visible answers: the best first, then by score, creation time and id. */
    public List<Answer> list(UUID me, UUID questionId) {
        visible(questionId);
        return answers.list(questionId, me);
    }

    /** Picks the best answer, replacing the previous one; repeating the same pick changes nothing. */
    public void accept(UUID me, UUID questionId, UUID answerId) {
        tx.executeWithoutResult(status -> {
            Question question = lockVisible(questionId);
            requireAuthor(me, question);
            Answer answer = answers.findVisible(questionId, answerId, me)
                    .orElseThrow(CommunityAnswerService::answerNotFound);
            if (answer.authorId().equals(me)) {
                throw new ApiException(HttpStatus.CONFLICT, CommunityErrors.OWN_ANSWER,
                        "Your own answer cannot be the best one");
            }
            if (!answerId.equals(question.acceptedAnswerId())) {
                answers.setAccepted(questionId, answerId);
            }
        });
    }

    /** Clears the best answer; without one it does nothing. */
    public void unaccept(UUID me, UUID questionId) {
        tx.executeWithoutResult(status -> {
            Question question = lockVisible(questionId);
            requireAuthor(me, question);
            if (question.acceptedAnswerId() != null) {
                answers.setAccepted(questionId, null);
            }
        });
    }

    private Question lockVisible(UUID questionId) {
        if (!questions.lock(questionId)) {
            throw notFound();
        }
        return visible(questionId);
    }

    private Question visible(UUID questionId) {
        return questions.findVisible(questionId).orElseThrow(CommunityAnswerService::notFound);
    }

    private static void requireAuthor(UUID me, Question question) {
        if (!question.authorId().equals(me)) {
            throw new ApiException(HttpStatus.FORBIDDEN, CommunityErrors.NOT_QUESTION_AUTHOR,
                    "Only the author of the question can pick the best answer");
        }
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, CommunityErrors.QUESTION_NOT_FOUND, "Question not found");
    }

    private static ApiException answerNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, CommunityErrors.ANSWER_NOT_FOUND, "Answer not found");
    }
}
