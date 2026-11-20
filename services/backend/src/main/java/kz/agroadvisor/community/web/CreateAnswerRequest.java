package kz.agroadvisor.community.web;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** The text of an answer; the service trims it and checks 1 to 2000 characters. */
public record CreateAnswerRequest(
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String text) {
}
