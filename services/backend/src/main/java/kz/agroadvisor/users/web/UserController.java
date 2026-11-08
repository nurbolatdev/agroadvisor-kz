package kz.agroadvisor.users.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.service.UserService;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
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
        return toResponse(user);
    }

    @PatchMapping("/me")
    @Operation(summary = "Save the language of the interface and of the server's texts for this user; the last "
            + "explicit choice wins, on the phone or here. Answers with the whole profile")
    public MeResponse updateMe(@Valid @RequestBody UpdateMeRequest request, Authentication authentication) {
        return toResponse(users.changeLanguage(UUID.fromString(authentication.getName()), request.language()));
    }

    private static MeResponse toResponse(User user) {
        return new MeResponse(user.getId(), user.getPhone(), user.getEmail(), user.getFullName(),
                user.getLanguage(), user.getRoles().stream().map(Role::code).sorted().toList());
    }

    /** What a person may change about themselves: the language, for now. */
    public record UpdateMeRequest(
            @NotBlank @Pattern(regexp = "ru|kk|en")
            @Schema(requiredMode = REQUIRED, allowableValues = {"ru", "kk", "en"}) String language) {
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
