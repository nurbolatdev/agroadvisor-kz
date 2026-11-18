package kz.agroadvisor.users.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.RefreshTokenService;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;
import kz.agroadvisor.users.service.UserAdminService.AdminUserView;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserStatusChangeTest {

    @Autowired
    private UserAdminService service;
    @Autowired
    private RefreshTokenService tokens;
    @Autowired
    private UserRepository users;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> created = new ArrayList<>();
    private UUID adminId;
    private UUID otherAdminId;
    private UUID farmerId;
    private UUID otherFarmerId;

    @BeforeEach
    void setUp() {
        adminId = user("Admin", Role.ADMIN);
        otherAdminId = user("Other admin", Role.ADMIN);
        farmerId = user("Farmer", Role.FARMER);
        otherFarmerId = user("Other farmer", Role.FARMER);
    }

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID user(String name, Role role) {
        String phone = "+7706" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", name, "ru", Set.of(role))).getId();
        created.add(id);
        return id;
    }

    private String statusOf(UUID id) {
        return jdbc.queryForObject("SELECT status FROM users WHERE id = ?", String.class, id);
    }

    private int liveTokens(UUID id) {
        return jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL",
                Integer.class, id);
    }

    @Test
    void blockingSetsTheStatusAndRevokesEverySession() {
        tokens.startSession(farmerId);
        tokens.startSession(farmerId);
        tokens.startSession(otherFarmerId);

        AdminUserView view = service.changeStatus(adminId, farmerId, "blocked", "ru");

        assertThat(view.id()).isEqualTo(farmerId);
        assertThat(view.status()).isEqualTo("blocked");
        assertThat(statusOf(farmerId)).isEqualTo("blocked");
        assertThat(liveTokens(farmerId)).isZero();
        assertThat(liveTokens(otherFarmerId)).isEqualTo(1);
    }

    @Test
    void unblockingKeepsTheRevokedTokensRevoked() {
        tokens.startSession(farmerId);
        service.changeStatus(adminId, farmerId, "blocked", "ru");

        AdminUserView view = service.changeStatus(adminId, farmerId, "active", "ru");

        assertThat(view.status()).isEqualTo("active");
        assertThat(statusOf(farmerId)).isEqualTo("active");
        assertThat(liveTokens(farmerId)).isZero();
    }

    @Test
    void repeatingTheSameStatusIsNotAnError() {
        service.changeStatus(adminId, farmerId, "blocked", "ru");

        AdminUserView view = service.changeStatus(adminId, farmerId, "blocked", "ru");

        assertThat(view.status()).isEqualTo("blocked");
    }

    @Test
    void anAdminCannotBlockThemselves() {
        tokens.startSession(adminId);

        assertThatThrownBy(() -> service.changeStatus(adminId, adminId, "blocked", "ru"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                    assertThat(e.getCode()).isEqualTo(UserAdminErrors.ADMIN_STATUS_LOCKED);
                });
        assertThat(statusOf(adminId)).isEqualTo("active");
        assertThat(liveTokens(adminId)).isEqualTo(1);
    }

    @Test
    void anotherAdminCannotBeChanged() {
        tokens.startSession(otherAdminId);

        assertThatThrownBy(() -> service.changeStatus(adminId, otherAdminId, "blocked", "ru"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                    assertThat(e.getCode()).isEqualTo(UserAdminErrors.ADMIN_STATUS_LOCKED);
                });
        assertThat(statusOf(otherAdminId)).isEqualTo("active");
        assertThat(liveTokens(otherAdminId)).isEqualTo(1);
    }

    @Test
    void anUnknownUserIsNotFound() {
        assertThatThrownBy(() -> service.changeStatus(adminId, UUID.randomUUID(), "blocked", "ru"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(e.getCode()).isEqualTo(UserAdminErrors.USER_NOT_FOUND);
                });
    }
}
