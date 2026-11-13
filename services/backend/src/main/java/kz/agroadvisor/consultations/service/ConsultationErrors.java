package kz.agroadvisor.consultations.service;

/** Error codes of the consultations module. */
public final class ConsultationErrors {

    /** No consultation for the caller; the same answer for another user's and a missing id (404). */
    public static final String CONSULTATION_NOT_FOUND = "consultation_not_found";
    /** The attached diagnosis is not the farmer's own or does not exist (404). */
    public static final String DIAGNOSIS_NOT_FOUND = "diagnosis_not_found";
    /** The farmer already has an open consultation with this agrochemist; the Location header points to it (409). */
    public static final String CONSULTATION_ALREADY_OPEN = "consultation_already_open";
    /** The farmer has the most requests waiting for an answer allowed (409). */
    public static final String CONSULTATION_REQUEST_LIMIT = "consultation_request_limit";
    /** The action does not fit the consultation status; the reason holds the current status (409). */
    public static final String INVALID_CONSULTATION_STATE = "invalid_consultation_state";
    /** The agrochemist is no longer in the directory, so the request cannot be accepted (409). */
    public static final String AGROCHEMIST_NOT_LISTED = "agrochemist_not_listed";
    /** The message cursor does not belong to this consultation (404). */
    public static final String MESSAGE_NOT_FOUND = "message_not_found";

    private ConsultationErrors() {
    }
}
