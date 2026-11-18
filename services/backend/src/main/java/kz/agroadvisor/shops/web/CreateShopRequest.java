package kz.agroadvisor.shops.web;

import java.math.BigDecimal;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * A report about a shop. A new shop has a point and no shopId; wrong information and a closed shop have a
 * shopId and no point.
 */
public record CreateShopRequest(
        @Schema(allowableValues = {"new_shop", "wrong_info", "closed"})
        @NotNull @Pattern(regexp = "new_shop|wrong_info|closed") String type,
        @Schema(description = "The shop the report is about; not for a new shop") UUID shopId,
        @Schema(description = "What the farmer writes: the name and the address of a new shop, or what is wrong")
        @NotBlank @Size(max = 1000) String comment,
        @Schema(description = "Degrees north of a new shop", example = "43.25")
        @DecimalMin("-90") @DecimalMax("90") @Digits(integer = 2, fraction = 6) BigDecimal latitude,
        @Schema(description = "Degrees east of a new shop", example = "76.95")
        @DecimalMin("-180") @DecimalMax("180") @Digits(integer = 3, fraction = 6) BigDecimal longitude) {
}
