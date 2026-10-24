package kz.agroadvisor.users.model;

import java.util.Locale;

public enum UserStatus {
    ACTIVE,
    BLOCKED;

    public String code() {
        return name().toLowerCase(Locale.ROOT);
    }
}
