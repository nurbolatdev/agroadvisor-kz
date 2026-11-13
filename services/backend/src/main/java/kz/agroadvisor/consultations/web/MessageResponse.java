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
        @Schema(description = "Relative path of the photo, if there is one", nullable = true) String photoUrl,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
        @Schema(nullable = true) Instant readAt) {

    static MessageResponse of(Message m) {
        String photoUrl = m.photoKey() == null ? null
                : "/api/consultations/" + m.consultationId() + "/messages/" + m.id() + "/photo";
        return new MessageResponse(m.id(), m.senderId(), m.text(), photoUrl, m.createdAt(), m.readAt());
    }
}
