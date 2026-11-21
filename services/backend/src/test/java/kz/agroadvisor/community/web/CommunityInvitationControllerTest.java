package kz.agroadvisor.community.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
class CommunityInvitationControllerTest {

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
        // questions first: their invitations go with them, and they refer to the admin who invited
        created.forEach(id -> jdbc.update("DELETE FROM community_questions WHERE author_id = ?", id));
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role) {
        String phone = "+7729" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Agro " + phone, "ru", Set.of(role))).getId();
        created.add(id);
        jdbc.update("UPDATE users SET region_id = (SELECT min(id) FROM regions) WHERE id = ?", id);
        return id;
    }

    private UUID agrochemist(String verificationStatus) {
        UUID id = newUser(Role.AGROCHEMIST);
        jdbc.update("INSERT INTO agrochemist_profiles (user_id, verification_status) VALUES (?, ?)", id,
                verificationStatus);
        return id;
    }

    private String token(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private UUID newQuestion(UUID author, boolean hidden) {
        return jdbc.queryForObject("""
                INSERT INTO community_questions (author_id, crop_code, region_id, title, body, hidden_at, hidden_by)
                VALUES (?, 'potato', (SELECT min(id) FROM regions), 'Late blight?', 'Spots',
                        CASE WHEN ? THEN now() END, CASE WHEN ? THEN ? END) RETURNING id
                """, UUID.class, author, hidden, hidden, author);
    }

    private ResultActions invite(String token, UUID question, String body) throws Exception {
        return mvc.perform(post("/api/admin/community/questions/" + question + "/invitations")
                .header("Authorization", token).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String body(UUID agrochemist) {
        return "{\"agrochemistId\":\"" + agrochemist + "\"}";
    }

    @Test
    void onlyAnAdministratorCanInvite() throws Exception {
        UUID question = UUID.randomUUID();
        mvc.perform(post("/api/admin/community/questions/" + question + "/invitations")
                .contentType(MediaType.APPLICATION_JSON).content(body(question)))
                .andExpect(status().isUnauthorized());
        for (Role role : List.of(Role.FARMER, Role.AGROCHEMIST)) {
            invite(token(newUser(role)), question, body(question)).andExpect(status().isForbidden());
        }
    }

    @Test
    void theAgrochemistIdIsRequiredAndMustBeAUuid() throws Exception {
        String token = token(newUser(Role.ADMIN));
        UUID question = newQuestion(newUser(Role.FARMER), false);

        invite(token, question, "{}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        invite(token, question, "{\"agrochemistId\":null}").andExpect(status().isBadRequest());
        invite(token, question, "{\"agrochemistId\":\"not-a-uuid\"}").andExpect(status().isBadRequest());
    }

    @Test
    void anInvitationIsAcceptedAndRepeatingItKeepsTheFirstTime() throws Exception {
        String token = token(newUser(Role.ADMIN));
        UUID question = newQuestion(newUser(Role.FARMER), false);
        UUID agrochemist = agrochemist("approved");

        String first = invite(token, question, body(agrochemist)).andExpect(status().isOk())
                .andExpect(jsonPath("$.questionId").value(question.toString()))
                .andExpect(jsonPath("$.agrochemist.id").value(agrochemist.toString()))
                .andExpect(jsonPath("$.agrochemist.name").isNotEmpty())
                .andExpect(jsonPath("$.invitedAt").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        String again = invite(token, question, body(agrochemist)).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsString();
        assertThat(again).isEqualTo(first);
    }

    @Test
    void unknownTargetsAndUnverifiedAgrochemistsAreRefused() throws Exception {
        String token = token(newUser(Role.ADMIN));
        UUID author = newUser(Role.FARMER);
        UUID question = newQuestion(author, false);

        invite(token, UUID.randomUUID(), body(agrochemist("approved"))).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("question_not_found"));
        invite(token, newQuestion(author, true), body(agrochemist("approved"))).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("question_not_found"));
        invite(token, question, body(author)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("agrochemist_not_found"));
        invite(token, question, body(agrochemist("pending"))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("agrochemist_not_verified"));
    }
}
