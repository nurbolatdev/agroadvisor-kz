package kz.agroadvisor.fields.model;

import java.math.BigDecimal;

/** The unit a farmer types the field area in. The database keeps hectares; 1 sotka = 0.01 ha. */
public enum AreaUnit {

    HA("ha", BigDecimal.ONE),
    SOTKA("sotka", new BigDecimal("0.01"));

    private final String code;
    private final BigDecimal hectaresPerUnit;

    AreaUnit(String code, BigDecimal hectaresPerUnit) {
        this.code = code;
        this.hectaresPerUnit = hectaresPerUnit;
    }

    public String code() {
        return code;
    }

    public static AreaUnit fromCode(String code) {
        for (AreaUnit unit : values()) {
            if (unit.code.equals(code)) {
                return unit;
            }
        }
        throw new IllegalArgumentException("Unknown area unit: " + code);
    }

    /** Exact, no rounding: the caller checks the range of the result. */
    public BigDecimal toHectares(BigDecimal area) {
        return area.multiply(hectaresPerUnit);
    }

    /** The area as the farmer would type it: no trailing zeros ({@code 2.5000 ha} is {@code 2.5}). */
    public BigDecimal fromHectares(BigDecimal hectares) {
        BigDecimal area = hectares.divide(hectaresPerUnit).stripTrailingZeros();
        return area.scale() < 0 ? area.setScale(0) : area;
    }
}
