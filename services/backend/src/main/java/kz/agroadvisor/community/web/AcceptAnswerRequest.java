package kz.agroadvisor.community.web;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** The answer the author of the question picks as the best one. */
public record AcceptAnswerRequest(
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID answerId) {
}
