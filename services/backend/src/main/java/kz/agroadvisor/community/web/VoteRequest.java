package kz.agroadvisor.community.web;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** A vote on an answer: 1 or -1. */
public record VoteRequest(
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED, allowableValues = {"1", "-1"})
        Integer value) {
}
