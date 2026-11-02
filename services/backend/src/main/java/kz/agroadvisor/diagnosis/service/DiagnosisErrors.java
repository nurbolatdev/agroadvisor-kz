package kz.agroadvisor.diagnosis.service;

/** Error codes of the diagnosis module. */
public final class DiagnosisErrors {

    public static final String UNKNOWN_CROP = "unknown_crop";
    public static final String INVALID_IMAGE = "invalid_image";
    public static final String STORAGE_UNAVAILABLE = "storage_unavailable";
    /** The photo failed the AI service's quality check; the detail is {@code blurry}, {@code dark} or {@code too_small}. */
    public static final String LOW_QUALITY = "low_quality";
    /** The AI service is down, not ready or too slow: try again later (503). */
    public static final String AI_UNAVAILABLE = "ai_unavailable";
    /** The AI service answered with a fault or with something the contract does not allow (502). */
    public static final String AI_ERROR = "ai_error";

    private DiagnosisErrors() {
    }
}
