package kz.agroadvisor.users.web;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
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
class UserAdminControllerTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> created = new ArrayList<>();
    private Long regionId;
    private String marker;
    private UUID farmerId;
    private UUID chemistId;
    private String adminToken;
    private String farmerToken;
    private String chemistToken;

    @BeforeEach
    void setUp() {
        StringBuilder letters = new StringBuilder("Zw");
        for (int i = 0; i < 8; i++) {
            letters.append((char) ('a' + ThreadLocalRandom.current().nextInt(26)));
        }
        marker = letters.toString();
        regionId = jdbc.queryForObject("""
                INSERT INTO regions (code, names)
                VALUES (?, '{"ru": "Регион", "kk": "Аймақ", "en": "Region"}') RETURNING id""", Long.class,
                "uac_" + marker);
        farmerId = user("Farmer " + marker, Role.FARMER);
        chemistId = user("Chemist " + marker, Role.AGROCHEMIST);
        jdbc.update("UPDATE users SET region_id = ? WHERE id = ?", regionId, farmerId);
        UUID adminId = user("Admin " + marker, Role.ADMIN);
        adminToken = "Bearer " + jwt.issueAccessToken(adminId);
        farmerToken = "Bearer " + jwt.issueAccessToken(farmerId);
        chemistToken = "Bearer " + jwt.issueAccessToken(chemistId);
    }

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
        jdbc.update("DELETE FROM regions WHERE id = ?", regionId);
    }

    private UUID user(String name, Role role) {
        String phone = "+7705" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", name, "ru", Set.of(role))).getId();
        created.add(id);
        return id;
    }

    private ResultActions list(String authorization, String query) throws Exception {
        var request = get("/api/admin/users" + query);
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return mvc.perform(request);
    }

    @Test
    void requiresSignIn() throws Exception {
        list(null, "").andExpect(status().isUnauthorized());
    }

    @Test
    void forbidsFarmersAndAgrochemists() throws Exception {
        list(farmerToken, "").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").exists());
        list(chemistToken, "").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").exists());
    }

    @Test
    void listsUsersWithoutContactsOrAdmins() throws Exception {
        list(adminToken, "?search=" + marker)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[?(@.id == '" + farmerId + "')].fullName").value("Farmer " + marker))
                .andExpect(jsonPath("$[?(@.id == '" + farmerId + "')].role").value("farmer"))
                .andExpect(jsonPath("$[?(@.id == '" + farmerId + "')].region").value("Регион"))
                .andExpect(jsonPath("$[?(@.id == '" + farmerId + "')].status").value("active"))
                .andExpect(jsonPath("$[?(@.id == '" + farmerId + "')].diagnosesCount").value(0))
                .andExpect(jsonPath("$[?(@.id == '" + farmerId + "')].registeredAt").exists())
                .andExpect(jsonPath("$[0].phone").doesNotExist())
                .andExpect(jsonPath("$[0].email").doesNotExist());
    }

    @Test
    void districtIsNullAndRegionIsNullWithoutOne() throws Exception {
        list(adminToken, "?search=Chemist " + marker)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].region").value(nullValue()))
                .andExpect(jsonPath("$[0].district").value(nullValue()));
    }

    @Test
    void filtersByRole() throws Exception {
        list(adminToken, "?role=agrochemist&search=" + marker)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(chemistId.toString()));
    }

    @Test
    void namesRegionInTheAskedLanguage() throws Exception {
        mvc.perform(get("/api/admin/users?search=Farmer " + marker).header("Authorization", adminToken)
                .header("Accept-Language", "kk"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].region").value("Аймақ"));
        mvc.perform(get("/api/admin/users?lang=en&search=Farmer " + marker).header("Authorization", adminToken)
                .header("Accept-Language", "kk"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].region").value("Region"));
    }

    @ParameterizedTest
    @ValueSource(strings = { "?role=admin", "?size=0", "?size=101", "?page=-1", "?page=10001" })
    void rejectsBadParameters(String query) throws Exception {
        list(adminToken, query).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void rejectsTooLongSearch() throws Exception {
        list(adminToken, "?search=" + "a".repeat(101)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
    }
}
