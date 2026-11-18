package kz.agroadvisor.users.web;

import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.catalog.service.CatalogLanguage;
import kz.agroadvisor.users.service.UserAdminService;
import kz.agroadvisor.users.service.UserAdminService.AdminUserView;

/** Admin: farmers and agrochemists. */
@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class UserAdminController {

    private final UserAdminService users;

    public UserAdminController(UserAdminService users) {
        this.users = users;
    }

    @GetMapping
    @Operation(summary = "Farmers and agrochemists, newest first. search matches part of the name, the login "
            + "(e-mail) or the phone digits. Administrators are not listed; phone and e-mail are not returned.")
    public List<AdminUserView> listUsers(
            @RequestParam(required = false) @Pattern(regexp = "farmer|agrochemist") String role,
            @RequestParam(required = false) @Size(max = 100) String search,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage) {
        return users.list(role, search, CatalogLanguage.resolve(lang, acceptLanguage), page, size);
    }

    public record StatusRequest(
            @NotBlank @Pattern(regexp = "active|blocked")
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "active", "blocked" }) String status) {
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Blocks or unblocks a farmer or an agrochemist. A block takes effect at once: the access "
            + "token is refused and every refresh token of the user is revoked; unblocking does not restore "
            + "sessions, the user signs in again. The status of an administrator cannot be changed "
            + "(403 admin_status_locked), nor can the caller's own. Repeating the current status is not an error.")
    public AdminUserView changeUserStatus(@PathVariable UUID id, @Valid @RequestBody StatusRequest request,
            @RequestParam(required = false) String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage,
            Authentication authentication) {
        return users.changeStatus(UUID.fromString(authentication.getName()), id, request.status(),
                CatalogLanguage.resolve(lang, acceptLanguage));
    }
}
