package kz.agroadvisor.community.web;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** The crops a user follows, in the request and in the response (alphabetical). */
@Schema(name = "CommunitySubscriptions")
public record SubscriptionsBody(
        @NotNull @Schema(description = "Up to 20 different crop codes", requiredMode = Schema.RequiredMode.REQUIRED)
        List<String> crops) {
}
