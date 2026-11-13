package kz.agroadvisor.consultations.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

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
class ConsultationMessageControllerIntegrationTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> created = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role, String verification) {
        String phone = "+7725" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Chat " + phone, "ru", Set.of(role)))
                .getId();
        created.add(id);
        if (verification != null) {
            jdbc.update("""
                    INSERT INTO agrochemist_profiles (user_id, specialization, experience_years,
                                                      verification_status)
                    VALUES (?, 'plant_protection', 4, ?)""", id, verification);
        }
        return id;
    }

    private String token(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private record Chat(UUID id, UUID farmer, UUID agrochemist, String farmerToken, String agrochemistToken) {
    }

    private Chat activeChat() throws Exception {
        UUID farmer = newUser(Role.FARMER, null);
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String farmerToken = token(farmer);
        String agrochemistToken = token(agrochemist);
        String location = mvc.perform(post("/api/consultations").header("Authorization", farmerToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"agrochemistId\": \"" + agrochemist + "\", \"text\": \"Help\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getHeader("Location");
        UUID id = UUID.fromString(location.substring(location.lastIndexOf('/') + 1));
        mvc.perform(post("/api/consultations/" + id + "/accept").header("Authorization", agrochemistToken))
                .andExpect(status().isOk());
        return new Chat(id, farmer, agrochemist, farmerToken, agrochemistToken);
    }

    private ResultActions send(String token, UUID id, String body) throws Exception {
        return mvc.perform(post("/api/consultations/" + id + "/messages").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private UUID sendText(String token, UUID id, String text) throws Exception {
        String response = send(token, id, "{\"text\": \"" + text + "\"}").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.<String>read(response, "$.id"));
    }

    private ResultActions read(String token, UUID id, UUID upTo) throws Exception {
        return mvc.perform(post("/api/consultations/" + id + "/read").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"upTo\": \"" + upTo + "\"}"));
    }

    private ResultActions history(String token, UUID id, String query) throws Exception {
        return mvc.perform(get("/api/consultations/" + id + "/messages" + query).header("Authorization", token));
    }

    @Test
    void anonymousAndAdminAreRefused() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(get("/api/consultations/" + id + "/messages")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/consultations/" + id + "/messages").contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\": \"x\"}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/consultations/" + id + "/read")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/consultations/unread-count")).andExpect(status().isUnauthorized());

        String admin = token(newUser(Role.ADMIN, null));
        history(admin, id, "").andExpect(status().isForbidden());
        send(admin, id, "{\"text\": \"x\"}").andExpect(status().isForbidden());
        mvc.perform(get("/api/consultations/unread-count").header("Authorization", admin))
                .andExpect(status().isForbidden());
    }

    @Test
    void theRecipientSeesUnreadThenReadAndTheSenderSeesReadAt() throws Exception {
        Chat chat = activeChat();
        UUID sent = sendText(chat.farmerToken, chat.id, "Leaves turn yellow");

        mvc.perform(get("/api/consultations/" + chat.id).header("Authorization", chat.agrochemistToken))
                .andExpect(jsonPath("$.unreadCount").value(2));
        mvc.perform(get("/api/consultations/unread-count").header("Authorization", chat.agrochemistToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(2));
        history(chat.farmerToken, chat.id, "").andExpect(jsonPath("$[0].id").value(sent.toString()))
                .andExpect(jsonPath("$[0].readAt").doesNotExist());

        read(chat.agrochemistToken, chat.id, sent).andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(0));
        // Repeating it is fine
        read(chat.agrochemistToken, chat.id, sent).andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(0));

        mvc.perform(get("/api/consultations/" + chat.id).header("Authorization", chat.agrochemistToken))
                .andExpect(jsonPath("$.unreadCount").value(0));
        mvc.perform(get("/api/consultations/unread-count").header("Authorization", chat.agrochemistToken))
                .andExpect(jsonPath("$.count").value(0));
        history(chat.farmerToken, chat.id, "").andExpect(jsonPath("$[0].readAt").isNotEmpty())
                .andExpect(jsonPath("$[0].text").value("Leaves turn yellow"))
                .andExpect(jsonPath("$[0].senderId").value(chat.farmer.toString()))
                .andExpect(jsonPath("$[0].photoUrl").doesNotExist());
    }

    @Test
    void aStrangerGetsNotFoundOnEveryOperation() throws Exception {
        Chat chat = activeChat();
        UUID message = sendText(chat.farmerToken, chat.id, "Hi");
        String strangerFarmer = token(newUser(Role.FARMER, null));
        String strangerAgrochemist = token(newUser(Role.AGROCHEMIST, "approved"));

        for (String stranger : List.of(strangerFarmer, strangerAgrochemist)) {
            send(stranger, chat.id, "{\"text\": \"Hello\"}").andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("consultation_not_found"));
            history(stranger, chat.id, "").andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("consultation_not_found"));
            read(stranger, chat.id, message).andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("consultation_not_found"));
        }
        history(chat.farmerToken, UUID.randomUUID(), "").andExpect(status().isNotFound());
    }

    @Test
    void sendingIsRefusedOutsideAnActiveConsultation() throws Exception {
        UUID farmer = newUser(Role.FARMER, null);
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String farmerToken = token(farmer);
        String location = mvc.perform(post("/api/consultations").header("Authorization", farmerToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"agrochemistId\": \"" + agrochemist + "\", \"text\": \"Help\"}"))
                .andReturn().getResponse().getHeader("Location");
        UUID id = UUID.fromString(location.substring(location.lastIndexOf('/') + 1));

        send(farmerToken, id, "{\"text\": \"More\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("invalid_consultation_state"))
                .andExpect(jsonPath("$.reason").value("requested"));
    }

    @Test
    void textIsValidated() throws Exception {
        Chat chat = activeChat();

        send(chat.farmerToken, chat.id, "{\"text\": \"" + "x".repeat(2001) + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        send(chat.farmerToken, chat.id, "{\"text\": \"   \"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        send(chat.farmerToken, chat.id, "{}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        send(chat.farmerToken, chat.id, "{\"text\": \"" + "x".repeat(2000) + "\"}").andExpect(status().isCreated());
    }

    @Test
    void historyPagesInBothDirectionsWithLimitBounds() throws Exception {
        Chat chat = activeChat();
        UUID m1 = sendText(chat.agrochemistToken, chat.id, "one");
        UUID m2 = sendText(chat.farmerToken, chat.id, "two");
        UUID m3 = sendText(chat.agrochemistToken, chat.id, "three");

        // Newest first, the request text ("Help") is the oldest
        history(chat.farmerToken, chat.id, "?limit=2").andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].id").value(m3.toString()))
                .andExpect(jsonPath("$[1].id").value(m2.toString()));
        history(chat.farmerToken, chat.id, "?before=" + m2 + "&limit=5")
                .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].id").value(m1.toString()))
                .andExpect(jsonPath("$[1].text").value("Help"));
        // Oldest first after a cursor
        history(chat.farmerToken, chat.id, "?after=" + m1).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(m2.toString()))
                .andExpect(jsonPath("$[1].id").value(m3.toString()));
        history(chat.farmerToken, chat.id, "?after=" + m3).andExpect(jsonPath("$.length()").value(0));

        history(chat.farmerToken, chat.id, "").andExpect(jsonPath("$.length()").value(4));
        history(chat.farmerToken, chat.id, "?limit=1").andExpect(jsonPath("$.length()").value(1));
        history(chat.farmerToken, chat.id, "?limit=100").andExpect(status().isOk());
        for (String bad : List.of("?limit=0", "?limit=101", "?limit=-1")) {
            history(chat.farmerToken, chat.id, bad).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("validation_failed"));
        }
        history(chat.farmerToken, chat.id, "?before=" + m1 + "&after=" + m1).andExpect(status().isBadRequest());
        history(chat.farmerToken, chat.id, "?before=nope").andExpect(status().isBadRequest());
    }

    @Test
    void aCursorOfAnotherConsultationIsNotFound() throws Exception {
        Chat chat = activeChat();
        Chat other = activeChat();
        UUID foreign = sendText(other.farmerToken, other.id, "Elsewhere");

        history(chat.farmerToken, chat.id, "?before=" + foreign).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("message_not_found"));
        history(chat.farmerToken, chat.id, "?after=" + foreign).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("message_not_found"));
        read(chat.farmerToken, chat.id, foreign).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("message_not_found"));
        mvc.perform(post("/api/consultations/" + chat.id + "/read").header("Authorization", chat.farmerToken)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
    }

    @Test
    void theThirtyFirstMessageInAMinuteIsRateLimited() throws Exception {
        Chat chat = activeChat();
        for (int i = 0; i < 30; i++) {
            sendText(chat.farmerToken, chat.id, "m" + i);
        }

        send(chat.farmerToken, chat.id, "{\"text\": \"one more\"}").andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
    }
}
