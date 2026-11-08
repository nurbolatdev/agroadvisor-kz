package kz.agroadvisor.diagnosis.web;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.diagnosis.service.ModelInfo;
import kz.agroadvisor.diagnosis.service.ModelInfoService;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class MetaControllerTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;
    // the keeping of the answer is tested in ModelInfoServiceTest; here the HTTP side is
    @MockitoBean
    private ModelInfoService models;

    private UUID userId;
    private String token;

    @BeforeEach
    void setUp() {
        String phone = "+7705" + (1_000_000 + (int) (Math.random() * 8_999_999));
        userId = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER))).getId();
        token = "Bearer " + jwt.issueAccessToken(userId);
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM users WHERE id = ?", userId);
    }

    @Test
    void requiresSignIn() throws Exception {
        mvc.perform(get("/api/meta")).andExpect(status().isUnauthorized());
    }

    @Test
    void tellsTheModelVersionAndTheClassesVersionToASignedInUser() throws Exception {
        when(models.current()).thenReturn(new ModelInfo("effnet-b0-v1", 1, true));

        mvc.perform(get("/api/meta").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modelVersion").value("effnet-b0-v1"))
                .andExpect(jsonPath("$.classesVersion").value(1))
                // only what the app shows: nothing about calibration or the AI service itself
                .andExpect(jsonPath("$.calibrated").doesNotExist());
    }

    @Test
    void answers503AiUnavailableWhenTheAiServiceCannotSay() throws Exception {
        when(models.current()).thenThrow(
                new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ai_unavailable", "The recognition service is down"));

        mvc.perform(get("/api/meta").header("Authorization", token))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("ai_unavailable"));
    }
}
