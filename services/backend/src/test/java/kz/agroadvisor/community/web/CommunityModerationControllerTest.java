package kz.agroadvisor.community.web;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
class CommunityModerationControllerTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    // the same beans as the other community controller tests, so they share one Spring context
    @MockitoBean
    private CommunityPhotoStorage storage;

    private final List<UUID> created = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        // questions first: their answers, cases and photos go with them, and they refer to the admin who acted
        created.forEach(id -> jdbc.update("DELETE FROM community_questions WHERE author_id = ?", id));
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role) {
        String phone = "+7728" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Mod " + phone, "ru", Set.of(role))).getId();
        created.add(id);
        jdbc.update("UPDATE users SET region_id = (SELECT min(id) FROM regions) WHERE id = ?", id);
        return id;
    }

    private String token(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private UUID newQuestion(UUID author) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO community_questions (id, author_id, crop_code, region_id, title, body)
                VALUES (?, ?, 'potato', (SELECT min(id) FROM regions), 'Late blight?', 'Spots on the leaves')
                """, id, author);
        return id;
    }

    private UUID newAnswer(UUID questionId, UUID author) {
        return jdbc.queryForObject("""
                INSERT INTO community_answers (question_id, author_id, body) VALUES (?, ?, 'Use copper')
                RETURNING id""", UUID.class, questionId, author);
    }

    private UUID newComplaint(UUID questionId, UUID answerId, UUID reporter) {
        UUID id = jdbc.queryForObject("""
                INSERT INTO community_complaints (target_type, question_id, answer_id) VALUES (?, ?, ?)
                RETURNING id""", UUID.class, answerId == null ? "question" : "answer", questionId, answerId);
        jdbc.update("INSERT INTO community_reports (complaint_id, reporter_id, reason, comment) "
                + "VALUES (?, ?, 'spam', 'Spam here')", id, reporter);
        return id;
    }

    private ResultActions json(MockHttpServletRequestBuilder request, String token, String body) throws Exception {
        return mvc.perform(request.header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    void onlyAnAdministratorCanUseTheModerationPaths() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(get("/api/admin/community/complaints")).andExpect(status().isUnauthorized());
        for (Role role : List.of(Role.FARMER, Role.AGROCHEMIST)) {
            String token = token(newUser(role));
            String body = "{\"action\":\"keep\"}";
            String visible = "{\"status\":\"hidden\"}";
            mvc.perform(get("/api/admin/community/complaints").header("Authorization", token))
                    .andExpect(status().isForbidden());
            mvc.perform(get("/api/admin/community/complaints/" + id).header("Authorization", token))
                    .andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/community/complaints/" + id + "/start").header("Authorization", token))
                    .andExpect(status().isForbidden());
            json(post("/api/admin/community/complaints/" + id + "/resolve"), token, body)
                    .andExpect(status().isForbidden());
            mvc.perform(get("/api/admin/community/moderation-stats").header("Authorization", token))
                    .andExpect(status().isForbidden());
            json(patch("/api/admin/community/questions/" + id + "/status"), token, visible)
                    .andExpect(status().isForbidden());
            json(patch("/api/admin/community/answers/" + id + "/status"), token, visible)
                    .andExpect(status().isForbidden());
            mvc.perform(get("/api/admin/community/questions/" + id + "/photos/" + id).header("Authorization", token))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void refusesWhatIsNotADecisionOrAFilter() throws Exception {
        String admin = token(newUser(Role.ADMIN));
        UUID complaint = newComplaint(newQuestion(newUser(Role.FARMER)), null, newUser(Role.FARMER));

        json(post("/api/admin/community/complaints/" + complaint + "/resolve"), admin, "{\"action\":\"ban\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        json(post("/api/admin/community/complaints/" + complaint + "/resolve"), admin, "{}")
                .andExpect(status().isBadRequest());
        json(patch("/api/admin/community/questions/" + UUID.randomUUID() + "/status"), admin,
                "{\"status\":\"deleted\"}").andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/community/complaints?status=open").header("Authorization", admin))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/community/complaints?size=101").header("Authorization", admin))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anUnknownCaseOrPostIsNotFound() throws Exception {
        String admin = token(newUser(Role.ADMIN));
        UUID id = UUID.randomUUID();

        mvc.perform(get("/api/admin/community/complaints/" + id).header("Authorization", admin))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("complaint_not_found"));
        mvc.perform(post("/api/admin/community/complaints/" + id + "/start").header("Authorization", admin))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("complaint_not_found"));
        json(post("/api/admin/community/complaints/" + id + "/resolve"), admin, "{\"action\":\"keep\"}")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("complaint_not_found"));
        json(patch("/api/admin/community/questions/" + id + "/status"), admin, "{\"status\":\"hidden\"}")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("question_not_found"));
        json(patch("/api/admin/community/answers/" + id + "/status"), admin, "{\"status\":\"hidden\"}")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("answer_not_found"));
    }

    @Test
    void theAdminTakesACaseHidesThePostAndBringsItBack() throws Exception {
        String admin = token(newUser(Role.ADMIN));
        UUID authorId = newUser(Role.FARMER);
        String farmer = token(newUser(Role.FARMER));
        UUID question = newQuestion(authorId);
        UUID complaint = newComplaint(question, null, newUser(Role.FARMER));

        mvc.perform(get("/api/admin/community/complaints?status=new&targetType=question&reason=spam&size=100")
                .header("Authorization", admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + complaint + "')].target.questionTitle").value("Late blight?"));
        mvc.perform(get("/api/admin/community/moderation-stats").header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.newComplaints").isNumber());

        mvc.perform(post("/api/admin/community/complaints/" + complaint + "/start").header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("in_progress"));
        json(post("/api/admin/community/complaints/" + complaint + "/resolve"), admin,
                "{\"action\":\"hide\",\"comment\":\"  Advertising  \"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("resolved"))
                .andExpect(jsonPath("$.resolution.action").value("hide"))
                .andExpect(jsonPath("$.resolution.comment").value("Advertising"))
                .andExpect(jsonPath("$.target.hidden").value(true))
                .andExpect(jsonPath("$.reports[0].reason").value("spam"));
        json(post("/api/admin/community/complaints/" + complaint + "/resolve"), admin, "{\"action\":\"keep\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("complaint_resolved"));
        mvc.perform(get("/api/community/questions/" + question).header("Authorization", farmer))
                .andExpect(status().isNotFound());

        json(patch("/api/admin/community/questions/" + question + "/status"), admin, "{\"status\":\"visible\"}")
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/community/questions/" + question).header("Authorization", farmer))
                .andExpect(status().isOk());
    }

    @Test
    void anAnswerIsHiddenAndTheBlockOfAnAdministratorAuthorIsRefused() throws Exception {
        String admin = token(newUser(Role.ADMIN));
        UUID question = newQuestion(newUser(Role.FARMER));
        UUID adminAuthor = newUser(Role.ADMIN);
        UUID answer = newAnswer(question, adminAuthor);
        UUID complaint = newComplaint(question, answer, newUser(Role.FARMER));

        json(post("/api/admin/community/complaints/" + complaint + "/resolve"), admin, "{\"action\":\"block\"}")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("admin_status_locked"));
        mvc.perform(get("/api/admin/community/complaints/" + complaint).header("Authorization", admin))
                .andExpect(jsonPath("$.status").value("new")).andExpect(jsonPath("$.target.hidden").value(false));

        json(patch("/api/admin/community/answers/" + answer + "/status"), admin, "{\"status\":\"hidden\"}")
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/admin/community/complaints/" + complaint).header("Authorization", admin))
                .andExpect(jsonPath("$.target.hidden").value(true));
    }

    @Test
    void theAdminSeesAPhotoOfAHiddenQuestion() throws Exception {
        String admin = token(newUser(Role.ADMIN));
        String farmer = token(newUser(Role.FARMER));
        UUID question = newQuestion(newUser(Role.FARMER));
        UUID photo = jdbc.queryForObject("""
                INSERT INTO community_question_photos (question_id, photo_key, content_type, size_bytes, position)
                VALUES (?, 'community/k/p.jpg', 'image/jpeg', 3, 0) RETURNING id""", UUID.class, question);
        byte[] bytes = {1, 2, 3};
        given(storage.load("community/k/p.jpg")).willReturn(bytes);
        jdbc.update("UPDATE community_questions SET hidden_at = now(), hidden_by = ? WHERE id = ?",
                created.get(0), question);

        mvc.perform(get("/api/admin/community/questions/" + question + "/photos/" + photo)
                .header("Authorization", admin)).andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG)).andExpect(content().bytes(bytes));
        mvc.perform(get("/api/community/questions/" + question + "/photos/" + photo)
                .header("Authorization", farmer)).andExpect(status().isNotFound());
        mvc.perform(get("/api/admin/community/questions/" + question + "/photos/" + UUID.randomUUID())
                .header("Authorization", admin)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("photo_not_found"));
    }
}
