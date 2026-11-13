package kz.agroadvisor.fields.service;

/** Error codes of the fields module. */
public final class FieldErrors {

    /** No field with this id for the caller; the same answer for another user's and a missing id (404). */
    public static final String FIELD_NOT_FOUND = "field_not_found";
    /** The crop code is not in the catalog (400). */
    public static final String UNKNOWN_CROP = "unknown_crop";
    /** The area is outside 0.0001-10000 hectares after conversion from the chosen unit (400). */
    public static final String AREA_OUT_OF_RANGE = "area_out_of_range";
    /** The farmer already has the most fields allowed (409). */
    public static final String FIELD_LIMIT_REACHED = "field_limit_reached";

    private FieldErrors() {
    }
}
