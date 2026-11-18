package kz.agroadvisor.users.web;

import java.util.List;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
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
}
