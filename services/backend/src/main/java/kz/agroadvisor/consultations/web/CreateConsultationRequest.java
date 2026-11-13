package kz.agroadvisor.consultations.web;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** A farmer's request for a consultation. The text becomes the first message of the chat. */
public record CreateConsultationRequest(
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID agrochemistId,
        @NotBlank @Size(max = 2000) @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String text,
        @Schema(description = "One of the farmer's own diagnoses; the agrochemist sees it through the "
                + "consultation", nullable = true) UUID diagnosisId) {
}
