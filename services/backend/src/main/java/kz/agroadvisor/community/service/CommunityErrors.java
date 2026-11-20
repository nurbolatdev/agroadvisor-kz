package kz.agroadvisor.community.service;

/** Error codes of the community module. */
public final class CommunityErrors {

    /** No visible question with this id, including a hidden one and an unknown feed cursor (404). */
    public static final String QUESTION_NOT_FOUND = "question_not_found";
    /** No visible answer with this id for the question (404). */
    public static final String ANSWER_NOT_FOUND = "answer_not_found";
    /** The question has no such photo or diagnosis photo, or its object is missing from the storage (404). */
    public static final String PHOTO_NOT_FOUND = "photo_not_found";
    /** A photo is not a JPEG or PNG of up to 10 MB, cannot be read, or there are more than three (400). */
    public static final String INVALID_IMAGE = "invalid_image";
    /** The object storage did not answer (503). */
    public static final String STORAGE_UNAVAILABLE = "storage_unavailable";
    /**
     * The author of a question has no region in the profile, and a question is always tied to a region
     * (400); the farmer sets the region in the profile first.
     */
    public static final String REGION_REQUIRED = "region_required";
    /** Only the author of the question may do this, for instance pick the best answer (403). */
    public static final String NOT_QUESTION_AUTHOR = "not_question_author";
    /** The action is not allowed on the caller's own answer: voting for it or picking it as the best (409). */
    public static final String OWN_ANSWER = "own_answer";
    /** A complaint on the caller's own question or answer (409). */
    public static final String OWN_CONTENT = "own_content";
    /** The question already has the most answers allowed (409). */
    public static final String ANSWER_LIMIT = "answer_limit";
    /** No complaint with this id (404). */
    public static final String COMPLAINT_NOT_FOUND = "complaint_not_found";
    /** The complaint is already resolved, so it cannot be decided again (409). */
    public static final String COMPLAINT_RESOLVED = "complaint_resolved";

    private CommunityErrors() {
    }
}
