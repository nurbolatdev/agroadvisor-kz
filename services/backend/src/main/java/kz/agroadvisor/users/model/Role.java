package kz.agroadvisor.users.model;

import java.util.Locale;

/** User role. {@link #code()} is the value stored in the {@code roles} table (lower case). */
public enum Role {
    FARMER,
    AGROCHEMIST,
    ADMIN;

    public String code() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** Spring Security authority, for example {@code ROLE_FARMER}. */
    public String authority() {
        return "ROLE_" + name();
    }

    public static Role fromCode(String code) {
        return valueOf(code.toUpperCase(Locale.ROOT));
    }
}
