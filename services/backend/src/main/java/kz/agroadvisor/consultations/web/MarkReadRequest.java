package kz.agroadvisor.consultations.web;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** The newest message the caller has seen; it and every earlier incoming message become read. */
public record MarkReadRequest(
        @NotNull @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID upTo) {
}
