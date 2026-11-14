package kz.agroadvisor.diagnosis.web;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** A reviewer's verdict on a diagnosis. */
public record DiagnosisReviewRequest(
        @NotNull @Pattern(regexp = "confirmed|corrected|unclear")
        @Schema(allowableValues = {"confirmed", "corrected", "unclear"}, requiredMode = Schema.RequiredMode.REQUIRED)
        String verdict,
        @Size(max = 80)
        @Schema(description = "The right class (e.g. potato__late_blight). Required for corrected; for confirmed "
                + "it may be omitted (the model's class is taken); not allowed for unclear", nullable = true)
        String correctCode,
        @Size(max = 2000) @Schema(nullable = true) String comment) {
}
