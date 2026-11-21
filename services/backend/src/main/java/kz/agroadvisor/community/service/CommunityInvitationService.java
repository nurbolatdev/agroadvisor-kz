package kz.agroadvisor.community.service;

import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.community.repository.CommunityInvitationRepository;
import kz.agroadvisor.community.repository.CommunityInvitationRepository.Candidate;
import kz.agroadvisor.notifications.model.NotificationType;
import kz.agroadvisor.notifications.service.NotificationService;
import kz.agroadvisor.notifications.service.NotificationService.Refs;
import kz.agroadvisor.verification.service.AgrochemistVerificationService;

/** An admin invites a verified agrochemist to answer a question; the agrochemist gets a notification. */
@Service
public class CommunityInvitationService {

    /** The invitation as the admin sees it. */
    public record Invitation(UUID questionId, UUID agrochemistId, String agrochemistName, Instant invitedAt) {
    }

    private final CommunityInvitationRepository invitations;
    private final AgrochemistVerificationService verification;
    private final NotificationService notifications;

    public CommunityInvitationService(CommunityInvitationRepository invitations,
            AgrochemistVerificationService verification, NotificationService notifications) {
        this.invitations = invitations;
        this.verification = verification;
        this.notifications = notifications;
    }

    /**
     * Invites the agrochemist to the question. The question must exist and not be hidden; the agrochemist must
     * have the role, an approved profile and an active account. Repeating the same pair changes nothing: no
     * second notification and the first time is returned. Whether the question already has an answer is not
     * checked, an answer may arrive between the list and the click.
     */
    @Transactional
    public Invitation invite(UUID adminId, UUID questionId, UUID agrochemistId) {
        if (!invitations.isQuestionVisible(questionId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, CommunityErrors.QUESTION_NOT_FOUND, "Question not found");
        }
        Candidate candidate = invitations.findCandidate(agrochemistId)
                .filter(Candidate::agrochemist)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, CommunityErrors.AGROCHEMIST_NOT_FOUND,
                        "Agrochemist not found"));
        if (!candidate.active() || !verification.isApproved(agrochemistId)) {
            throw new ApiException(HttpStatus.CONFLICT, CommunityErrors.AGROCHEMIST_NOT_VERIFIED,
                    "The agrochemist is not verified or not active");
        }
        var created = invitations.insert(questionId, agrochemistId, adminId);
        if (created.isPresent()) {
            notifications.notify(agrochemistId, NotificationType.COMMUNITY_INVITATION, Refs.question(questionId));
            return new Invitation(questionId, agrochemistId, candidate.name(), created.get());
        }
        Instant first = invitations.createdAt(questionId, agrochemistId).orElseThrow();
        return new Invitation(questionId, agrochemistId, candidate.name(), first);
    }
}
