package kz.agroadvisor.fields.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

import kz.agroadvisor.fields.service.FieldService.FieldView;

/** A field as the API returns it. */
public record FieldResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(description = "Crop code", requiredMode = Schema.RequiredMode.REQUIRED) String crop,
        @Schema(description = "The area in the unit the farmer chose (areaUnit)",
                requiredMode = Schema.RequiredMode.REQUIRED) BigDecimal area,
        @Schema(allowableValues = {"ha", "sotka"}, requiredMode = Schema.RequiredMode.REQUIRED) String areaUnit,
        @Schema(description = "The same area in hectares", requiredMode = Schema.RequiredMode.REQUIRED)
        BigDecimal areaHa,
        @Schema(description = "Null when the field has no point", types = {"object", "null"},
                implementation = Location.class) Location location,
        @Schema(description = "Set by the server from the point or the profile", nullable = true) Long regionId,
        @Schema(description = "Set by the server when a district outline holds the point", nullable = true)
        Long districtId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

    @Schema(name = "FieldLocation")
    public record Location(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) BigDecimal latitude,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) BigDecimal longitude) {
    }

    static FieldResponse of(FieldView view) {
        Location location = view.latitude() == null ? null : new Location(view.latitude(), view.longitude());
        return new FieldResponse(view.id(), view.name(), view.cropCode(), view.area(), view.areaUnit(),
                view.areaHa(), location, view.regionId(), view.districtId(), view.createdAt(), view.updatedAt());
    }
}
