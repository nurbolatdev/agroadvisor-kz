package kz.agroadvisor.community.web;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** Who to invite to a question. */
public record InvitationRequest(
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "A verified, active agrochemist")
        UUID agrochemistId) {
}
