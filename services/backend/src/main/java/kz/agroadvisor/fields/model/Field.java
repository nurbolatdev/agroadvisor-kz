package kz.agroadvisor.fields.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * A farmer's field. The area is stored in hectares; {@code areaUnit} is the unit the farmer chose, so the
 * app can show the area back the way it was typed. The {@code location} geometry column is computed by the
 * database from {@code latitude} and {@code longitude}, so it is not mapped. The region and the district
 * are set by the server when the field is saved or its point changes.
 */
@Entity
@Table(name = "fields")
public class Field {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "owner_id", updatable = false)
    private UUID ownerId;

    private String name;

    @Column(name = "crop_code")
    private String cropCode;

    @Column(name = "area_ha")
    private BigDecimal areaHa;

    @Convert(converter = AreaUnitConverter.class)
    @Column(name = "area_unit")
    private AreaUnit areaUnit;

    private BigDecimal latitude;

    private BigDecimal longitude;

    @Column(name = "region_id")
    private Long regionId;

    @Column(name = "district_id")
    private Long districtId;

    /** Set by the database default; Hibernate reads it back right after the insert. */
    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    /** The database default on insert; the service sets it on every change. */
    @Generated(event = EventType.INSERT)
    @Column(name = "updated_at", insertable = false)
    private Instant updatedAt;

    protected Field() {
    }

    public Field(UUID ownerId, String name, String cropCode, BigDecimal areaHa, AreaUnit areaUnit,
            BigDecimal latitude, BigDecimal longitude, Long regionId, Long districtId) {
        this.ownerId = ownerId;
        this.name = name;
        this.cropCode = cropCode;
        this.areaHa = areaHa;
        this.areaUnit = areaUnit;
        this.latitude = latitude;
        this.longitude = longitude;
        this.regionId = regionId;
        this.districtId = districtId;
    }

    public UUID getId() {
        return id;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCropCode() {
        return cropCode;
    }

    public void setCropCode(String cropCode) {
        this.cropCode = cropCode;
    }

    public BigDecimal getAreaHa() {
        return areaHa;
    }

    public AreaUnit getAreaUnit() {
        return areaUnit;
    }

    public void setArea(BigDecimal areaHa, AreaUnit areaUnit) {
        this.areaHa = areaHa;
        this.areaUnit = areaUnit;
    }

    public BigDecimal getLatitude() {
        return latitude;
    }

    public BigDecimal getLongitude() {
        return longitude;
    }

    /** Moves the point (or removes it with two nulls) together with the region and district found for it. */
    public void setPlace(BigDecimal latitude, BigDecimal longitude, Long regionId, Long districtId) {
        this.latitude = latitude;
        this.longitude = longitude;
        this.regionId = regionId;
        this.districtId = districtId;
    }

    public Long getRegionId() {
        return regionId;
    }

    public Long getDistrictId() {
        return districtId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
