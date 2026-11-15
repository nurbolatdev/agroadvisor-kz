package kz.agroadvisor.notifications.web;

import java.time.Instant;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

import kz.agroadvisor.notifications.repository.PushTokenRepository.PushToken;

/** A registered device. The token itself is never returned. */
public record PushTokenResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(allowableValues = {"android", "ios", "expo"},
                requiredMode = Schema.RequiredMode.REQUIRED) String platform,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
        @Schema(description = "The last registration of this token",
                requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

    static PushTokenResponse of(PushToken t) {
        return new PushTokenResponse(t.id(), t.platform(), t.createdAt(), t.updatedAt());
    }
}
