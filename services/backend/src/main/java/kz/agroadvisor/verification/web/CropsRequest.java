package kz.agroadvisor.verification.web;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/** The whole set of crops of the agrochemist; it replaces the old one. */
@Schema(name = "AgrochemistCropsRequest")
public record CropsRequest(
        @Schema(description = "Crop codes from GET /api/crops; at least one, no repeats", example = "[\"potato\"]")
        @NotEmpty @Size(max = 50) List<@NotBlank @Size(max = 40) String> crops) {
}
