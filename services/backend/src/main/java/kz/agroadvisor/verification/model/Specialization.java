package kz.agroadvisor.verification.model;

import java.util.Arrays;
import java.util.Optional;

/**
 * A field an agrochemist works in. The order of the constants is the order the app shows them and the order they
 * are stored in; the codes are the values of the API and of the column {@code agrochemist_profiles.specialization}.
 */
public enum Specialization {

    PLANT_PROTECTION("plant_protection"),
    AGROCHEMISTRY("agrochemistry"),
    PHYTOPATHOLOGY("phytopathology"),
    SOIL_SCIENCE("soil_science");

    private final String code;

    Specialization(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    /** The specialization with this code, or empty when there is none (the case matters). */
    public static Optional<Specialization> fromCode(String code) {
        return Arrays.stream(values()).filter(s -> s.code.equals(code)).findFirst();
    }
}
