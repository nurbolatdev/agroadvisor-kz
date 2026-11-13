package kz.agroadvisor.fields.web;

import java.math.BigDecimal;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/** A new field. {@code location} is optional; the region and the district are found by the server. */
public record CreateFieldRequest(
        @NotBlank @Size(max = 80) String name,
        @Schema(description = "Crop code from GET /api/crops", example = "potato") @NotBlank String crop,
        @Schema(description = "The area in the unit of areaUnit", example = "250")
        @NotNull @Positive @Digits(integer = 7, fraction = 2) BigDecimal area,
        @Schema(description = "ha (hectares) or sotka (1 sotka = 0.01 ha)", allowableValues = {"ha", "sotka"})
        @NotNull @Pattern(regexp = "ha|sotka") String areaUnit,
        @Valid Point location) {

    /** A point on the map: latitude north, longitude east. */
    public record Point(
            @NotNull @DecimalMin("-90") @DecimalMax("90") @Digits(integer = 2, fraction = 6) BigDecimal latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") @Digits(integer = 3, fraction = 6)
            BigDecimal longitude) {
    }
}
