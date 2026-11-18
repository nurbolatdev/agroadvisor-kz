package kz.agroadvisor.shops.web;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.catalog.service.CatalogLanguage;
import kz.agroadvisor.shops.service.ShopAdminService;
import kz.agroadvisor.shops.service.ShopAdminService.AdminShopRequestView;
import kz.agroadvisor.shops.service.ShopAdminService.AdminShopStats;
import kz.agroadvisor.shops.service.ShopAdminService.AdminShopView;
import kz.agroadvisor.shops.service.ShopAdminService.ShopCommand;

/** Admin: the shop directory and the reports farmers send about it. */
@RestController
@RequestMapping("/api/admin/shops")
@PreAuthorize("hasRole('ADMIN')")
public class ShopAdminController {

    /** Fields of a shop; the service checks the rest (lengths, categories, the region of a district). */
    public record ShopBody(
            @NotBlank @Size(max = 120) @Schema(requiredMode = RequiredMode.REQUIRED) String name,
            @NotBlank @Size(max = 255) @Schema(requiredMode = RequiredMode.REQUIRED) String address,
            @Size(max = 40) @Schema(nullable = true) String phone,
            @Size(max = 120) @Schema(nullable = true) String hours,
            @Schema(description = "fungicides, insecticides, herbicides, fertilizers, seeds, equipment") List<String> categories,
            @NotNull @Schema(requiredMode = RequiredMode.REQUIRED, description = "40 to 56") BigDecimal latitude,
            @NotNull @Schema(requiredMode = RequiredMode.REQUIRED, description = "46 to 88") BigDecimal longitude,
            @Schema(nullable = true) Long regionId,
            @Schema(nullable = true, description = "Needs regionId; the district must be in that region") Long districtId) {

        ShopCommand command() {
            return new ShopCommand(name, address, phone, hours, categories, latitude, longitude, regionId,
                    districtId);
        }
    }

    public record StatusBody(
            @NotBlank @Pattern(regexp = "active|hidden")
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "active", "hidden" }) String status) {
    }

    public record RequestDecision(
            @NotBlank @Pattern(regexp = "done|rejected")
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "done", "rejected" }) String status) {
    }

    private final ShopAdminService shops;

    public ShopAdminController(ShopAdminService shops) {
        this.shops = shops;
    }

    @GetMapping
    @Operation(operationId = "listAdminShops", summary = "All shops, hidden ones included, by name. search matches "
            + "part of the name or the address. Region and district names are in the asked language.")
    public List<AdminShopView> list(
            @RequestParam(required = false) @Size(max = 100) String search,
            @RequestParam(required = false) Long regionId,
            @RequestParam(required = false) @Pattern(regexp = "active|hidden") String status,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return shops.list(search, regionId, status, CatalogLanguage.resolve(lang, acceptLanguage), page, size);
    }

    @GetMapping("/stats")
    @Operation(operationId = "getAdminShopStats", summary = "Counters of the directory and of the reports.")
    public AdminShopStats stats() {
        return shops.stats();
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getAdminShop", summary = "One shop, hidden or not; 404 shop_not_found.")
    public AdminShopView get(@PathVariable UUID id, @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return shops.get(id, CatalogLanguage.resolve(lang, acceptLanguage));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createAdminShop", summary = "Adds a shop; it is active at once.")
    public AdminShopView create(@Valid @RequestBody ShopBody body, @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return shops.create(body.command(), CatalogLanguage.resolve(lang, acceptLanguage));
    }

    @PutMapping("/{id}")
    @Operation(operationId = "updateAdminShop", summary = "Replaces the fields of a shop; its status is not "
            + "changed here. 404 shop_not_found.")
    public AdminShopView update(@PathVariable UUID id, @Valid @RequestBody ShopBody body,
            @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return shops.update(id, body.command(), CatalogLanguage.resolve(lang, acceptLanguage));
    }

    @PatchMapping("/{id}/status")
    @Operation(operationId = "changeAdminShopStatus", summary = "Hides a shop from farmers or shows it again. "
            + "Repeating the current status is not an error. There is no delete.")
    public AdminShopView changeStatus(@PathVariable UUID id, @Valid @RequestBody StatusBody body,
            @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return shops.changeStatus(id, body.status(), CatalogLanguage.resolve(lang, acceptLanguage));
    }

    @GetMapping("/requests")
    @Operation(operationId = "listAdminShopRequests", summary = "Reports farmers sent, newest first; status "
            + "filters them (the admin reads the new ones).")
    public List<AdminShopRequestView> requests(
            @RequestParam(required = false) @Pattern(regexp = "new|done|rejected") String status,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return shops.requests(status, CatalogLanguage.resolve(lang, acceptLanguage), page, size);
    }

    @PatchMapping("/requests/{id}/status")
    @Operation(operationId = "resolveAdminShopRequest", summary = "Marks a new report done or rejected. It does "
            + "not change any shop: the admin adds or edits the shop with the calls above. A report is decided "
            + "once (409 shop_request_resolved); 404 shop_request_not_found.")
    public AdminShopRequestView resolveRequest(@PathVariable UUID id, @Valid @RequestBody RequestDecision body,
            @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return shops.resolveRequest(id, body.status(), CatalogLanguage.resolve(lang, acceptLanguage));
    }
}
