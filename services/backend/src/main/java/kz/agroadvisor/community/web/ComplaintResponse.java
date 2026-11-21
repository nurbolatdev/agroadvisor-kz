package kz.agroadvisor.community.web;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

import kz.agroadvisor.community.service.CommunityModerationService.ComplaintView;

/** A moderation case: the reports about one question or answer, its target and its author. */
@Schema(name = "CommunityComplaint")
public record ComplaintResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = {"new", "in_progress", "resolved"})
        String status,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "The most reported reason of the case",
                allowableValues = {"ads", "misinformation", "spam", "abuse"}) String reason,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<ReasonCountResponse> reports,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "The latest comments, up to 5")
        List<String> comments,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
        @Schema(nullable = true, description = "Null until the case is resolved") ResolutionResponse resolution,
        @Schema(requiredMode = RequiredMode.REQUIRED) TargetResponse target,
        @Schema(requiredMode = RequiredMode.REQUIRED) AuthorResponse author) {

    public record ReasonCountResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) String reason,
            @Schema(requiredMode = RequiredMode.REQUIRED) int count) {
    }

    public record ResolutionResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = {"keep", "hide", "block"})
            String action,
            @Schema(nullable = true) String comment,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant resolvedAt) {
    }

    public record TargetResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = {"question", "answer"}) String type,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID questionId,
            @Schema(nullable = true, description = "Set when the target is an answer") UUID answerId,
            @Schema(requiredMode = RequiredMode.REQUIRED) String questionTitle,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Text of the question or the answer")
            String body,
            @Schema(requiredMode = RequiredMode.REQUIRED) String cropCode,
            @Schema(requiredMode = RequiredMode.REQUIRED) long regionId,
            @Schema(requiredMode = RequiredMode.REQUIRED) int photoCount,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Admin URLs of the question photos, "
                    + "/api/admin/community/questions/{id}/photos/{photoId}") List<String> photoUrls,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean hidden) {
    }

    public record AuthorResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String name,
            @Schema(requiredMode = RequiredMode.REQUIRED) String role,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean expert,
            @Schema(requiredMode = RequiredMode.REQUIRED) String status,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Hidden posts of the author, in total")
            int hiddenCount) {
    }

    static ComplaintResponse of(ComplaintView view) {
        var target = view.target();
        var author = view.author();
        return new ComplaintResponse(view.id(), view.status(), view.reason(),
                view.reports().stream().map(r -> new ReasonCountResponse(r.reason(), r.count())).toList(),
                view.comments(), view.createdAt(),
                view.resolution() == null ? null
                        : new ResolutionResponse(view.resolution().action(), view.resolution().comment(),
                                view.resolution().resolvedAt()),
                new TargetResponse(target.type(), target.questionId(), target.answerId(), target.questionTitle(),
                        target.body(), target.cropCode(), target.regionId(), target.photoCount(),
                        target.photoUrls(), target.hidden()),
                new AuthorResponse(author.id(), author.name(), author.role(), author.expert(), author.status(),
                        author.hiddenCount()));
    }
}
