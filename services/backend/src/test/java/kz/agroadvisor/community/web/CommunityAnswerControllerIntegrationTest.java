package kz.agroadvisor.community.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
class CommunityAnswerControllerIntegrationTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    // the same beans as CommunityQuestionControllerIntegrationTest, so both share one Spring context
    @MockitoBean
    private CommunityPhotoStorage storage;

    private final List<UUID> created = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role) {
        String phone = "+7727" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Reply " + phone, "ru", Set.of(role))).getId();
        created.add(id);
        jdbc.update("UPDATE users SET region_id = (SELECT min(id) FROM regions) WHERE id = ?", id);
        return id;
    }

    private String token(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private String newQuestion(UUID author) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO community_questions (id, author_id, crop_code, region_id, title, body)
                VALUES (?, ?, 'potato', (SELECT min(id) FROM regions), 'Late blight?', 'Spots on the leaves')
                """, id, author);
        return id.toString();
    }

    private ResultActions json(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
            String token, String body) throws Exception {
        return mvc.perform(request.header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private String answer(String token, String questionId, String text) throws Exception {
        String body = json(post("/api/community/questions/" + questionId + "/answers"), token,
                "{\"text\":\"" + text + "\"}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    @Test
    void anAgrochemistAnswersAndTheAuthorPicksTheBestAnswer() throws Exception {
        UUID authorId = newUser(Role.FARMER);
        String author = token(authorId);
        String expert = token(newUser(Role.AGROCHEMIST));
        String questionId = newQuestion(authorId);

        json(post("/api/community/questions/" + questionId + "/answers"), expert, "{\"text\":\"  Spray copper  \"}")
                .andExpect(status().isCreated())
                .andExpect(header().doesNotExist("Location"))
                .andExpect(jsonPath("$.text").value("Spray copper"))
                .andExpect(jsonPath("$.mine").value(true))
                .andExpect(jsonPath("$.accepted").value(false));
        String answerId = JsonPath.read(mvc.perform(get("/api/community/questions/" + questionId + "/answers")
                .header("Authorization", author)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].mine").value(false))
                .andReturn().getResponse().getContentAsString(), "$[0].id");

        json(put("/api/community/questions/" + questionId + "/accepted-answer"), author,
                "{\"answerId\":\"" + answerId + "\"}").andExpect(status().isNoContent());
        mvc.perform(get("/api/community/questions/" + questionId).header("Authorization", expert))
                .andExpect(jsonPath("$.status").value("solved"));
        mvc.perform(get("/api/community/questions/" + questionId + "/answers").header("Authorization", expert))
                .andExpect(jsonPath("$[0].accepted").value(true));
        mvc.perform(delete("/api/community/questions/" + questionId + "/accepted-answer")
                .header("Authorization", author)).andExpect(status().isNoContent());
        mvc.perform(get("/api/community/questions/" + questionId).header("Authorization", expert))
                .andExpect(jsonPath("$.status").value("open"));
    }

    @Test
    void onlyTheAuthorPicksTheBestAnswerAndNotTheirOwn() throws Exception {
        UUID authorId = newUser(Role.FARMER);
        String author = token(authorId);
        String other = token(newUser(Role.FARMER));
        String questionId = newQuestion(authorId);
        String foreign = answer(other, questionId, "Try a fungicide");
        String own = answer(author, questionId, "Maybe it is blight");

        json(put("/api/community/questions/" + questionId + "/accepted-answer"), other,
                "{\"answerId\":\"" + foreign + "\"}").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("not_question_author"));
        json(put("/api/community/questions/" + questionId + "/accepted-answer"), author,
                "{\"answerId\":\"" + own + "\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("own_answer"));
    }

    @Test
    void votesChangeTheScoreAndOwnAnswersCannotBeVoted() throws Exception {
        UUID authorId = newUser(Role.FARMER);
        String author = token(authorId);
        String voter = token(newUser(Role.FARMER));
        String questionId = newQuestion(authorId);
        String answerId = answer(author, questionId, "I think it is blight");

        json(put("/api/community/answers/" + answerId + "/vote"), voter, "{\"value\":1}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.score").value(1))
                .andExpect(jsonPath("$.myVote").value(1));
        json(put("/api/community/answers/" + answerId + "/vote"), voter, "{\"value\":-1}")
                .andExpect(jsonPath("$.score").value(-1));
        mvc.perform(delete("/api/community/answers/" + answerId + "/vote").header("Authorization", voter))
                .andExpect(status().isOk()).andExpect(jsonPath("$.score").value(0))
                .andExpect(jsonPath("$.myVote").value(0));
        json(put("/api/community/answers/" + answerId + "/vote"), author, "{\"value\":1}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("own_answer"));
        json(put("/api/community/answers/" + answerId + "/vote"), voter, "{\"value\":2}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void anEmptyAnswerAndAMissingQuestionAreRefused() throws Exception {
        String farmer = token(newUser(Role.FARMER));
        String questionId = newQuestion(newUser(Role.FARMER));

        json(post("/api/community/questions/" + questionId + "/answers"), farmer, "{\"text\":\"   \"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        json(post("/api/community/questions/" + UUID.randomUUID() + "/answers"), farmer, "{\"text\":\"Hello\"}")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("question_not_found"));
        json(put("/api/community/answers/" + UUID.randomUUID() + "/vote"), farmer, "{\"value\":1}")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("answer_not_found"));
        mvc.perform(get("/api/community/questions/" + questionId + "/answers")
                .header("Authorization", token(newUser(Role.ADMIN)))).andExpect(status().isForbidden());
    }

    @Test
    void subscriptionsAreReplacedAsAWholeAndUnknownCropsAreRefused() throws Exception {
        String farmer = token(newUser(Role.FARMER));

        mvc.perform(get("/api/community/subscriptions").header("Authorization", farmer))
                .andExpect(status().isOk()).andExpect(jsonPath("$.crops.length()").value(0));
        json(put("/api/community/subscriptions"), farmer, "{\"crops\":[\"wheat\",\"potato\"]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.crops[0]").value("potato"))
                .andExpect(jsonPath("$.crops[1]").value("wheat"));
        json(put("/api/community/subscriptions"), farmer, "{\"crops\":[\"potato\",\"moon-grass\"]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        mvc.perform(get("/api/community/subscriptions").header("Authorization", farmer))
                .andExpect(jsonPath("$.crops.length()").value(2));
    }
}
