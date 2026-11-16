package kz.agroadvisor.calculations.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import kz.agroadvisor.calculations.service.CalculationService.CalculationView;

/** A saved season as the API returns it. */
public record CalculationResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(description = "Crop code", requiredMode = Schema.RequiredMode.REQUIRED) String crop,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int season,
        @Schema(description = "Hectares", requiredMode = Schema.RequiredMode.REQUIRED) BigDecimal areaHa,
        @Schema(allowableValues = {"ha", "sotka"}, requiredMode = Schema.RequiredMode.REQUIRED) String areaUnit,
        @Schema(description = "Centners per hectare", requiredMode = Schema.RequiredMode.REQUIRED)
        BigDecimal yieldCHa,
        @Schema(description = "Price per tonne", requiredMode = Schema.RequiredMode.REQUIRED) BigDecimal priceT,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Map<String, BigDecimal> costs,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Map<String, BigDecimal> results,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {

    static CalculationResponse of(CalculationView view) {
        return new CalculationResponse(view.id(), view.cropCode(), view.season(), view.areaHa(), view.areaUnit(),
                view.yieldCHa(), view.priceT(), view.costs(), view.results(), view.createdAt());
    }
}
