package kz.agroadvisor.notifications.service;

/** Error codes of the notifications module. */
public final class NotificationErrors {

    /** No notification for the caller; the same answer for another user's and a missing id (404). */
    public static final String NOTIFICATION_NOT_FOUND = "notification_not_found";
    /** No push token of the caller with this id; the same answer for another user's and a missing id (404). */
    public static final String PUSH_TOKEN_NOT_FOUND = "push_token_not_found";

    private NotificationErrors() {
    }
}
