package kz.agroadvisor.notifications.web;

import java.time.Instant;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

import kz.agroadvisor.notifications.repository.NotificationRepository.Notification;

/** A row of the notification feed: a type, the ids it points to and a counter. No names or texts. */
public record NotificationResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(allowableValues = {"consultation_requested", "consultation_accepted", "consultation_declined",
                "consultation_closed", "consultation_message", "verification_approved",
                "verification_rejected", "verification_documents_requested", "diagnosis_reviewed"},
                requiredMode = Schema.RequiredMode.REQUIRED) String type,
        @Schema(nullable = true) UUID consultationId,
        @Schema(description = "The newest message for consultation_message", nullable = true) UUID messageId,
        @Schema(nullable = true) UUID diagnosisId,
        @Schema(description = "How many events were collapsed into this row",
                requiredMode = Schema.RequiredMode.REQUIRED) int count,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt,
        @Schema(nullable = true) Instant readAt) {

    static NotificationResponse of(Notification n) {
        return new NotificationResponse(n.id(), n.type().code(), n.consultationId(), n.messageId(),
                n.diagnosisId(), n.count(), n.createdAt(), n.updatedAt(), n.readAt());
    }
}
