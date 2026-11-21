package kz.agroadvisor.community.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

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
class CommunityModerationIntegrationTest {

    private static final String PASSWORD = "correct horse";

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
    private final List<String> phones = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        // questions first: their cases and reports go with them, and they refer to the admin who acted
        created.forEach(id -> jdbc.update("DELETE FROM community_questions WHERE author_id = ?", id));
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
        phones.forEach(phone -> jdbc.update("DELETE FROM users WHERE phone = ?", phone));
    }

    private UUID newUser(Role role) {
        String phone = "+7729" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Mod " + phone, "ru", Set.of(role))).getId();
        created.add(id);
        jdbc.update("UPDATE users SET region_id = (SELECT min(id) FROM regions) WHERE id = ?", id);
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

    private String askId(String token) throws Exception {
        return JsonPath.read(ask(token).andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString(), "$.id");
    }

    private ResultActions json(MockHttpServletRequestBuilder request, String token, String body) throws Exception {
        return mvc.perform(request.header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions report(String token, String questionId, String reason) throws Exception {
        return json(post("/api/community/reports"), token, "{\"targetType\":\"question\",\"targetId\":\""
                + questionId + "\",\"reason\":\"" + reason + "\",\"comment\":\"See it\"}");
    }

    private ResultActions feed(String token) throws Exception {
        return mvc.perform(get("/api/community/questions?crop=potato&limit=50").header("Authorization", token));
    }

    private String complaintOf(String admin, String questionId) throws Exception {
        String list = mvc.perform(get("/api/admin/community/complaints?targetType=question&size=100")
                .header("Authorization", admin)).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString();
        List<String> ids = JsonPath.read(list, "$[?(@.target.questionId=='" + questionId + "')].id");
        if (ids.size() != 1) {
            throw new AssertionError("expected one case for the question, got " + ids);
        }
        return ids.get(0);
    }

    @Test
    void twoReportsOpenOneCaseAnAdminHidesTheQuestionAndRestoresItAndTheResolvedCaseIsFinal() throws Exception {
        String author = token(newUser(Role.FARMER));
        String reporterA = token(newUser(Role.FARMER));
        String reporterB = token(newUser(Role.FARMER));
        String admin = token(newUser(Role.ADMIN));
        String questionId = askId(author);

        report(reporterA, questionId, "spam").andExpect(status().isNoContent());
        report(reporterB, questionId, "ads").andExpect(status().isNoContent());

        String complaintId = complaintOf(admin, questionId);
        mvc.perform(get("/api/admin/community/complaints/" + complaintId).header("Authorization", admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("new"))
                .andExpect(jsonPath("$.reports.length()").value(2))
                .andExpect(jsonPath("$.reports[?(@.reason=='spam')].count").value(1))
                .andExpect(jsonPath("$.reports[?(@.reason=='ads')].count").value(1))
                .andExpect(jsonPath("$.target.hidden").value(false));

        mvc.perform(post("/api/admin/community/complaints/" + complaintId + "/start").header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("in_progress"));
        feed(reporterA).andExpect(jsonPath("$[?(@.id=='" + questionId + "')]").isNotEmpty());

        json(post("/api/admin/community/complaints/" + complaintId + "/resolve"), admin,
                "{\"action\":\"hide\",\"comment\":\"Spam\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("resolved"))
                .andExpect(jsonPath("$.resolution.action").value("hide"))
                .andExpect(jsonPath("$.target.hidden").value(true));

        mvc.perform(get("/api/community/questions/" + questionId).header("Authorization", reporterA))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/community/questions/" + questionId).header("Authorization", author))
                .andExpect(status().isNotFound());
        feed(reporterA).andExpect(jsonPath("$[?(@.id=='" + questionId + "')]").isEmpty());
        mvc.perform(get("/api/admin/community/complaints/" + complaintId).header("Authorization", admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.target.questionTitle").value("Late blight?"))
                .andExpect(jsonPath("$.target.hidden").value(true));

        json(post("/api/admin/community/complaints/" + complaintId + "/resolve"), admin, "{\"action\":\"keep\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("complaint_resolved"));
        mvc.perform(post("/api/admin/community/complaints/" + complaintId + "/start").header("Authorization", admin))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("complaint_resolved"));

        json(patch("/api/admin/community/questions/" + questionId + "/status"), admin, "{\"status\":\"visible\"}")
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/community/questions/" + questionId).header("Authorization", reporterA))
                .andExpect(status().isOk());
        feed(reporterA).andExpect(jsonPath("$[?(@.id=='" + questionId + "')]").isNotEmpty());
    }

    @Test
    void blockingTheAuthorHidesTheQuestionAndClosesTheirSessions() throws Exception {
        String phone = "+7729" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
        phones.add(phone);
        String registered = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"" + phone + "\",\"password\":\"" + PASSWORD
                        + "\",\"fullName\":\"Spammer\",\"role\":\"farmer\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID authorId = jdbc.queryForObject("SELECT id FROM users WHERE phone = ?", UUID.class, phone);
        created.add(authorId);
        jdbc.update("UPDATE users SET region_id = (SELECT min(id) FROM regions) WHERE id = ?", authorId);
        String refresh = JsonPath.read(registered, "$.refreshToken");
        String reporter = token(newUser(Role.FARMER));
        String admin = token(newUser(Role.ADMIN));

        String questionId = askId("Bearer " + JsonPath.<String>read(registered, "$.accessToken"));
        report(reporter, questionId, "abuse").andExpect(status().isNoContent());
        String complaintId = complaintOf(admin, questionId);

        json(post("/api/admin/community/complaints/" + complaintId + "/resolve"), admin, "{\"action\":\"block\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolution.action").value("block"))
                .andExpect(jsonPath("$.target.hidden").value(true))
                .andExpect(jsonPath("$.author.status").value("blocked"));

        mvc.perform(get("/api/community/questions/" + questionId).header("Authorization", reporter))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + refresh + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_refresh_token"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"login\":\"" + phone + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("account_blocked"));
    }
}
