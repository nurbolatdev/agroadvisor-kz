package kz.agroadvisor.shops.service;

/** Error codes of the admin's shop directory; a missing shop is {@link ShopErrors#SHOP_NOT_FOUND}. */
public final class ShopAdminErrors {

    /** No report with this id (404). */
    public static final String SHOP_REQUEST_NOT_FOUND = "shop_request_not_found";
    /** The report is already done or rejected (409). */
    public static final String SHOP_REQUEST_RESOLVED = "shop_request_resolved";
    /** The region or the district of a shop does not exist, or the district is in another region (400). */
    public static final String UNKNOWN_REGION = "unknown_region";

    private ShopAdminErrors() {
    }
}
