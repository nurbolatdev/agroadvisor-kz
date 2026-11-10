package kz.agroadvisor.auth.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import kz.agroadvisor.auth.service.AuthRateLimits;
import kz.agroadvisor.auth.service.AuthService;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;
    // The client address is the TCP peer (getRemoteAddr); behind a proxy see the README
    // (server.forward-headers-strategy). The limits are checked before any BCrypt or database work.
    private final AuthRateLimits limits;

    public AuthController(AuthService auth, AuthRateLimits limits) {
        this.auth = auth;
        this.limits = limits;
    }

    /**
     * Only these fields are read: roles, status and verification cannot be set through the request.
     * {@code role} is lower case: farmer (default) or agrochemist; admin is rejected with role_not_allowed,
     * another case is a validation error.
     */
    public record RegisterRequest(
            @NotBlank @Size(max = 120) String login,
            @NotBlank @Size(min = 8, max = 72) String password,
            @NotBlank @Size(max = 120) String fullName,
            @Pattern(regexp = "ru|kk|en") @Schema(allowableValues = {"ru", "kk", "en"}) String language,
            @Size(max = 20) @Pattern(regexp = "[a-z]+", message = "must be lower case")
            @Schema(allowableValues = {"farmer", "agrochemist"},
                    description = "Lower case, like the roles in MeResponse; another case is 400 validation_failed")
            String role,
            @Size(max = 4)
            @ArraySchema(arraySchema = @Schema(nullable = true, description = "Required for an agrochemist (at "
                    + "least one), not allowed for a farmer: fields of work, up to four different values. A "
                    + "missing or unknown value, a duplicate, or any value for a farmer is 400 invalid_profile_fields"),
                    schema = @Schema(allowableValues = {"plant_protection", "agrochemistry", "phytopathology",
                        "soil_science"}))
            List<String> specializations,
            @Min(0) @Max(80) @Schema(nullable = true, description = "Required for an agrochemist, not allowed for a farmer: years of "
                    + "experience, 0-80 (missing is 400 invalid_profile_fields)")
            Integer experienceYears,
            @Positive @Schema(nullable = true, description = "The region picked in the form: an id of "
                    + "GET /api/regions, for both roles. Optional; an unknown id is 400 invalid_region")
            Long regionId) {
    }

    public record LoginRequest(@NotBlank @Size(max = 120) String login, @NotBlank @Size(max = 72) String password) {
    }

    public record RefreshRequest(@NotBlank @Size(max = 200) String refreshToken) {
    }

    public record TokenResponse(
            @Schema(requiredMode = REQUIRED) String accessToken,
            @Schema(requiredMode = REQUIRED) String refreshToken,
            @Schema(requiredMode = REQUIRED, allowableValues = "Bearer") String tokenType,
            @Schema(requiredMode = REQUIRED, description = "Access token lifetime, seconds") long expiresIn) {

        static TokenResponse of(AuthService.Tokens tokens) {
            return new TokenResponse(tokens.accessToken(), tokens.refreshToken(), "Bearer", tokens.expiresInSeconds());
        }
    }

    // register, login, refresh and logout are public: an empty @SecurityRequirements means no access token
    @SecurityRequirements
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public TokenResponse register(@Valid @RequestBody RegisterRequest request, HttpServletRequest http) {
        limits.register(http.getRemoteAddr());
        return TokenResponse.of(auth.register(request.login(), request.password(), request.fullName(),
                request.language(), request.role(), request.specializations(), request.experienceYears(),
                request.regionId()));
    }

    @SecurityRequirements
    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        limits.login(http.getRemoteAddr(), request.login());
        return TokenResponse.of(auth.login(request.login(), request.password()));
    }

    @SecurityRequirements
    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request, HttpServletRequest http) {
        limits.refresh(http.getRemoteAddr());
        return TokenResponse.of(auth.refresh(request.refreshToken()));
    }

    /** Ends this session. The refresh token is the credential, so no access token is needed. */
    @SecurityRequirements
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody RefreshRequest request) {
        auth.logout(request.refreshToken());
    }

    @PostMapping("/logout-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logoutAll(Authentication authentication) {
        auth.logoutAll(UUID.fromString(authentication.getName()));
    }
}
