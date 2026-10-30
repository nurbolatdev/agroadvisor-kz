package kz.agroadvisor.catalog.service;

/** Error codes of the catalog module. */
public final class CatalogErrors {

    public static final String CROP_NOT_FOUND = "crop_not_found";
    public static final String CROP_EXISTS = "crop_exists";
    public static final String CROP_IN_USE = "crop_in_use";
    public static final String DISEASE_NOT_FOUND = "disease_not_found";
    public static final String DISEASE_EXISTS = "disease_exists";
    public static final String DISEASE_IN_USE = "disease_in_use";
    public static final String TREATMENT_NOT_FOUND = "treatment_not_found";

    private CatalogErrors() {
    }
}
