package kz.agroadvisor.verification.web;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

import kz.agroadvisor.verification.repository.AgrochemistDirectoryRepository.Card;

/** A verified agrochemist as a farmer sees them. There is no phone or e-mail: contact goes through a consultation. */
public record AgrochemistCardResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String fullName,
        @Schema(description = "Specialization codes", requiredMode = Schema.RequiredMode.REQUIRED)
        List<String> specializations,
        @Schema(nullable = true) Integer experienceYears,
        @Schema(description = "Region of the agrochemist", nullable = true) Long regionId,
        @Schema(description = "Crop codes, alphabetical", requiredMode = Schema.RequiredMode.REQUIRED)
        List<String> crops,
        @Schema(description = "When the profile was approved", nullable = true) Instant verifiedAt) {

    static AgrochemistCardResponse of(Card card) {
        return new AgrochemistCardResponse(card.id(), card.fullName(), card.specializations(),
                card.experienceYears(), card.regionId(), card.crops(), card.verifiedAt());
    }
}
