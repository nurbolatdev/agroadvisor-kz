package kz.agroadvisor.users.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    public UserAdminService(UserAdminRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<AdminUserView> list(String role, String search, String lang, int page, int size) {
        return repository.list(role, search, lang, size, page * size).stream().map(AdminUserView::of).toList();
    }
}
