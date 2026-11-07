package kz.agroadvisor.users.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

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
class UserLanguageTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> created = new ArrayList<>();
    private UUID userId;
    private UUID otherId;
    private String token;

    @BeforeEach
    void setUp() {
        userId = newUser("ru");
        otherId = newUser("en");
        token = "Bearer " + jwt.issueAccessToken(userId);
    }

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(String language) {
        String phone = "+7705" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", language, Set.of(Role.FARMER)))
                .getId();
        created.add(id);
        return id;
    }

    private String languageInDatabase(UUID id) {
        return jdbc.queryForObject("SELECT language FROM users WHERE id = ?", String.class, id);
    }

    private ResultActions send(String json, String authorization) throws Exception {
        var request = patch("/api/users/me").contentType(MediaType.APPLICATION_JSON).content(json);
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return mvc.perform(request);
    }

    @Test
    void requiresSignIn() throws Exception {
        send("{\"language\":\"kk\"}", null).andExpect(status().isUnauthorized());
        assertThat(languageInDatabase(userId)).isEqualTo("ru");
    }

    @Test
    void savesTheLanguageAndAnswersWithTheWholeProfile() throws Exception {
        send("{\"language\":\"kk\"}", token)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.language").value("kk"))
                .andExpect(jsonPath("$.fullName").value("Farmer"))
                .andExpect(jsonPath("$.roles[0]").value("farmer"));

        assertThat(languageInDatabase(userId)).isEqualTo("kk");
        mvc.perform(get("/api/users/me").header("Authorization", token))
                .andExpect(jsonPath("$.language").value("kk"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"ru", "kk", "en"})
    void acceptsEachLanguageOfTheApp(String language) throws Exception {
        send("{\"language\":\"" + language + "\"}", token)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.language").value(language));
        assertThat(languageInDatabase(userId)).isEqualTo(language);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"language\":\"de\"}", "{\"language\":\"RU\"}", "{\"language\":\"\"}",
        "{\"language\":null}", "{}", "{\"language\":5}"})
    void refusesAnythingButRuKkEn(String json) throws Exception {
        send(json, token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        assertThat(languageInDatabase(userId)).isEqualTo("ru");
    }

    @Test
    void changesOnlyTheLanguageOfTheSignedInUser() throws Exception {
        send("{\"language\":\"kk\"}", token).andExpect(status().isOk());

        assertThat(languageInDatabase(otherId)).isEqualTo("en");
    }

    @Test
    void ignoresFieldsThatAreNotForTheClientToChange() throws Exception {
        // a person must not be able to give themselves a role, a name or an id through this call
        send("{\"language\":\"kk\",\"roles\":[\"admin\"],\"fullName\":\"Boss\",\"id\":\"" + otherId + "\"}", token)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.fullName").value("Farmer"))
                .andExpect(jsonPath("$.roles.length()").value(1))
                .andExpect(jsonPath("$.roles[0]").value("farmer"));
        assertThat(jdbc.queryForObject("SELECT full_name FROM users WHERE id = ?", String.class, userId))
                .isEqualTo("Farmer");
    }
}
