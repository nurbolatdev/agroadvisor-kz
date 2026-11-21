package kz.agroadvisor.community.web;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** The decision on a case: leave the target, hide it, or hide it and block its author. */
public record ResolveComplaintRequest(
        @NotNull @Pattern(regexp = "keep|hide|block")
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, allowableValues = {"keep", "hide", "block"})
        String action,
        @Size(max = 500) @Schema(nullable = true, description = "Optional note, up to 500 characters")
        String comment) {
}
