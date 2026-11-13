package kz.agroadvisor.consultations.service;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.ratelimit.RateLimitProperties;
import kz.agroadvisor.common.ratelimit.RateLimiter;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.consultations.model.ConsultationStatus;
import kz.agroadvisor.consultations.repository.ConsultationMessageRepository;
import kz.agroadvisor.consultations.repository.ConsultationMessageRepository.Message;
import kz.agroadvisor.consultations.repository.ConsultationRepository;
import kz.agroadvisor.consultations.repository.ConsultationRepository.Consultation;

/**
 * Chat messages of a consultation. Only its two participants can read or write; anyone else, and a missing
 * consultation, get 404 consultation_not_found. Messages can be sent only while the consultation is active.
 */
@Service
public class ConsultationMessageService {

    public static final int DEFAULT_LIMIT = 30;
    public static final int MAX_LIMIT = 100;

    private final ConsultationRepository consultations;
    private final ConsultationMessageRepository messages;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties limits;

    public ConsultationMessageService(ConsultationRepository consultations, ConsultationMessageRepository messages,
            RateLimiter rateLimiter, RateLimitProperties limits) {
        this.consultations = consultations;
        this.messages = messages;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
    }

    /** Sends a text message to the other side of an active consultation and moves its last activity. */
    @Transactional
    public Message send(UUID me, UUID consultationId, String text) {
        String body = text == null ? "" : text.strip();
        if (body.isEmpty() || body.length() > ConsultationService.MAX_TEXT_LENGTH) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "The text must have 1 to " + ConsultationService.MAX_TEXT_LENGTH + " characters");
        }
        rateLimiter.check("consultation-messages", me.toString(), limits.consultationMessagesPerMinute(),
                Duration.ofMinutes(1));
        Consultation row = consultations.lock(consultationId).orElseThrow(ConsultationMessageService::notFound);
        if (!row.farmerId().equals(me) && !row.agrochemistId().equals(me)) {
            throw notFound();
        }
        if (row.status() != ConsultationStatus.ACTIVE) {
            throw new ApiException(HttpStatus.CONFLICT, ConsultationErrors.INVALID_CONSULTATION_STATE,
                    "Messages can be sent only in an active consultation, this one is " + row.status().code(),
                    row.status().code());
        }
        UUID id = consultations.insertMessage(consultationId, me, body);
        return messages.find(id).orElseThrow();
    }

    /**
     * A page of the history. With {@code before} (or neither) it is the newer-first page older than the cursor;
     * with {@code after} it is the oldest-first page newer than the cursor. A cursor that is not a message of
     * this consultation is 404 message_not_found.
     */
    @Transactional(readOnly = true)
    public List<Message> history(UUID me, UUID consultationId, UUID before, UUID after, int limit) {
        if (before != null && after != null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "Use either before or after, not both");
        }
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "limit must be from 1 to " + MAX_LIMIT);
        }
        requireParticipant(me, consultationId);
        UUID cursor = before != null ? before : after;
        if (cursor != null && !messages.exists(consultationId, cursor)) {
            throw messageNotFound();
        }
        return after != null ? messages.newer(consultationId, after, limit)
                : messages.older(consultationId, before, limit);
    }

    /**
     * Marks the messages of the other side up to {@code upTo} (inclusive) as read. Repeating it changes nothing.
     * Returns how many unread messages the caller still has in this consultation.
     */
    @Transactional
    public int markRead(UUID me, UUID consultationId, UUID upTo) {
        requireParticipant(me, consultationId);
        if (!messages.exists(consultationId, upTo)) {
            throw messageNotFound();
        }
        messages.markRead(consultationId, me, upTo);
        return messages.unreadIn(consultationId, me);
    }

    /** Unread messages of {@code me} in all consultations. */
    @Transactional(readOnly = true)
    public long unreadTotal(UUID me) {
        return messages.unreadTotal(me);
    }

    private void requireParticipant(UUID me, UUID consultationId) {
        consultations.findForParticipant(consultationId, me).orElseThrow(ConsultationMessageService::notFound);
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, ConsultationErrors.CONSULTATION_NOT_FOUND,
                "Consultation not found");
    }

    private static ApiException messageNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, ConsultationErrors.MESSAGE_NOT_FOUND, "Message not found");
    }
}
