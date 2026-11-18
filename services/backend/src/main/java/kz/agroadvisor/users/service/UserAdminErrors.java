package kz.agroadvisor.users.service;

/** Error codes of the admin's user management. */
public final class UserAdminErrors {

    /** No farmer or agrochemist with this id (404). An administrator is {@link #ADMIN_STATUS_LOCKED}, not this. */
    public static final String USER_NOT_FOUND = "user_not_found";
    /** The target is an administrator, the caller themselves included; their status cannot be changed here (403). */
    public static final String ADMIN_STATUS_LOCKED = "admin_status_locked";

    private UserAdminErrors() {
    }
}
