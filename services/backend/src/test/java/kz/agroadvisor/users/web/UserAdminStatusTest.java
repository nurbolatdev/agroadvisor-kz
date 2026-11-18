package kz.agroadvisor.users.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserAdminStatusTest {

    private static final String PASSWORD = "correct horse";

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> created = new ArrayList<>();
    private final List<String> phones = new ArrayList<>();
    private UUID adminId;
    private UUID otherAdminId;
    private UUID chemistId;
    private String adminToken;
    private String farmerToken;
    private String chemistToken;

    @BeforeEach
    void setUp() {
        adminId = user("Admin", Role.ADMIN);
        otherAdminId = user("Other admin", Role.ADMIN);
        chemistId = user("Chemist", Role.AGROCHEMIST);
        adminToken = "Bearer " + jwt.issueAccessToken(adminId);
        farmerToken = "Bearer " + jwt.issueAccessToken(user("Farmer", Role.FARMER));
        chemistToken = "Bearer " + jwt.issueAccessToken(chemistId);
    }

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
        phones.forEach(phone -> jdbc.update("DELETE FROM users WHERE phone = ?", phone));
    }

    private UUID user(String name, Role role) {
        String phone = "+7707" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", name, "ru", Set.of(role))).getId();
        created.add(id);
        return id;
    }

    private ResultActions patchStatus(String authorization, Object id, String body) throws Exception {
        var request = patch("/api/admin/users/" + id + "/status").contentType(MediaType.APPLICATION_JSON)
                .content(body);
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return mvc.perform(request);
    }

    private ResultActions login(String phone) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"" + phone + "\",\"password\":\"" + PASSWORD + "\"}"));
    }

    @Test
    void blockingClosesEverySessionAndUnblockingLetsTheUserSignInAgain() throws Exception {
        String phone = "+7707" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
        phones.add(phone);
        String registered = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"" + phone + "\",\"password\":\"" + PASSWORD
                        + "\",\"fullName\":\"Sign in\",\"role\":\"farmer\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID id = jdbc.queryForObject("SELECT id FROM users WHERE phone = ?", UUID.class, phone);
        String access = JsonPath.read(registered, "$.accessToken");
        String refresh = JsonPath.read(registered, "$.refreshToken");
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + access)).andExpect(status().isOk());

        patchStatus(adminToken, id, "{\"status\":\"blocked\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.status").value("blocked"));

        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + access))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + refresh + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_refresh_token"));
        login(phone).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("account_blocked"));

        patchStatus(adminToken, id, "{\"status\":\"active\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("active"));

        login(phone).andExpect(status().isOk());
    }

    @Test
    void requiresSignIn() throws Exception {
        patchStatus(null, chemistId, "{\"status\":\"blocked\"}").andExpect(status().isUnauthorized());
    }

    @Test
    void forbidsFarmersAndAgrochemists() throws Exception {
        patchStatus(farmerToken, chemistId, "{\"status\":\"blocked\"}")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").exists());
        patchStatus(chemistToken, chemistId, "{\"status\":\"blocked\"}")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").exists());
    }

    @Test
    void rejectsAnInvalidBodyOrId() throws Exception {
        patchStatus(adminToken, chemistId, "{\"status\":\"deleted\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        patchStatus(adminToken, chemistId, "{}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        patchStatus(adminToken, chemistId, "")
                .andExpect(status().isBadRequest());
        patchStatus(adminToken, "not-a-uuid", "{\"status\":\"blocked\"}")
                .andExpect(status().isBadRequest());
    }

    @Test
    void anAdminCannotBeBlockedNeitherThemselvesNorAnother() throws Exception {
        patchStatus(adminToken, adminId, "{\"status\":\"blocked\"}")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("admin_status_locked"));
        patchStatus(adminToken, otherAdminId, "{\"status\":\"blocked\"}")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("admin_status_locked"));
    }

    @Test
    void anUnknownUserIsNotFound() throws Exception {
        patchStatus(adminToken, UUID.randomUUID(), "{\"status\":\"blocked\"}")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("user_not_found"));
    }
}
