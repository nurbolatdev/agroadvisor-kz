package kz.agroadvisor.notifications.model;

/** What a notification is about; the wire code is lower case and matches the check constraint of V21. */
public enum NotificationType {

    /** A farmer asked an agrochemist for a consultation (to the agrochemist). */
    CONSULTATION_REQUESTED("consultation_requested"),
    /** The agrochemist accepted the request (to the farmer). */
    CONSULTATION_ACCEPTED("consultation_accepted"),
    /** The agrochemist declined the request (to the farmer). */
    CONSULTATION_DECLINED("consultation_declined"),
    /** One side closed the consultation or withdrew the request (to the other side). */
    CONSULTATION_CLOSED("consultation_closed"),
    /** A new chat message (to the other side). */
    CONSULTATION_MESSAGE("consultation_message"),
    /** The agrochemist was verified. */
    VERIFICATION_APPROVED("verification_approved"),
    /** The verification of the agrochemist was rejected. */
    VERIFICATION_REJECTED("verification_rejected"),
    /** The admin asked the agrochemist for more documents. */
    VERIFICATION_DOCUMENTS_REQUESTED("verification_documents_requested"),
    /** A reviewer gave a verdict on the farmer's diagnosis. */
    DIAGNOSIS_REVIEWED("diagnosis_reviewed");

    private final String code;

    NotificationType(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static NotificationType fromCode(String code) {
        for (NotificationType type : values()) {
            if (type.code.equals(code)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown notification type: " + code);
    }
}
