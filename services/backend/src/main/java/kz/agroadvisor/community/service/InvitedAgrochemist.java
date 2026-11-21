package kz.agroadvisor.community.service;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/** An agrochemist invited to a community question, as the admin sees them. */
@Schema(name = "CommunityInvitedAgrochemist")
public record InvitedAgrochemist(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) String name) {
}
