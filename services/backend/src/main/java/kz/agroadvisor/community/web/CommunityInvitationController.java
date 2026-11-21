package kz.agroadvisor.community.web;

import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.community.service.CommunityInvitationService;

/** Admin: invites a verified agrochemist to answer a community question. */
@RestController
@RequestMapping("/api/admin/community")
@PreAuthorize("hasRole('ADMIN')")
public class CommunityInvitationController {

    private final CommunityInvitationService invitations;

    public CommunityInvitationController(CommunityInvitationService invitations) {
        this.invitations = invitations;
    }

    @PostMapping("/questions/{id}/invitations")
    @Operation(operationId = "inviteAdminCommunityAgrochemist", summary = "Invites a verified, active agrochemist "
            + "to a question and notifies them; repeating the same pair answers 200 with the first time and "
            + "notifies nobody. 404 question_not_found (also a hidden question), 404 agrochemist_not_found, "
            + "409 agrochemist_not_verified.")
    public InvitationResponse invite(@PathVariable UUID id, @Valid @RequestBody InvitationRequest body,
            Authentication authentication) {
        return InvitationResponse.of(invitations.invite(UUID.fromString(authentication.getName()), id,
                body.agrochemistId()));
    }
}
