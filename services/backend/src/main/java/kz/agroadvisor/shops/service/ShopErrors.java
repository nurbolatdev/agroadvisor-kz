package kz.agroadvisor.shops.service;

/** Error codes of the shops module. */
public final class ShopErrors {

    /** No active shop with this id (404); a hidden shop is "not found" for a farmer too. */
    public static final String SHOP_NOT_FOUND = "shop_not_found";

    private ShopErrors() {
    }
}
