package kz.agroadvisor.fields.web;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * A partial change of a field: a key that is missing keeps the value. {@code area} and {@code areaUnit} come
 * together. {@code "location": null} removes the point; a missing {@code location} keeps it. The setter of
 * {@code location} is what tells the two apart.
 */
public class UpdateFieldRequest {

    @Size(max = 80)
    @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
    private String name;

    @Size(max = 40)
    @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
    private String crop;

    @Schema(description = "The area in the unit of areaUnit; send it together with areaUnit")
    @Positive
    @Digits(integer = 7, fraction = 2)
    private BigDecimal area;

    @Schema(description = "ha (hectares) or sotka (1 sotka = 0.01 ha); send it together with area",
            allowableValues = {"ha", "sotka"})
    @Pattern(regexp = "ha|sotka")
    private String areaUnit;

    @Schema(description = "A new point, or null to remove the point; leave the key out to keep it",
            types = {"object", "null"}, implementation = CreateFieldRequest.Point.class)
    @Valid
    private CreateFieldRequest.Point location;

    @JsonIgnore
    @Schema(hidden = true)
    private boolean locationPresent;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCrop() {
        return crop;
    }

    public void setCrop(String crop) {
        this.crop = crop;
    }

    public BigDecimal getArea() {
        return area;
    }

    public void setArea(BigDecimal area) {
        this.area = area;
    }

    public String getAreaUnit() {
        return areaUnit;
    }

    public void setAreaUnit(String areaUnit) {
        this.areaUnit = areaUnit;
    }

    public CreateFieldRequest.Point getLocation() {
        return location;
    }

    @JsonSetter("location")
    public void setLocation(CreateFieldRequest.Point location) {
        this.location = location;
        this.locationPresent = true;
    }

    /**
     * True when the body had the key {@code location}, even with {@code null}. Not a JSON property: a client
     * must not be able to set it.
     */
    @JsonIgnore
    @Schema(hidden = true)
    public boolean isLocationPresent() {
        return locationPresent;
    }
}
