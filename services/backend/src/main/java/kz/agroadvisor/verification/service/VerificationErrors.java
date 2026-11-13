package kz.agroadvisor.verification.service;

/** Error codes of the agrochemist verification module. */
public final class VerificationErrors {

    /** Not a PDF, JPEG or PNG, empty, or over 10 MB; the {@code reason} says which (400). */
    public static final String INVALID_DOCUMENT = "invalid_document";
    /** {@code kind} is not {@code diploma} or {@code certificate}, or {@code year} is out of range (400). */
    public static final String INVALID_DOCUMENT_FIELDS = "invalid_document_fields";
    /**
     * Specializations or years of experience at registration are not valid: an unknown specialization code, a
     * duplicate, more than four, years outside 0-80, or either of them sent for a farmer (400).
     */
    public static final String INVALID_PROFILE_FIELDS = "invalid_profile_fields";
    /** The user has the agrochemist role but no profile row (409). */
    public static final String PROFILE_MISSING = "agrochemist_profile_missing";
    /** Documents of an approved agrochemist cannot be added or removed (409). */
    public static final String ALREADY_APPROVED = "agrochemist_already_approved";
    /** The agrochemist already has the maximum number of documents (409). */
    public static final String DOCUMENT_LIMIT = "document_limit_reached";
    public static final String DOCUMENT_NOT_FOUND = "document_not_found";
    public static final String AGROCHEMIST_NOT_FOUND = "agrochemist_not_found";
    /** An approval needs at least one document (409). */
    public static final String NO_DOCUMENTS = "no_documents";
    /** A rejection or a request for documents needs a reason (400). */
    public static final String REASON_REQUIRED = "reason_required";
    /** An admin who is also an agrochemist cannot decide on their own profile (403). */
    public static final String SELF_REVIEW = "self_review_forbidden";
    /** A crop code that is not in the catalog of crops (400). */
    public static final String UNKNOWN_CROP = "unknown_crop";
    public static final String STORAGE_UNAVAILABLE = "storage_unavailable";

    private VerificationErrors() {
    }
}
