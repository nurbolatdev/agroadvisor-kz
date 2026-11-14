package kz.agroadvisor.consultations.web;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MultipartFile;

import kz.agroadvisor.consultations.service.ConsultationMessageService;
import kz.agroadvisor.consultations.service.ConsultationMessageService.PhotoContent;
import kz.agroadvisor.diagnosis.service.DiagnosisService;

/**
 * Chat of a consultation. Another user's consultation and a missing one both answer 404
 * consultation_not_found.
 */
@RestController
@RequestMapping("/api/consultations")
@PreAuthorize("(hasRole('FARMER') or hasRole('AGROCHEMIST')) and @featureAccess.allows(authentication, 'consultations')")
public class ConsultationMessageController {

    @Schema(name = "ConsultationUnreadCount")
    public record UnreadCount(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long count) {
    }

    @Schema(name = "ConsultationReadResult")
    public record ReadResult(
            @Schema(description = "Incoming messages of this consultation that are still unread",
                    requiredMode = Schema.RequiredMode.REQUIRED) int unreadCount) {
    }

    private final ConsultationMessageService messages;

    public ConsultationMessageController(ConsultationMessageService messages) {
        this.messages = messages;
    }

    @PostMapping("/{id}/messages")
    @Operation(operationId = "sendConsultationMessage",
            description = "Only in an active consultation: 409 invalid_consultation_state (reason = current "
                    + "status). 429 rate_limited after 30 messages a minute.")
    public ResponseEntity<MessageResponse> send(@PathVariable UUID id, @Valid @RequestBody SendMessageRequest request,
            Authentication authentication) {
        MessageResponse sent = MessageResponse.of(messages.send(me(authentication), id, request.text()));
        return ResponseEntity.created(URI.create("/api/consultations/" + id + "/messages")).body(sent);
    }

    @PostMapping(value = "/{id}/messages/photo", consumes = "multipart/form-data")
    @Operation(operationId = "sendConsultationPhoto",
            description = "A JPEG or PNG photo of up to 10 MB with an optional text, in an active consultation. "
                    + "The type is taken from the first bytes, the metadata (GPS) is removed. 400 invalid_image "
                    + "(another type or a broken file); 413 payload_too_large (over 10 MB); 409 "
                    + "invalid_consultation_state; 429 rate_limited; 503 storage_unavailable.")
    @ApiResponse(responseCode = "201", description = "The message with the photo")
    public ResponseEntity<MessageResponse> sendPhoto(@PathVariable UUID id,
            @RequestParam("image") MultipartFile image, @RequestPart(value = "text", required = false) String text,
            Authentication authentication) throws IOException {
        MessageResponse sent = MessageResponse.of(messages.sendPhoto(me(authentication), id, text, image.getBytes()));
        return ResponseEntity.created(URI.create("/api/consultations/" + id + "/messages")).body(sent);
    }

    /** The photo bytes for the two participants only; it never changes, so it is cached for a year. */
    @GetMapping("/{id}/messages/{messageId}/photo")
    @Operation(operationId = "getConsultationPhoto")
    @ApiResponse(responseCode = "200", description = "A JPEG or PNG photo",
            content = {@Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
                    @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary"))})
    public ResponseEntity<byte[]> photo(@PathVariable UUID id, @PathVariable UUID messageId,
            Authentication authentication, WebRequest request) {
        String key = messages.photoKey(me(authentication), id, messageId);
        String etag = DiagnosisService.photoEtag(key);
        CacheControl cache = CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable();
        if (request.checkNotModified(etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cache).build();
        }
        PhotoContent photo = messages.loadPhoto(key);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .cacheControl(cache)
                .eTag(etag)
                .header("X-Content-Type-Options", "nosniff")
                .body(photo.bytes());
    }

    @GetMapping("/{id}/messages")
    @Operation(operationId = "listConsultationMessages",
            description = "Without a cursor or with before: the newest first, older than before. With after: the "
                    + "oldest first, newer than after. Not both. A cursor that is not a message of this "
                    + "consultation is 404 message_not_found.")
    public List<MessageResponse> history(@PathVariable UUID id,
            @RequestParam(required = false) UUID before, @RequestParam(required = false) UUID after,
            @RequestParam(defaultValue = "30") @Min(1) @Max(100) int limit, Authentication authentication) {
        return messages.history(me(authentication), id, before, after, limit).stream()
                .map(MessageResponse::of).toList();
    }

    @PostMapping("/{id}/read")
    @Operation(operationId = "markConsultationRead",
            description = "Marks the incoming messages up to upTo (inclusive) as read; repeating it changes "
                    + "nothing. 404 message_not_found if upTo is not a message of this consultation.")
    public ReadResult read(@PathVariable UUID id, @Valid @RequestBody MarkReadRequest request,
            Authentication authentication) {
        return new ReadResult(messages.markRead(me(authentication), id, request.upTo()));
    }

    @GetMapping("/unread-count")
    @Operation(operationId = "getConsultationUnreadCount",
            description = "Incoming unread messages in all consultations of the caller")
    public UnreadCount unreadCount(Authentication authentication) {
        return new UnreadCount(messages.unreadTotal(me(authentication)));
    }

    private static UUID me(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
