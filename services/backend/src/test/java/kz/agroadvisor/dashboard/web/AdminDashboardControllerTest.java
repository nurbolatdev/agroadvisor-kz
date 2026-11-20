package kz.agroadvisor.dashboard.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

/** The database is shared with other test classes, so figures are compared before and after, not absolutely. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AdminDashboardControllerTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private JsonMapper json;

    private final List<UUID> created = new ArrayList<>();
    private String adminToken;
    private String farmerToken;
    private UUID farmerId;

    @BeforeEach
    void setUp() {
        farmerId = user(Role.FARMER);
        adminToken = "Bearer " + jwt.issueAccessToken(user(Role.ADMIN));
        farmerToken = "Bearer " + jwt.issueAccessToken(farmerId);
    }

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID user(Role role) {
        String phone = "+7705" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Dashboard " + role, "ru", Set.of(role)))
                .getId();
        created.add(id);
        return id;
    }

    private void diagnosis(double confidence) {
        jdbc.update("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version)
                VALUES (?, 'potato', 'diagnoses/dashboard.jpg', 'ok', 'potato__late_blight', ?, 'effnet-b0-v1', 1)""",
                farmerId, confidence);
    }

    private JsonNode overview(String query) throws Exception {
        String body = mvc.perform(get("/api/admin/dashboard" + query).header("Authorization", adminToken))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    @Test
    void requiresAnAdministrator() throws Exception {
        mvc.perform(get("/api/admin/dashboard")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/dashboard").header("Authorization", farmerToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void rejectsABadPeriodOrThreshold() throws Exception {
        mvc.perform(get("/api/admin/dashboard?period=year").header("Authorization", adminToken))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        mvc.perform(get("/api/admin/dashboard?confidenceThreshold=101").header("Authorization", adminToken))
                .andExpect(status().isBadRequest());
    }

    @Test
    void countsDiagnosesUsersAndTodaysBucket() throws Exception {
        JsonNode before = overview("?period=7d&confidenceThreshold=50");
        diagnosis(0.9);
        diagnosis(0.3);
        JsonNode after = overview("?period=7d&confidenceThreshold=50");

        assertThat(after.get("diagnoses").get("value").asInt() - before.get("diagnoses").get("value").asInt())
                .isEqualTo(2);
        assertThat(after.get("activeUsers").get("value").asInt()
                - before.get("activeUsers").get("value").asInt()).isEqualTo(1);
        String today = Instant.now().toString().substring(0, 10);
        int todayBefore = dayCount(before, today);
        assertThat(dayCount(after, today) - todayBefore).isEqualTo(2);
        assertThat(after.get("newUsers").isArray()).isTrue();
        assertThat(after.get("avgConfidence").get("percent").asInt()).isBetween(0, 100);
    }

    @Test
    void seasonGroupsDiagnosesByWeekAndSignupsByMonth() throws Exception {
        diagnosis(0.8);
        JsonNode season = overview("?period=season");
        assertThat(season.get("period").asString()).isEqualTo("season");
        assertThat(season.get("diagnosesByDay").size()).isPositive();
        for (JsonNode m : season.get("newUsers")) {
            assertThat(m.get("bucket").asInt()).isBetween(0, 11);
        }
    }

    private static int dayCount(JsonNode view, String day) {
        for (JsonNode d : view.get("diagnosesByDay")) {
            if (day.equals(d.get("date").asString())) {
                return d.get("count").asInt();
            }
        }
        return 0;
    }
}
