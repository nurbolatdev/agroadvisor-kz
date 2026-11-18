package kz.agroadvisor.users.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import kz.agroadvisor.auth.service.RefreshTokenService;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.repository.UserAdminRepository;
import kz.agroadvisor.users.repository.UserAdminRepository.Row;

/** Admin: farmers and agrochemists as the admin panel shows them. */
@Service
public class UserAdminService {

    /** {@code region} and {@code district} are names in the asked language, null when not chosen. */
    public record AdminUserView(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String fullName,
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "farmer", "agrochemist" }) String role,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) String region,
            @Schema(requiredMode = RequiredMode.REQUIRED, nullable = true) String district,
            @Schema(requiredMode = RequiredMode.REQUIRED, allowableValues = { "active", "blocked" }) String status,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant registeredAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) int diagnosesCount) {

        static AdminUserView of(Row row) {
            return new AdminUserView(row.id(), row.fullName(), row.role(), row.region(), row.district(),
                    row.status(), row.registeredAt(), row.diagnosesCount());
        }
    }

    private final UserAdminRepository repository;
    private final RefreshTokenService refreshTokens;

    public UserAdminService(UserAdminRepository repository, RefreshTokenService refreshTokens) {
        this.repository = repository;
        this.refreshTokens = refreshTokens;
    }

    /**
     * Blocks or unblocks a farmer or an agrochemist. A block revokes every refresh token of the user in the
     * same transaction; the access token stops working at once because the status is read on every request.
     * Unblocking does not restore sessions: the user signs in again. The status of an administrator, the caller
     * included, cannot be changed here.
     *
     * <p>The order is fixed: the user's row is locked first, then {@code revokeAll} takes the advisory lock of the
     * user's tokens. A refresh holds that same advisory lock from rotation to commit and never locks the row, so
     * there is no deadlock, and a token issued by a refresh racing with the block is revoked right after it
     * commits.
     */
    @Transactional
    public AdminUserView changeStatus(UUID adminId, UUID id, String status, String lang) {
        if (adminId.equals(id)) {
            throw adminLocked();
        }
        boolean isAdmin = repository.lockForStatusChange(id).orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND, UserAdminErrors.USER_NOT_FOUND, "User not found"));
        if (isAdmin) {
            throw adminLocked();
        }
        repository.updateStatus(id, status);
        if ("blocked".equals(status)) {
            refreshTokens.revokeAll(id);
        }
        return repository.find(id, lang).map(AdminUserView::of).orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND, UserAdminErrors.USER_NOT_FOUND, "User not found"));
    }

    private static ApiException adminLocked() {
        return new ApiException(HttpStatus.FORBIDDEN, UserAdminErrors.ADMIN_STATUS_LOCKED,
                "The status of an administrator cannot be changed");
    }

    @Transactional(readOnly = true)
    public List<AdminUserView> list(String role, String search, String lang, int page, int size) {
        return repository.list(role, search, lang, size, page * size).stream().map(AdminUserView::of).toList();
    }
}
