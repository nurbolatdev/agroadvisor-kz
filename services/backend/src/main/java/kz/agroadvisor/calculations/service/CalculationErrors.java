package kz.agroadvisor.calculations.service;

/** Error codes of the calculations module. */
public final class CalculationErrors {

    /** No saved season with this id for the caller; the same answer for another user's and a missing id (404). */
    public static final String CALCULATION_NOT_FOUND = "calculation_not_found";
    /** The crop code is not in the catalog (400). */
    public static final String UNKNOWN_CROP = "unknown_crop";
    /** The farmer already has the most saved seasons allowed (409). */
    public static final String CALCULATION_LIMIT_REACHED = "calculation_limit_reached";

    private CalculationErrors() {
    }
}
