package kz.agroadvisor.community.web;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

import kz.agroadvisor.community.service.CommunityModerationService.Stats;

/** The numbers of the moderation page; days start at 00:00 UTC, the week is the last seven days. */
@Schema(name = "CommunityModerationStats")
public record ModerationStatsResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) int complaintsToday,
        @Schema(nullable = true, description = "Mean minutes from the first report to the decision, for cases "
                + "resolved in the last 7 days; null when there are none") Double avgResolutionMinutes,
        @Schema(requiredMode = RequiredMode.REQUIRED) int resolvedThisWeek,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Cases not taken into work yet")
        int newComplaints) {

    static ModerationStatsResponse of(Stats stats) {
        return new ModerationStatsResponse(stats.complaintsToday(), stats.avgResolutionMinutes(),
                stats.resolvedThisWeek(), stats.newComplaints());
    }
}
