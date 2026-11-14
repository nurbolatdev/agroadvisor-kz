package kz.agroadvisor.diagnosis.web;

import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

import kz.agroadvisor.diagnosis.repository.DiagnosisReviewRepository.Review;
import kz.agroadvisor.diagnosis.service.DiagnosisReviewService.State;

/** The caller's review of a diagnosis and what all reviews of it add up to. */
public record DiagnosisReviewResponse(
        @Schema(description = "The caller's own review; null until they give one", nullable = true) Mine mine,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Combined combined) {

    @Schema(name = "DiagnosisReviewMine")
    public record Mine(
            @Schema(allowableValues = {"confirmed", "corrected", "unclear"},
                    requiredMode = Schema.RequiredMode.REQUIRED) String verdict,
            @Schema(nullable = true) String correctCode,
            @Schema(nullable = true) String comment,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {
    }

    @Schema(name = "DiagnosisReviewCombined", description = "Only confirmed and corrected decide. When they agree "
            + "(same verdict and class) that is the status; when they differ, disputed. With only unclear marks, "
            + "unclear; with no reviews, none. Who reviewed is not shown.")
    public record Combined(
            @Schema(allowableValues = {"none", "confirmed", "corrected", "unclear", "disputed"},
                    requiredMode = Schema.RequiredMode.REQUIRED) String status,
            @Schema(description = "The class, for confirmed and corrected", nullable = true) String correctCode,
            @Schema(description = "How many reviews there are", requiredMode = Schema.RequiredMode.REQUIRED)
            int reviews) {
    }

    public static DiagnosisReviewResponse of(State state) {
        Review r = state.mine();
        Mine mine = r == null ? null
                : new Mine(r.verdict(), r.correctCode(), r.comment(), r.createdAt(), r.updatedAt());
        return new DiagnosisReviewResponse(mine, new Combined(state.effective().status(),
                state.effective().correctCode(), state.effective().reviews()));
    }
}
