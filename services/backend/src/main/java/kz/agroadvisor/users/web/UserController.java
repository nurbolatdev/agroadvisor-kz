package kz.agroadvisor.users.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.service.UserService;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService users;

    public UserController(UserService users) {
        this.users = users;
    }

    @GetMapping("/me")
    public MeResponse me(Authentication authentication) {
        User user = users.findById(UUID.fromString(authentication.getName()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "Authentication required"));
        return new MeResponse(user.getId(), user.getPhone(), user.getEmail(), user.getFullName(),
                user.getLanguage(), user.getRoles().stream().map(Role::code).sorted().toList());
    }

    public record MeResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(nullable = true) String phone,
            @Schema(nullable = true) String email,
            @Schema(requiredMode = REQUIRED) String fullName,
            @Schema(requiredMode = REQUIRED, allowableValues = {"ru", "kk", "en"}) String language,
            @ArraySchema(schema = @Schema(allowableValues = {"farmer", "agrochemist", "admin"}))
            @Schema(requiredMode = REQUIRED) List<String> roles) {
    }
}
