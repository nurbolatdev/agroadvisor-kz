package kz.agroadvisor.diagnosis.service;

import org.springframework.http.HttpStatus;

import kz.agroadvisor.common.web.ApiException;

/** Error codes of the diagnosis module. */
public final class DiagnosisErrors {

    public static final String UNKNOWN_CROP = "unknown_crop";
    public static final String INVALID_IMAGE = "invalid_image";
    public static final String STORAGE_UNAVAILABLE = "storage_unavailable";
    /** The photo failed the AI service's quality check; the {@code reason} is {@code blurry}, {@code dark} or {@code too_small}. */
    public static final String LOW_QUALITY = "low_quality";
    /** The AI service is down, not ready or too slow: try again later (503). */
    public static final String AI_UNAVAILABLE = "ai_unavailable";
    /** The AI service answered with a fault or with something the contract does not allow (502). */
    public static final String AI_ERROR = "ai_error";

    /** No diagnosis with this id for the caller; the same answer for another user's and a missing id (404). */
    public static final String DIAGNOSIS_NOT_FOUND = "diagnosis_not_found";
    /** The verdict does not fit the diagnosis or its class (400). */
    public static final String INVALID_VERDICT = "invalid_verdict";
    /** The corrected class is not in the catalog (400). */
    public static final String UNKNOWN_CLASS = "unknown_class";

    /** The diagnosis exists but its photo is gone from the storage (404, logged as an error). */
    public static final String PHOTO_NOT_FOUND = "photo_not_found";

    /** The {@code Idempotency-Key} header is not 8-80 characters of letters, digits, {@code - _ . :} (400). */
    public static final String INVALID_IDEMPOTENCY_KEY = "invalid_idempotency_key";
    /** Another request with the same key is being processed right now; retry after {@code Retry-After} (409). */
    public static final String REQUEST_IN_PROGRESS = "request_in_progress";
    /** The key was already used for a diagnosis of another crop (422). */
    public static final String IDEMPOTENCY_KEY_REUSED = "idempotency_key_reused";

    /**
     * Whether a failed request gets its rate-limit token back: yes when the fault is not the caller's (the
     * model or the storage is down, an unexpected error) and for {@code 409 request_in_progress}, where the
     * answer is the other request's. A refusal for the caller's own input (400, 404, 422) keeps the token, so
     * the limit still stops a flood of bad requests.
     */
    public static boolean givesBackTheToken(RuntimeException e) {
        if (!(e instanceof ApiException api)) {
            return true;
        }
        HttpStatus status = api.getStatus();
        return status.is5xxServerError() || status == HttpStatus.CONFLICT;
    }

    private DiagnosisErrors() {
    }
}
