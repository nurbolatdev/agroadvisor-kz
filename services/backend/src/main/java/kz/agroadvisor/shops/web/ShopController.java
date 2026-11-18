package kz.agroadvisor.shops.web;

import java.math.BigDecimal;
import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import jakarta.validation.Valid;
import kz.agroadvisor.shops.service.ShopService;
import kz.agroadvisor.shops.service.ShopService.NewShopRequest;
import kz.agroadvisor.shops.service.ShopService.ShopRequestView;
import kz.agroadvisor.shops.service.ShopService.ShopView;

/** The shop directory for the signed-in farmer. The routes always open in an external navigator in the app. */
@RestController
@RequestMapping("/api/shops")
@PreAuthorize("hasRole('FARMER') and @featureAccess.allows(authentication, 'shops')")
public class ShopController {

    private final ShopService shops;

    public ShopController(ShopService shops) {
        this.shops = shops;
    }

    /** Active shops around a point, nearest first, with the distance in metres. */
    @GetMapping("/nearby")
    @Operation(operationId = "listNearbyShops")
    public List<ShopView> nearby(
            @Parameter(description = "Degrees north, -90 to 90", example = "43.25") @RequestParam BigDecimal latitude,
            @Parameter(description = "Degrees east, -180 to 180", example = "76.95") @RequestParam BigDecimal longitude,
            @Parameter(description = "Search radius in kilometres, 1 to 100")
            @RequestParam(defaultValue = "" + ShopService.DEFAULT_RADIUS_KM) int radiusKm,
            @Parameter(description = "Most shops to return, 1 to 100")
            @RequestParam(defaultValue = "" + ShopService.DEFAULT_LIMIT) int limit) {
        return shops.nearby(latitude, longitude, radiusKm, limit);
    }

    /** A hidden or missing shop answers 404 shop_not_found. */
    @GetMapping("/{id}")
    @Operation(operationId = "getShop")
    public ShopView get(@PathVariable UUID id) {
        return shops.get(id);
    }

    /** A report about a new shop, wrong information, or a closed shop; 10 an hour per farmer. */
    @PostMapping("/requests")
    @Operation(operationId = "createShopRequest")
    public ResponseEntity<ShopRequestView> request(@Valid @RequestBody CreateShopRequest request,
            Authentication authentication) {
        ShopRequestView created = shops.request(UUID.fromString(authentication.getName()),
                new NewShopRequest(request.type(), request.shopId(), request.comment(), request.latitude(),
                        request.longitude()));
        return ResponseEntity.created(URI.create("/api/shops/requests/" + created.id())).body(created);
    }
}
