package kz.agroadvisor.notifications.web;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.hasKey;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class PushTokenControllerIntegrationTest {

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

    private UUID newUser(Role role) {
        String phone = "+7736" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Push " + phone, "ru", Set.of(role)))
                .getId();
        created.add(id);
        return id;
    }

    private String bearer(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private static String body(String token, String platform) {
        return "{\"token\":\"" + token + "\",\"platform\":\"" + platform + "\"}";
    }

    private static String uniqueToken() {
        return "tok-" + UUID.randomUUID();
    }

    private MvcResult register(UUID user, String token) throws Exception {
        return mvc.perform(put("/api/push-tokens").header("Authorization", bearer(user))
                .contentType(MediaType.APPLICATION_JSON).content(body(token, "android")))
                .andExpect(status().isOk()).andReturn();
    }

    private static String idOf(MvcResult result) throws Exception {
        return new ObjectMapper().readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    @Test
    void withoutATokenItIsUnauthorized() throws Exception {
        mvc.perform(put("/api/push-tokens").contentType(MediaType.APPLICATION_JSON)
                .content(body(uniqueToken(), "android"))).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/push-tokens/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
    }

    @Test
    void everyRoleCanRegisterAndTheTokenIsNotReturned() throws Exception {
        for (Role role : List.of(Role.FARMER, Role.AGROCHEMIST, Role.ADMIN)) {
            mvc.perform(put("/api/push-tokens").header("Authorization", bearer(newUser(role)))
                    .contentType(MediaType.APPLICATION_JSON).content(body(uniqueToken(), "expo")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").exists())
                    .andExpect(jsonPath("$.platform").value("expo"))
                    .andExpect(jsonPath("$.createdAt").exists())
                    .andExpect(jsonPath("$.updatedAt").exists())
                    .andExpect(jsonPath("$", not(hasKey("token"))));
        }
    }

    @Test
    void registeringTheSameTokenAgainKeepsTheId() throws Exception {
        UUID user = newUser(Role.FARMER);
        String token = uniqueToken();
        String first = idOf(register(user, token));
        String second = idOf(register(user, token));
        org.assertj.core.api.Assertions.assertThat(second).isEqualTo(first);
    }

    @Test
    void invalidBodiesAreRejected() throws Exception {
        String auth = bearer(newUser(Role.FARMER));
        List<String> bad = List.of(
                body(uniqueToken(), "web"),
                body("", "android"),
                body("has space", "android"),
                body("a".repeat(513), "android"),
                "{\"platform\":\"android\"}",
                "{\"token\":\"abc\"}");
        for (String json : bad) {
            mvc.perform(put("/api/push-tokens").header("Authorization", auth)
                    .contentType(MediaType.APPLICATION_JSON).content(json))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("validation_failed"));
        }
    }

    @Test
    void deleteRemovesOwnTokenOnce() throws Exception {
        UUID user = newUser(Role.FARMER);
        String id = idOf(register(user, uniqueToken()));
        mvc.perform(delete("/api/push-tokens/" + id).header("Authorization", bearer(user)))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/api/push-tokens/" + id).header("Authorization", bearer(user)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("push_token_not_found"));
    }

    @Test
    void anotherUsersTokenIsNotFound() throws Exception {
        UUID owner = newUser(Role.FARMER);
        UUID other = newUser(Role.FARMER);
        String id = idOf(register(owner, uniqueToken()));
        mvc.perform(delete("/api/push-tokens/" + id).header("Authorization", bearer(other)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("push_token_not_found"));
        mvc.perform(delete("/api/push-tokens/" + id).header("Authorization", bearer(owner)))
                .andExpect(status().isNoContent());
    }

    @Test
    void aNonUuidIdIsABadRequest() throws Exception {
        mvc.perform(delete("/api/push-tokens/abc").header("Authorization", bearer(newUser(Role.FARMER))))
                .andExpect(status().isBadRequest());
    }
}
