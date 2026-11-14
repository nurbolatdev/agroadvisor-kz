package kz.agroadvisor.consultations.web;

import java.time.Instant;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

import kz.agroadvisor.consultations.repository.ConsultationMessageRepository.Message;

/** A chat message. {@code readAt} is when the other side read it. */
public record MessageResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID senderId,
        @Schema(description = "Null for a photo without text", nullable = true) String text,
        @Schema(description = "Relative path of the photo; always null until chat photos arrive", nullable = true)
        String photoUrl,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
        @Schema(nullable = true) Instant readAt) {

    static MessageResponse of(Message m) {
        // photoUrl is filled when chat photos arrive; there is no endpoint to serve them yet
        return new MessageResponse(m.id(), m.senderId(), m.text(), null, m.createdAt(), m.readAt());
    }
}
