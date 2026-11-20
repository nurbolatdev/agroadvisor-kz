package kz.agroadvisor.analytics.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
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
import kz.agroadvisor.analytics.repository.DashboardRepository;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.diagnosis.service.AiQualityService;
import kz.agroadvisor.diagnosis.service.AiQualityService.Period;
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
    @Autowired
    private DashboardRepository repository;

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

    private void diagnosis(double confidence, int daysAgo) {
        jdbc.update("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version, created_at)
                VALUES (?, 'potato', 'diagnoses/dashboard.jpg', 'ok', 'potato__late_blight', ?, 'effnet-b0-v1', 1,
                        now() - make_interval(days => ?))""", farmerId, confidence, daysAgo);
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
    void countsTheWindowAndLeavesThePreviousOneOut() throws Exception {
        JsonNode before = overview("?period=7d&confidenceThreshold=50");
        Instant now = Instant.now();
        Instant from = now.minus(Duration.ofDays(7));
        int lowBefore = repository.totals(from, now.plusSeconds(60), 0.5).lowConfidence();
        diagnosis(0.9, 1);
        diagnosis(0.3, 1);
        diagnosis(0.5, 10); // the previous window: not counted now
        JsonNode after = overview("?period=7d&confidenceThreshold=50");

        assertThat(after.get("diagnoses").get("value").asInt() - before.get("diagnoses").get("value").asInt())
                .isEqualTo(2);
        assertThat(after.get("activeUsers").get("value").asInt()
                - before.get("activeUsers").get("value").asInt()).isEqualTo(1);
        assertThat(repository.totals(from, now.plusSeconds(60), 0.5).lowConfidence() - lowBefore).isEqualTo(1);
        String day = now.minus(Duration.ofDays(1)).atZone(ZoneOffset.UTC).toLocalDate().toString();
        assertThat(dayCount(after, day) - dayCount(before, day)).isEqualTo(2);
        assertThat(after.get("avgConfidence").get("percent").asInt()).isBetween(0, 100);
        assertThat(after.get("lowConfidenceShare").get("percent").asInt()).isBetween(0, 100);
    }

    @Test
    void givesOnePointForEveryDayOfTheWindow() throws Exception {
        JsonNode view = overview("?period=7d");

        JsonNode days = view.get("diagnosesByDay");
        assertThat(days.size()).isEqualTo(8); // a part of the day 7 days ago, then up to today
        for (int i = 1; i < days.size(); i++) {
            assertThat(LocalDate.parse(days.get(i).get("date").asString()))
                    .isEqualTo(LocalDate.parse(days.get(i - 1).get("date").asString()).plusDays(1));
        }
        assertThat(view.get("newUsers").size()).isEqualTo(1);
    }

    @Test
    void countsNewAccountsByRoleAndLeavesAdminsOut() throws Exception {
        JsonNode before = overview("?period=7d");
        user(Role.AGROCHEMIST);
        user(Role.ADMIN);
        JsonNode after = overview("?period=7d");

        JsonNode b = before.get("newUsers").get(0);
        JsonNode a = after.get("newUsers").get(0);
        assertThat(a.get("agrochemists").asInt() - b.get("agrochemists").asInt()).isEqualTo(1);
        assertThat(a.get("farmers").asInt()).isEqualTo(b.get("farmers").asInt());
    }

    @Test
    void seasonGivesEveryWeekFromTheFirstOfMarchAndEveryMonth() throws Exception {
        JsonNode season = overview("?period=season");

        assertThat(season.get("period").asString()).isEqualTo("season");
        JsonNode weeks = season.get("diagnosesByDay");
        LocalDate start = AiQualityService.since(Period.SEASON, Instant.now()).atZone(ZoneOffset.UTC)
                .toLocalDate();
        assertThat(LocalDate.parse(weeks.get(0).get("date").asString())).isEqualTo(start);
        for (int i = 1; i < weeks.size(); i++) {
            assertThat(LocalDate.parse(weeks.get(i).get("date").asString()))
                    .isEqualTo(LocalDate.parse(weeks.get(i - 1).get("date").asString()).plusDays(7));
        }
        JsonNode months = season.get("newUsers");
        assertThat(months.get(0).get("bucket").asInt()).isEqualTo(start.getMonthValue() - 1);
        for (int i = 1; i < months.size(); i++) {
            assertThat(months.get(i).get("bucket").asInt())
                    .isEqualTo((months.get(i - 1).get("bucket").asInt() + 1) % 12);
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
