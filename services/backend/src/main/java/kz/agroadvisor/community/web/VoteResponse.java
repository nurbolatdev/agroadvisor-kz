package kz.agroadvisor.community.web;

import io.swagger.v3.oas.annotations.media.Schema;

import kz.agroadvisor.community.service.CommunityAnswerService.VoteResult;

/** The score of an answer and the caller's vote after the change. */
@Schema(name = "CommunityVote")
public record VoteResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int score,
        @Schema(description = "-1, 0 or 1", requiredMode = Schema.RequiredMode.REQUIRED) int myVote) {

    static VoteResponse of(VoteResult result) {
        return new VoteResponse(result.score(), result.myVote());
    }
}
