package kz.agroadvisor.calculations.web;

import java.math.BigDecimal;
import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * A season to save. The app calculated {@code results} from the other fields; the server stores them as
 * sent and checks only ranges and shape.
 */
public record CreateCalculationRequest(
        @Schema(description = "Crop code from GET /api/crops", example = "potato") @NotBlank @Size(max = 40)
        String crop,
        @Schema(example = "2026") @NotNull @Min(2000) @Max(2100) Integer season,
        @Schema(description = "The area in hectares (0.0001-10000)", example = "2.5")
        @NotNull @DecimalMin("0.0001") @DecimalMax("10000") @Digits(integer = 5, fraction = 4) BigDecimal areaHa,
        @Schema(description = "The unit the farmer typed the area in; for display only",
                allowableValues = {"ha", "sotka"}) @NotNull @Pattern(regexp = "ha|sotka") String areaUnit,
        @Schema(description = "Yield, centners per hectare", example = "250")
        @NotNull @Positive @DecimalMax("10000") @Digits(integer = 5, fraction = 2) BigDecimal yieldCHa,
        @Schema(description = "Selling price per tonne", example = "90000")
        @NotNull @DecimalMin("0") @Digits(integer = 10, fraction = 2) BigDecimal priceT,
        @Schema(description = "Cost items, name to amount (not negative); 1-30 entries, keys like seedCost")
        @NotEmpty Map<String, @NotNull BigDecimal> costs,
        @Schema(description = "What the app calculated, name to number; 1-30 entries")
        @NotEmpty Map<String, @NotNull BigDecimal> results) {
}
