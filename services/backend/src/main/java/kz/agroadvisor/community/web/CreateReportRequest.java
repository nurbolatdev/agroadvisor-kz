package kz.agroadvisor.community.web;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/**
 * A report about a question or an answer. The service checks the reason and the comment (up to 500
 * characters, optional).
 */
public record CreateReportRequest(
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED, allowableValues = {"question", "answer"})
        String targetType,
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID targetId,
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                allowableValues = {"ads", "misinformation", "spam", "abuse"}) String reason,
        String comment) {
}
