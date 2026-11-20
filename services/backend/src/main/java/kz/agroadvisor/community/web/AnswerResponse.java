package kz.agroadvisor.community.web;

import java.time.Instant;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

import kz.agroadvisor.community.repository.CommunityAnswerRepository.Answer;

/** A visible answer to a community question, with its score and the caller's vote. */
@Schema(name = "CommunityAnswer")
public record AnswerResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID questionId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID authorId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String authorName,
        @Schema(description = "True only for an agrochemist with a verified profile",
                requiredMode = Schema.RequiredMode.REQUIRED) boolean authorExpert,
        @Schema(description = "Whether the caller wrote it", requiredMode = Schema.RequiredMode.REQUIRED)
        boolean mine,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String text,
        @Schema(description = "Sum of the votes", requiredMode = Schema.RequiredMode.REQUIRED) int score,
        @Schema(description = "The caller's vote: -1, 0 or 1", requiredMode = Schema.RequiredMode.REQUIRED)
        int myVote,
        @Schema(description = "The best answer of the question", requiredMode = Schema.RequiredMode.REQUIRED)
        boolean accepted,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {

    static AnswerResponse of(Answer a, UUID me) {
        return new AnswerResponse(a.id(), a.questionId(), a.authorId(), a.authorName(), a.authorExpert(),
                a.authorId().equals(me), a.body(), a.score(), a.myVote(), a.accepted(), a.createdAt());
    }
}
