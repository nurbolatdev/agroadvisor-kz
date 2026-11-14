package kz.agroadvisor.consultations.service;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.common.image.ImageMetadataStripper;
import kz.agroadvisor.common.image.InvalidImageException;
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
    private final ConsultationPhotoStorage photos;
    private final TransactionTemplate tx;
    private final ImageMetadataStripper stripper;
    private final ConsultationEvents events;

    public ConsultationMessageService(ConsultationRepository consultations, ConsultationMessageRepository messages,
            RateLimiter rateLimiter, RateLimitProperties limits, ConsultationPhotoStorage photos,
            TransactionTemplate tx, ImageMetadataStripper stripper, ConsultationEvents events) {
        this.events = events;
        this.consultations = consultations;
        this.messages = messages;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
        this.photos = photos;
        this.tx = tx;
        this.stripper = stripper;
    }

    /** The photo bytes with their type (from the key's extension) and the key as a stable ETag source. */
    public record PhotoContent(byte[] bytes, String contentType, String key) {
    }

    /**
     * Sends a photo (JPEG or PNG of up to 10 MB, recognised by its first bytes) with an optional text. The
     * metadata is stripped, the object is stored, then the row is inserted; if the insert fails the object is
     * removed again. Same rules as {@link #send}: active consultation, participants only, rate limit.
     */
    public Message sendPhoto(UUID me, UUID consultationId, String text, byte[] photo) {
        String body = text == null || text.isBlank() ? null : ConsultationService.normalize(text);
        if (body != null && (body.length() > ConsultationService.MAX_TEXT_LENGTH
                || ConsultationService.hasControlChars(body))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "The text must have at most " + ConsultationService.MAX_TEXT_LENGTH
                            + " characters, without control characters");
        }
        String contentType = contentType(photo);
        rateLimiter.check("consultation-messages", me.toString(), limits.consultationMessagesPerMinute(),
                Duration.ofMinutes(1));
        // A first look, before the slow upload; the checks that count are repeated under the row lock
        requireActive(consultations.findForParticipant(consultationId, me)
                .orElseThrow(ConsultationMessageService::notFound).consultation());
        byte[] stored = clean(photo);
        String key = photos.store(consultationId, stored, contentType);
        UUID id;
        try {
            id = tx.execute(status -> {
                Consultation row = consultations.lock(consultationId).orElseThrow(ConsultationMessageService::notFound);
                if (!row.farmerId().equals(me) && !row.agrochemistId().equals(me)) {
                    throw notFound();
                }
                requireActive(row);
                UUID inserted = consultations.insertPhotoMessage(consultationId, me, body, key, contentType,
                        stored.length);
                events.messageCreated(row, me, inserted);
                return inserted;
            });
        } catch (RuntimeException e) {
            discard(key, e);
            throw e;
        }
        // After the commit: the object now belongs to a saved row and is never removed again
        return messages.find(id).orElseThrow();
    }

    /** The object key of a photo message of a consultation the caller takes part in; otherwise 404. */
    public String photoKey(UUID me, UUID consultationId, UUID messageId) {
        requireParticipant(me, consultationId);
        return messages.find(messageId)
                .filter(m -> m.consultationId().equals(consultationId) && m.photoKey() != null)
                .orElseThrow(ConsultationMessageService::messageNotFound).photoKey();
    }

    /** The photo bytes by object key (from {@link #photoKey}). */
    public PhotoContent loadPhoto(String key) {
        return new PhotoContent(photos.load(key), key.endsWith(".png") ? "image/png" : "image/jpeg", key);
    }

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
    static final int MAX_PHOTO_BYTES = 10 * 1024 * 1024;

    /** The real type from the first bytes; the client's Content-Type header is not trusted. */
    static String contentType(byte[] photo) {
        if (photo.length == 0 || photo.length > MAX_PHOTO_BYTES) {
            throw invalidImage("Send a JPEG or PNG photo of up to 10 MB");
        }
        if (startsWith(photo, JPEG)) {
            return "image/jpeg";
        }
        if (startsWith(photo, PNG)) {
            return "image/png";
        }
        throw invalidImage("Send a JPEG or PNG photo of up to 10 MB");
    }

    private byte[] clean(byte[] photo) {
        try {
            return stripper.strip(photo);
        } catch (InvalidImageException e) {
            throw invalidImage("The photo cannot be read, send another JPEG or PNG");
        }
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        return data.length > prefix.length && Arrays.equals(data, 0, prefix.length, prefix, 0, prefix.length);
    }

    private static ApiException invalidImage(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, ConsultationErrors.INVALID_IMAGE, detail);
    }

    private static void requireActive(Consultation row) {
        if (row.status() != ConsultationStatus.ACTIVE) {
            throw new ApiException(HttpStatus.CONFLICT, ConsultationErrors.INVALID_CONSULTATION_STATE,
                    "Messages can be sent only in an active consultation, this one is " + row.status().code(),
                    row.status().code());
        }
    }

    private void discard(String key, RuntimeException cause) {
        try {
            photos.delete(key);
        } catch (RuntimeException cleanup) {
            cause.addSuppressed(cleanup);
        }
    }

    /** Sends a text message to the other side of an active consultation and moves its last activity. */
    @Transactional
    public Message send(UUID me, UUID consultationId, String text) {
        String body = text == null ? "" : ConsultationService.normalize(text);
        if (body.isEmpty() || body.length() > ConsultationService.MAX_TEXT_LENGTH
                || ConsultationService.hasControlChars(body)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
                    "The text must have 1 to " + ConsultationService.MAX_TEXT_LENGTH + " characters");
        }
        rateLimiter.check("consultation-messages", me.toString(), limits.consultationMessagesPerMinute(),
                Duration.ofMinutes(1));
        Consultation row = consultations.lock(consultationId).orElseThrow(ConsultationMessageService::notFound);
        if (!row.farmerId().equals(me) && !row.agrochemistId().equals(me)) {
            throw notFound();
        }
        requireActive(row);
        UUID id = consultations.insertMessage(consultationId, me, body);
        events.messageCreated(row, me, id);
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
        Consultation row = consultations.findRow(consultationId, me).orElseThrow(ConsultationMessageService::notFound);
        if (!messages.exists(consultationId, upTo)) {
            throw messageNotFound();
        }
        if (messages.markRead(consultationId, me, upTo) > 0) {
            events.messagesRead(row, me, upTo);
        }
        return messages.unreadIn(consultationId, me);
    }

    /** Unread messages of {@code me} in all consultations. */
    @Transactional(readOnly = true)
    public long unreadTotal(UUID me) {
        return messages.unreadTotal(me);
    }

    private void requireParticipant(UUID me, UUID consultationId) {
        if (!consultations.isParticipant(consultationId, me)) {
            throw notFound();
        }
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, ConsultationErrors.CONSULTATION_NOT_FOUND,
                "Consultation not found");
    }

    private static ApiException messageNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, ConsultationErrors.MESSAGE_NOT_FOUND, "Message not found");
    }
}
