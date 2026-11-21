package kz.agroadvisor.community.web;

import java.time.Instant;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

import kz.agroadvisor.community.service.CommunityInvitationService.Invitation;
import kz.agroadvisor.community.service.InvitedAgrochemist;

/** An agrochemist invited to a question; invitedAt is the first invitation when it was repeated. */
@Schema(name = "CommunityInvitation")
public record InvitationResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID questionId,
        @Schema(requiredMode = RequiredMode.REQUIRED) InvitedAgrochemist agrochemist,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant invitedAt) {

    static InvitationResponse of(Invitation invitation) {
        return new InvitationResponse(invitation.questionId(),
                new InvitedAgrochemist(invitation.agrochemistId(), invitation.agrochemistName()),
                invitation.invitedAt());
    }
}
