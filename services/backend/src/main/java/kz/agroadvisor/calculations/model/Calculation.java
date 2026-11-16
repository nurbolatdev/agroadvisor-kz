package kz.agroadvisor.calculations.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.hibernate.annotations.Generated;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.generator.EventType;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One saved season of the calculator. The area is in hectares; {@code areaUnit} is what the farmer typed,
 * kept for display. {@code costs} and {@code results} are name-to-number maps made by the app.
 */
@Entity
@Table(name = "calculations")
public class Calculation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "owner_id", updatable = false)
    private UUID ownerId;

    @Column(name = "crop_code")
    private String cropCode;

    private short season;

    @Column(name = "area_ha")
    private BigDecimal areaHa;

    @Column(name = "area_unit")
    private String areaUnit;

    @Column(name = "yield_c_ha")
    private BigDecimal yieldCHa;

    @Column(name = "price_t")
    private BigDecimal priceT;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, BigDecimal> costs;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, BigDecimal> results;

    /** Set by the database default; Hibernate reads it back right after the insert. */
    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    protected Calculation() {
    }

    public Calculation(UUID ownerId, String cropCode, short season, BigDecimal areaHa, String areaUnit,
            BigDecimal yieldCHa, BigDecimal priceT, Map<String, BigDecimal> costs, Map<String, BigDecimal> results) {
        this.ownerId = ownerId;
        this.cropCode = cropCode;
        this.season = season;
        this.areaHa = areaHa;
        this.areaUnit = areaUnit;
        this.yieldCHa = yieldCHa;
        this.priceT = priceT;
        this.costs = costs;
        this.results = results;
    }

    public UUID getId() {
        return id;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public String getCropCode() {
        return cropCode;
    }

    public short getSeason() {
        return season;
    }

    public BigDecimal getAreaHa() {
        return areaHa;
    }

    public String getAreaUnit() {
        return areaUnit;
    }

    public BigDecimal getYieldCHa() {
        return yieldCHa;
    }

    public BigDecimal getPriceT() {
        return priceT;
    }

    public Map<String, BigDecimal> getCosts() {
        return costs;
    }

    public Map<String, BigDecimal> getResults() {
        return results;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
