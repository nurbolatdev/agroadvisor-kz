package kz.agroadvisor.community.web;

import java.time.Instant;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

import kz.agroadvisor.community.service.CommunityInvitationService.Invitation;

/** An agrochemist invited to a question; invitedAt is the first invitation when it was repeated. */
@Schema(name = "CommunityInvitation")
public record InvitationResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID questionId,
        @Schema(requiredMode = RequiredMode.REQUIRED) Agrochemist agrochemist,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant invitedAt) {

    /** The invited agrochemist. */
    @Schema(name = "CommunityInvitationAgrochemist")
    public record Agrochemist(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String name) {
    }

    static InvitationResponse of(Invitation invitation) {
        return new InvitationResponse(invitation.questionId(),
                new Agrochemist(invitation.agrochemistId(), invitation.agrochemistName()), invitation.invitedAt());
    }
}
