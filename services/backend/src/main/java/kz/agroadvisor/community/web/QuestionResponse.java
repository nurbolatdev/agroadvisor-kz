package kz.agroadvisor.community.web;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

import kz.agroadvisor.community.repository.CommunityQuestionRepository.Question;
import kz.agroadvisor.community.service.CommunityQuestionService.QuestionView;

/**
 * A question of the community. The region is the author's region at the time of asking; the status is
 * {@code open} until the author picks the best answer, then {@code solved}.
 */
@Schema(name = "CommunityQuestion")
public record QuestionResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID authorId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String authorName,
        @Schema(description = "True only for an agrochemist with a verified profile",
                requiredMode = Schema.RequiredMode.REQUIRED) boolean authorExpert,
        @Schema(description = "Whether the caller asked it", requiredMode = Schema.RequiredMode.REQUIRED)
        boolean mine,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String cropCode,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long regionId,
        @Schema(nullable = true) Long districtId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String text,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, allowableValues = {"open", "solved"}) String status,
        @Schema(description = "Visible answers", requiredMode = Schema.RequiredMode.REQUIRED) int answerCount,
        @Schema(description = "Relative paths of the photos, in order", requiredMode = Schema.RequiredMode.REQUIRED)
        List<String> photoUrls,
        @Schema(description = "Relative path of the attached diagnosis, if there is one", nullable = true)
        String diagnosisUrl,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {

    static QuestionResponse of(QuestionView view, UUID me) {
        Question q = view.question();
        return new QuestionResponse(q.id(), q.authorId(), q.authorName(), q.authorExpert(), q.authorId().equals(me),
                q.cropCode(), q.regionId(), q.districtId(), q.title(), q.body(), q.status(), q.answerCount(),
                view.photoUrls(), view.diagnosisUrl(), q.createdAt());
    }
}
