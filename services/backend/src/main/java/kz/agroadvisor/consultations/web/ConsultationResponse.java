package kz.agroadvisor.consultations.web;

import java.time.Instant;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

import kz.agroadvisor.consultations.repository.ConsultationRepository.Consultation;
import kz.agroadvisor.consultations.repository.ConsultationRepository.Item;
import kz.agroadvisor.consultations.repository.ConsultationRepository.LastMessage;

/** A consultation as one participant sees it. */
public record ConsultationResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(allowableValues = {"requested", "active", "declined", "closed"},
                requiredMode = Schema.RequiredMode.REQUIRED) String status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Farmer farmer,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Agrochemist agrochemist,
        @Schema(description = "The attached diagnosis of the farmer, if any", nullable = true) UUID diagnosisId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
        @Schema(nullable = true) Instant acceptedAt,
        @Schema(nullable = true) Instant closedAt,
        @Schema(description = "Who declined or closed it", nullable = true) UUID closedBy,
        @Schema(description = "Null only if the consultation has no messages", nullable = true)
        Last lastMessage,
        @Schema(description = "Incoming messages the caller has not read",
                requiredMode = Schema.RequiredMode.REQUIRED) int unreadCount) {

    @Schema(name = "ConsultationFarmer")
    public record Farmer(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String fullName,
            @Schema(nullable = true) Long regionId) {
    }

    @Schema(name = "ConsultationAgrochemist")
    public record Agrochemist(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String fullName) {
    }

    @Schema(name = "ConsultationLastMessage")
    public record Last(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID senderId,
            @Schema(description = "Up to 140 characters; null for a photo without text", nullable = true)
            String text,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean hasPhoto,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {
    }

    static ConsultationResponse of(Item item) {
        Consultation c = item.consultation();
        LastMessage m = item.lastMessage();
        Last last = m == null ? null : new Last(m.id(), m.senderId(), m.text(), m.hasPhoto(), m.createdAt());
        return new ConsultationResponse(c.id(), c.status().code(),
                new Farmer(c.farmerId(), item.farmerName(), item.farmerRegionId()),
                new Agrochemist(c.agrochemistId(), item.agrochemistName()), c.diagnosisId(), c.createdAt(),
                c.acceptedAt(), c.closedAt(), c.closedBy(), last, item.unreadCount());
    }
}
