package kz.agroadvisor.community.web;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** Shows a question or an answer to everyone or hides it. */
public record VisibilityRequest(
        @NotNull @Pattern(regexp = "visible|hidden")
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, allowableValues = {"visible", "hidden"})
        String status) {
}
