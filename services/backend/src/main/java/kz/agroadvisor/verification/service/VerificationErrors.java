package kz.agroadvisor.verification.service;

/** Error codes of the agrochemist verification module. */
public final class VerificationErrors {

    /** Not a PDF, JPEG or PNG, empty, or over 10 MB; the {@code reason} says which (400). */
    public static final String INVALID_DOCUMENT = "invalid_document";
    /** {@code kind} is not {@code diploma} or {@code certificate}, or {@code year} is out of range (400). */
    public static final String INVALID_DOCUMENT_FIELDS = "invalid_document_fields";
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
    public static final String STORAGE_UNAVAILABLE = "storage_unavailable";

    private VerificationErrors() {
    }
}
