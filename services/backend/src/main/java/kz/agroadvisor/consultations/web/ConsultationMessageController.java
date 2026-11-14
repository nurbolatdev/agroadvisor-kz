package kz.agroadvisor.consultations.web;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.consultations.service.ConsultationMessageService;

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
