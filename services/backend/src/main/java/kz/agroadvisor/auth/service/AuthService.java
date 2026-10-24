package kz.agroadvisor.auth.service;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.service.UserService;
import kz.agroadvisor.verification.service.AgrochemistVerificationService;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    public static final String INVALID_LOGIN = "invalid_login";
    public static final String INVALID_CREDENTIALS = "invalid_credentials";
    public static final String ROLE_NOT_ALLOWED = "role_not_allowed";
    public static final String PASSWORD_TOO_LONG = "password_too_long";
    public static final String ACCOUNT_BLOCKED = "account_blocked";

    /** BCrypt ignores everything after 72 bytes, so longer passwords are refused instead of truncated. */
    private static final int BCRYPT_MAX_BYTES = 72;

    /** Roles a person may choose for themselves. ADMIN is never self-assigned. */
    private static final Set<Role> SELF_ASSIGNABLE = Set.of(Role.FARMER, Role.AGROCHEMIST);

    private final UserService users;
    private final AgrochemistVerificationService verification;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwt;
    private final RefreshTokenService refreshTokens;
    private final String dummyHash;

    public AuthService(UserService users, AgrochemistVerificationService verification,
                       PasswordEncoder passwordEncoder, JwtService jwt, RefreshTokenService refreshTokens) {
        this.users = users;
        this.verification = verification;
        this.passwordEncoder = passwordEncoder;
        this.jwt = jwt;
        this.refreshTokens = refreshTokens;
        // Compared against when the login is unknown, so response time does not reveal which logins exist
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    public record Tokens(String accessToken, String refreshToken, long expiresInSeconds) {
    }

    @Transactional
    public Tokens register(String rawLogin, String password, String fullName, String language, String roleName) {
        Login login = parseLogin(rawLogin, HttpStatus.BAD_REQUEST, INVALID_LOGIN);
        Role role = selfAssignableRole(roleName);
        if (password.getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, PASSWORD_TOO_LONG,
                    "Password must be at most " + BCRYPT_MAX_BYTES + " bytes");
        }
        User user = users.create(login, passwordEncoder.encode(password), fullName.trim(),
                language == null ? "ru" : language, Set.of(role));
        if (role == Role.AGROCHEMIST) {
            // Tokens are issued right away so documents can be uploaded; privileges wait for approval
            verification.createPendingProfile(user.getId());
        }
        return issueTokens(user.getId(), refreshTokens.startSession(user.getId()));
    }

    @Transactional
    public Tokens login(String rawLogin, String password) {
        User user = users.findByLogin(parseLogin(rawLogin, HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS))
                .orElse(null);
        boolean passwordMatches = passwordEncoder.matches(password, user == null ? dummyHash : user.getPasswordHash());
        if (user == null || !passwordMatches) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS, "Invalid login or password");
        }
        if (!user.isActive()) {
            throw blocked();
        }
        return issueTokens(user.getId(), refreshTokens.startSession(user.getId()));
    }

    @Transactional(noRollbackFor = ApiException.class)
    public Tokens refresh(String rawRefreshToken) {
        RefreshTokenService.Rotation rotation = refreshTokens.rotate(rawRefreshToken);
        User user = users.findById(rotation.userId()).orElse(null);
        if (user == null || !user.isActive()) {
            refreshTokens.revokeAll(rotation.userId());
            throw blocked();
        }
        return issueTokens(user.getId(), rotation.refreshToken());
    }

    public void logout(String rawRefreshToken) {
        refreshTokens.revokeFamilyOf(rawRefreshToken);
    }

    public void logoutAll(UUID userId) {
        refreshTokens.revokeAll(userId);
    }

    private Tokens issueTokens(UUID userId, String refreshToken) {
        return new Tokens(jwt.issueAccessToken(userId), refreshToken, jwt.accessTtl().toSeconds());
    }

    private static Login parseLogin(String raw, HttpStatus status, String code) {
        try {
            return Login.parse(raw);
        } catch (IllegalArgumentException e) {
            throw new ApiException(status, code, "Login must be a phone number or an e-mail");
        }
    }

    private static Role selfAssignableRole(String name) {
        Role role;
        try {
            role = name == null ? Role.FARMER : Role.valueOf(name.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ROLE_NOT_ALLOWED, "Unknown role");
        }
        if (!SELF_ASSIGNABLE.contains(role)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ROLE_NOT_ALLOWED, "This role cannot be chosen at registration");
        }
        return role;
    }

    private static ApiException blocked() {
        return new ApiException(HttpStatus.FORBIDDEN, ACCOUNT_BLOCKED, "Account is blocked");
    }
}
