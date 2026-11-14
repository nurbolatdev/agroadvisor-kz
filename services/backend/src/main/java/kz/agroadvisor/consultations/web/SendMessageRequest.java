package kz.agroadvisor.consultations.web;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A text message to the other side of a consultation. */
public record SendMessageRequest(
        @NotBlank @Size(max = 2000) @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                description = "Trimmed; 1 to 2000 characters") String text) {
}
