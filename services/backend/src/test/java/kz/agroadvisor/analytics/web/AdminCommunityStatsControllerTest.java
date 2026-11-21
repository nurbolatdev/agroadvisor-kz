package kz.agroadvisor.analytics.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Duration;
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
import kz.agroadvisor.analytics.repository.CommunityStatsRepository;
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
class AdminCommunityStatsControllerTest {

    private static final String URL = "/api/admin/community/stats";

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
    private CommunityStatsRepository statsRepository;

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
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Stats " + role, "ru", Set.of(role)))
                .getId();
        created.add(id);
        return id;
    }

    private UUID question(Instant createdAt) {
        return jdbc.queryForObject("""
                INSERT INTO community_questions (author_id, crop_code, region_id, title, body, created_at)
                VALUES (?, 'potato', (SELECT min(id) FROM regions), 'Stats title', 'Body', ?) RETURNING id""",
                UUID.class, farmerId, Timestamp.from(createdAt));
    }

    private JsonNode stats(String query) throws Exception {
        String body = mvc.perform(get(URL + query).header("Authorization", adminToken))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    @Test
    void requiresAnAdministrator() throws Exception {
        mvc.perform(get(URL)).andExpect(status().isUnauthorized());
        mvc.perform(get(URL).header("Authorization", farmerToken)).andExpect(status().isForbidden());
    }

    @Test
    void rejectsABadPeriod() throws Exception {
        mvc.perform(get(URL + "?period=1y").header("Authorization", adminToken))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void answersWithEveryFieldAndThirtyDaysByDefault() throws Exception {
        JsonNode view = stats("");

        assertThat(view.get("period").asString()).isEqualTo("30d");
        for (String field : List.of("questions", "firstAnswerMinutes", "resolvedShare", "unansweredOver24h",
                "activity", "topMembers", "unanswered", "consultations")) {
            assertThat(view.has(field)).as(field).isTrue();
        }
        assertThat(stats("?period=7d").get("activity").size()).isEqualTo(7);
        assertThat(stats("?period=season").get("period").asString()).isEqualTo("season");
    }

    @Test
    void aQuestionWithoutAnAnswerForADayIsCountedAndListed() throws Exception {
        JsonNode before = stats("?period=7d");
        UUID old = question(Instant.now().minus(Duration.ofHours(30)));
        question(Instant.now().minus(Duration.ofHours(2)));
        JsonNode after = stats("?period=7d");

        assertThat(after.get("unansweredOver24h").get("value").asInt()
                - before.get("unansweredOver24h").get("value").asInt()).isEqualTo(1);
        assertThat(after.get("questions").get("value").asInt() - before.get("questions").get("value").asInt())
                .isEqualTo(2);
        assertThat(after.get("unanswered").size()).isLessThanOrEqualTo(50);
        // the response list is capped at 50 and the database is shared, so the full list comes from the repository
        assertThat(statsRepository.unanswered(Instant.now(), 10_000))
                .filteredOn(item -> item.id().equals(old))
                .singleElement()
                .satisfies(item -> {
                    assertThat(item.cropCode()).isEqualTo("potato");
                    assertThat(Duration.between(item.createdAt(), Instant.now()).toHours())
                            .isGreaterThanOrEqualTo(30);
                });
    }
}
