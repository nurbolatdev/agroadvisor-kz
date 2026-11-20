package kz.agroadvisor.community.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.community.service.CommunityPhotoStorage;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CommunityFlowIntegrationTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    // the same beans as the other community integration tests, so all of them share one Spring context
    @MockitoBean
    private CommunityPhotoStorage storage;

    private final List<UUID> created = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role, boolean verified) {
        String phone = "+7727" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Flow " + phone, "ru", Set.of(role))).getId();
        created.add(id);
        jdbc.update("UPDATE users SET region_id = (SELECT min(id) FROM regions) WHERE id = ?", id);
        if (role == Role.AGROCHEMIST) {
            jdbc.update("""
                    INSERT INTO agrochemist_profiles (user_id, specialization, experience_years, verification_status)
                    VALUES (?, 'plant_protection', 4, ?)""", id, verified ? "approved" : "pending");
        }
        return id;
    }

    private String token(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private ResultActions ask(String token) throws Exception {
        return mvc.perform(multipart("/api/community/questions")
                .part(CommunityQuestionControllerIntegrationTest.textPart("title", "Late blight?"),
                        CommunityQuestionControllerIntegrationTest.textPart("text", "Spots on the leaves"),
                        CommunityQuestionControllerIntegrationTest.textPart("cropCode", "potato"))
                .header("Authorization", token));
    }

    private ResultActions json(MockHttpServletRequestBuilder request, String token, String body) throws Exception {
        return mvc.perform(request.header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions feed(String token, String query) throws Exception {
        return mvc.perform(get("/api/community/questions" + query).header("Authorization", token));
    }

    @Test
    void aQuestionIsAnsweredVotedAcceptedAndMovesBetweenFeedFiltersAndReadsAsOpenAfterTheAnswerIsClearedInSql() throws Exception {
        String farmerA = token(newUser(Role.FARMER, false));
        String farmerB = token(newUser(Role.FARMER, false));
        String expert = token(newUser(Role.AGROCHEMIST, true));

        String questionId = JsonPath.read(ask(farmerA).andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString(), "$.id");
        feed(farmerB, "?status=unanswered&crop=potato&limit=50")
                .andExpect(jsonPath("$[?(@.id=='" + questionId + "')]").isNotEmpty());

        String answerId = JsonPath.read(json(post("/api/community/questions/" + questionId + "/answers"), expert,
                "{\"text\":\"Spray copper\"}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.authorExpert").value(true)).andReturn().getResponse().getContentAsString(),
                "$.id");
        feed(farmerB, "?status=unanswered&crop=potato&limit=50")
                .andExpect(jsonPath("$[?(@.id=='" + questionId + "')]").isEmpty());

        json(put("/api/community/answers/" + answerId + "/vote"), farmerB, "{\"value\":1}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.score").value(1));
        json(put("/api/community/questions/" + questionId + "/accepted-answer"), farmerA,
                "{\"answerId\":\"" + answerId + "\"}").andExpect(status().isNoContent());

        feed(farmerB, "?status=solved&crop=potato&limit=50")
                .andExpect(jsonPath("$[?(@.id=='" + questionId + "')]").isNotEmpty());
        feed(farmerB, "?status=unanswered&crop=potato&limit=50")
                .andExpect(jsonPath("$[?(@.id=='" + questionId + "')]").isEmpty());

        // Only reading after a direct SQL change: the card and the feed show an open question once the best
        // answer is cleared and hidden. The rule that moderation clears it is tested with the moderation service.
        jdbc.update("UPDATE community_questions SET accepted_answer_id = NULL WHERE id = ?::uuid", questionId);
        jdbc.update("UPDATE community_answers SET hidden_at = now(), hidden_by = "
                + "(SELECT id FROM users WHERE id = author_id) WHERE id = ?::uuid", answerId);
        mvc.perform(get("/api/community/questions/" + questionId).header("Authorization", farmerB))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("open"));
        feed(farmerB, "?status=solved&crop=potato&limit=50")
                .andExpect(jsonPath("$[?(@.id=='" + questionId + "')]").isEmpty());
    }

    @Test
    void anUnverifiedAgrochemistAnswersWithoutTheExpertMark() throws Exception {
        String farmer = token(newUser(Role.FARMER, false));
        String pending = token(newUser(Role.AGROCHEMIST, false));
        String questionId = JsonPath.read(ask(farmer).andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString(), "$.id");

        json(post("/api/community/questions/" + questionId + "/answers"), pending, "{\"text\":\"Maybe blight\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.authorExpert").value(false));
    }

    @Test
    void theEleventhQuestionInAnHourIsRateLimited() throws Exception {
        String farmer = token(newUser(Role.FARMER, false));
        for (int i = 0; i < 10; i++) {
            ask(farmer).andExpect(status().isCreated());
        }

        ask(farmer).andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("rate_limited"));
    }

    @Test
    void aDisabledCommunityFeatureIsForbiddenAndAnonymousCallsAreUnauthorized() throws Exception {
        String farmer = token(newUser(Role.FARMER, false));
        mvc.perform(get("/api/community/questions")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/community/questions/" + UUID.randomUUID() + "/accepted-answer"))
                .andExpect(status().isUnauthorized());

        jdbc.update("DELETE FROM plan_feature WHERE plan_code = 'FREE' AND feature_code = 'community'");
        try {
            feed(farmer, "").andExpect(status().isForbidden());
            ask(farmer).andExpect(status().isForbidden());
        } finally {
            jdbc.update("INSERT INTO plan_feature (plan_code, feature_code, daily_limit) VALUES ('FREE', 'community', NULL)");
        }
        feed(farmer, "").andExpect(status().isOk());
    }
}
