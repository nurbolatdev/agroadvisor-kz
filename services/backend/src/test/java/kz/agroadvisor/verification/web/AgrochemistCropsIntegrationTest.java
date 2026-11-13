package kz.agroadvisor.verification.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

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
class AgrochemistCropsIntegrationTest {

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

    private UUID newUser(Role role, boolean withProfile) {
        String phone = "+7722" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Test User", "ru", Set.of(role))).getId();
        created.add(id);
        if (withProfile) {
            jdbc.update("INSERT INTO agrochemist_profiles (user_id) VALUES (?)", id);
        }
        return id;
    }

    private String token(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private ResultActions put(String token, String body) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.put("/api/agrochemist/crops").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void anonymousIsRefused() throws Exception {
        mvc.perform(get("/api/agrochemist/crops")).andExpect(status().isUnauthorized());
        mvc.perform(MockMvcRequestBuilders.put("/api/agrochemist/crops").contentType(MediaType.APPLICATION_JSON)
                .content("{\"crops\":[\"potato\"]}")).andExpect(status().isUnauthorized());
    }

    @Test
    void aFarmerIsRefused() throws Exception {
        String farmer = token(newUser(Role.FARMER, false));
        mvc.perform(get("/api/agrochemist/crops").header("Authorization", farmer))
                .andExpect(status().isForbidden());
        put(farmer, "{\"crops\":[\"potato\"]}").andExpect(status().isForbidden());
    }

    @Test
    void aNewAgrochemistHasNoCrops() throws Exception {
        String token = token(newUser(Role.AGROCHEMIST, true));
        mvc.perform(get("/api/agrochemist/crops").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.crops").isEmpty());
    }

    @Test
    void putReplacesTheWholeSetInAlphabeticalOrder() throws Exception {
        // The profile of a new agrochemist is pending: the crops can be set before the check
        String token = token(newUser(Role.AGROCHEMIST, true));

        put(token, "{\"crops\":[\"wheat\",\"potato\"]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.crops.length()").value(2))
                .andExpect(jsonPath("$.crops[0]").value("potato"))
                .andExpect(jsonPath("$.crops[1]").value("wheat"));

        put(token, "{\"crops\":[\"tomato\",\"potato\"]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.crops.length()").value(2))
                .andExpect(jsonPath("$.crops[0]").value("potato"))
                .andExpect(jsonPath("$.crops[1]").value("tomato"));

        mvc.perform(get("/api/agrochemist/crops").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.crops.length()").value(2))
                .andExpect(jsonPath("$.crops[0]").value("potato"))
                .andExpect(jsonPath("$.crops[1]").value("tomato"));
    }

    @Test
    void anEmptySetIsRefused() throws Exception {
        String token = token(newUser(Role.AGROCHEMIST, true));
        put(token, "{\"crops\":[]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        put(token, "{}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void aRepeatedCropIsRefused() throws Exception {
        String token = token(newUser(Role.AGROCHEMIST, true));
        put(token, "{\"crops\":[\"potato\",\"potato\"]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void anUnknownCropIsRefusedAndKeepsTheOldSet() throws Exception {
        String token = token(newUser(Role.AGROCHEMIST, true));
        put(token, "{\"crops\":[\"potato\"]}").andExpect(status().isOk());

        put(token, "{\"crops\":[\"tomato\",\"banana\"]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("unknown_crop"));

        mvc.perform(get("/api/agrochemist/crops").header("Authorization", token))
                .andExpect(jsonPath("$.crops.length()").value(1))
                .andExpect(jsonPath("$.crops[0]").value("potato"));
    }

    @Test
    void anAgrochemistWithoutProfileGetsConflict() throws Exception {
        String token = token(newUser(Role.AGROCHEMIST, false));
        put(token, "{\"crops\":[\"potato\"]}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("agrochemist_profile_missing"));
    }
}
