package kz.agroadvisor.diagnosis.service;

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

    /** The {@code Idempotency-Key} header is not 8-80 characters of letters, digits, {@code - _ . :} (400). */
    public static final String INVALID_IDEMPOTENCY_KEY = "invalid_idempotency_key";
    /** The key was already used for a diagnosis of another crop (422). */
    public static final String IDEMPOTENCY_KEY_REUSED = "idempotency_key_reused";

    private DiagnosisErrors() {
    }
}
