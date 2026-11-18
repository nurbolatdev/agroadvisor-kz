package kz.agroadvisor.shops.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.shops.repository.ShopAdminRepository;
import kz.agroadvisor.shops.repository.ShopAdminRepository.RequestRow;
import kz.agroadvisor.shops.repository.ShopAdminRepository.ShopInput;
import kz.agroadvisor.shops.repository.ShopAdminRepository.ShopRow;
import kz.agroadvisor.shops.repository.ShopAdminRepository.Stats;

/**
 * Admin: the shop directory and the reports farmers send about it. The directory is edited here and read by
 * farmers in {@link ShopService}. There is no delete: a shop is hidden and shown again.
 */
@Service
public class ShopAdminService {

    /** What a shop sells; the farmer's card shows these as tags. */
    public static final Set<String> CATEGORIES = Set.of("fungicides", "insecticides", "herbicides", "fertilizers",
            "seeds", "equipment");
    /** A point in Kazakhstan; the admin form rejects anything else. */
    public static final BigDecimal MIN_LAT = BigDecimal.valueOf(40);
    public static final BigDecimal MAX_LAT = BigDecimal.valueOf(56);
    public static final BigDecimal MIN_LON = BigDecimal.valueOf(46);
    public static final BigDecimal MAX_LON = BigDecimal.valueOf(88);

    public record AdminShopView(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String name,
            @Schema(requiredMode = RequiredMode.REQUIRED) String address,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) String phone,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) String hours,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<String> categories,
            @Schema(requiredMode = RequiredMode.REQUIRED) BigDecimal latitude,
            @Schema(requiredMode = RequiredMode.REQUIRED) BigDecimal longitude,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) Long regionId,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) String region,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) Long districtId,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) String district,
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "active", "hidden" }) String status,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt) {

        static AdminShopView of(ShopRow r) {
            return new AdminShopView(r.id(), r.name(), r.address(), r.phone(), r.hours(), r.categories(),
                    r.latitude(), r.longitude(), r.regionId(), r.region(), r.districtId(), r.district(),
                    r.status(), r.createdAt(), r.updatedAt());
        }
    }

    public record RequestAuthor(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String name,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) String region) {
    }

    /** {@code shopId} and {@code shopName} are set for wrong_info and closed; the point for new_shop. */
    public record AdminShopRequestView(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "new_shop", "wrong_info", "closed" }) String type,
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "new", "done", "rejected" }) String status,
            @Schema(requiredMode = RequiredMode.REQUIRED) String comment,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) BigDecimal latitude,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) BigDecimal longitude,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) UUID shopId,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) String shopName,
            @Schema(requiredMode = RequiredMode.REQUIRED) RequestAuthor author,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        static AdminShopRequestView of(RequestRow r) {
            return new AdminShopRequestView(r.id(), r.type(), r.status(), r.comment(), r.latitude(),
                    r.longitude(), r.shopId(), r.shopName(),
                    new RequestAuthor(r.authorId(), r.authorName(), r.authorRegion()), r.createdAt());
        }
    }

    public record AdminShopStats(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Shops in the directory, hidden ones included") int total,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Of them, shown to farmers") int active,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Added since the start of this month (UTC)") int addedThisMonth,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Reports waiting for a decision") int pendingRequests) {
    }

    /** What the admin sends when adding or changing a shop. */
    public record ShopCommand(String name, String address, String phone, String hours, List<String> categories,
            BigDecimal latitude, BigDecimal longitude, Long regionId, Long districtId) {
    }

    private final ShopAdminRepository repository;
    private final Clock clock;

    public ShopAdminService(ShopAdminRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<AdminShopView> list(String search, Long regionId, String status, String lang, int page, int size) {
        return repository.list(search, regionId, status, lang, size, page * size).stream()
                .map(AdminShopView::of).toList();
    }

    @Transactional(readOnly = true)
    public AdminShopView get(UUID id, String lang) {
        return AdminShopView.of(repository.find(id, lang).orElseThrow(ShopAdminService::shopNotFound));
    }

    @Transactional
    public AdminShopView create(ShopCommand command, String lang) {
        UUID id = repository.insert(checked(command));
        return get(id, lang);
    }

    @Transactional
    public AdminShopView update(UUID id, ShopCommand command, String lang) {
        if (!repository.update(id, checked(command))) {
            throw shopNotFound();
        }
        return get(id, lang);
    }

    /** Hides or shows a shop; repeating the current status is not an error. */
    @Transactional
    public AdminShopView changeStatus(UUID id, String status, String lang) {
        if (!repository.updateStatus(id, status)) {
            throw shopNotFound();
        }
        return get(id, lang);
    }

    @Transactional(readOnly = true)
    public List<AdminShopRequestView> requests(String status, String lang, int page, int size) {
        return repository.requests(status, lang, size, page * size).stream().map(AdminShopRequestView::of)
                .toList();
    }

    /**
     * Marks a new report as done or rejected. A report is decided once: a second decision is 409. Adding the
     * shop of a {@code new_shop} report is a separate call; the report keeps no link to the shop it led to.
     */
    @Transactional
    public AdminShopRequestView resolveRequest(UUID id, String status, String lang) {
        String current = repository.lockRequest(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                ShopAdminErrors.SHOP_REQUEST_NOT_FOUND, "Shop report not found"));
        if (!"new".equals(current)) {
            throw new ApiException(HttpStatus.CONFLICT, ShopAdminErrors.SHOP_REQUEST_RESOLVED,
                    "The report is already " + current);
        }
        repository.updateRequestStatus(id, status);
        return AdminShopRequestView.of(repository.findRequest(id, lang).orElseThrow());
    }

    @Transactional(readOnly = true)
    public AdminShopStats stats() {
        LocalDate today = clock.instant().atZone(ZoneOffset.UTC).toLocalDate();
        Stats s = repository.stats(today.withDayOfMonth(1).atStartOfDay(ZoneOffset.UTC).toInstant());
        return new AdminShopStats(s.total(), s.active(), s.addedThisMonth(), s.pendingRequests());
    }

    private ShopInput checked(ShopCommand c) {
        String name = text(c.name(), "name", 120, true);
        String address = text(c.address(), "address", 255, true);
        String phone = text(c.phone(), "phone", 40, false);
        String hours = text(c.hours(), "hours", 120, false);
        Set<String> categories = new LinkedHashSet<>(c.categories() == null ? List.of() : c.categories());
        if (!CATEGORIES.containsAll(categories)) {
            throw invalid("categories are among " + String.join(", ", CATEGORIES.stream().sorted().toList()));
        }
        if (c.latitude() == null || c.longitude() == null || c.latitude().compareTo(MIN_LAT) < 0
                || c.latitude().compareTo(MAX_LAT) > 0 || c.longitude().compareTo(MIN_LON) < 0
                || c.longitude().compareTo(MAX_LON) > 0) {
            throw invalid("latitude must be 40 to 56 and longitude 46 to 88 (Kazakhstan)");
        }
        checkRegion(c.regionId(), c.districtId());
        return new ShopInput(name, address, phone, hours, List.copyOf(categories),
                c.latitude().setScale(6, RoundingMode.HALF_UP), c.longitude().setScale(6, RoundingMode.HALF_UP),
                c.regionId(), c.districtId());
    }

    /** A district needs its region, and must lie in it. */
    private void checkRegion(Long regionId, Long districtId) {
        if (regionId != null && !repository.regionExists(regionId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ShopAdminErrors.UNKNOWN_REGION, "No such region");
        }
        if (districtId != null) {
            if (regionId == null || !repository.districtRegion(districtId).filter(regionId::equals).isPresent()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, ShopAdminErrors.UNKNOWN_REGION,
                        "The district does not exist or is not in the region");
            }
        }
    }

    /** Trimmed; blank is null for an optional text; no control characters. */
    private static String text(String value, String field, int max, boolean required) {
        String text = value == null ? "" : value.strip();
        if (text.isEmpty()) {
            if (required) {
                throw invalid(field + " is required");
            }
            return null;
        }
        if (text.length() > max || text.chars().anyMatch(Character::isISOControl)) {
            throw invalid(field + " has at most " + max + " characters, without control characters");
        }
        return text;
    }

    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, message);
    }

    private static ApiException shopNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, ShopErrors.SHOP_NOT_FOUND, "Shop not found");
    }
}
