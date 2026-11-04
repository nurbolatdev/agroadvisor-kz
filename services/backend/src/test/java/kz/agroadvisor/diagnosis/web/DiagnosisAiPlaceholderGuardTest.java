package kz.agroadvisor.diagnosis.web;

import static kz.agroadvisor.diagnosis.web.FakeAiService.TOMATO_SEPTORIA;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;
import kz.agroadvisor.diagnosis.service.PhotoStorage;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

/** The production setting: {@code app.ai.allow-placeholder=false} (the default outside local and test). */
@SpringBootTest(properties = {"app.ai.client=http", "app.ai.allow-placeholder=false"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DiagnosisAiPlaceholderGuardTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF,
        (byte) 0xD9};
    private static final FakeAiService AI = new FakeAiService();

    @AfterAll
    static void stopFakeAiService() {
        AI.stop();
    }

    @DynamicPropertySource
    static void aiUrl(DynamicPropertyRegistry registry) {
        registry.add("app.ai.url", AI::url);
    }

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private DiagnosisRepository diagnoses;
    @Autowired
    private JwtService jwt;
    @MockitoBean
    private PhotoStorage photos;

    private User farmer;
    private String token;

    @BeforeEach
    void signIn() {
        reset(photos);
        String phone = "+7709" + (1_000_000 + (int) (Math.random() * 8_999_999));
        farmer = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER)));
        token = "Bearer " + jwt.issueAccessToken(farmer.getId());
        when(photos.store(any(UUID.class), anyString(), any(byte[].class), anyString())).thenReturn("diagnoses/test/photo.jpg");
    }

    private org.springframework.test.web.servlet.ResultActions send() throws Exception {
        return mvc.perform(multipart("/api/diagnoses")
                .file(new MockMultipartFile("image", "leaf", "image/jpeg", JPEG))
                .param("crop", "tomato").header("Authorization", token));
    }

    @Test
    void aPlaceholderAnswerIsRefusedThePhotoIsDeletedAndNoDiagnosisIsSaved() throws Exception {
        AI.answers(200, TOMATO_SEPTORIA.replace("effnet-b0-v1", "placeholder-v0"));

        send().andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("ai_unavailable"));

        verify(photos).delete("diagnoses/test/photo.jpg");
        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10))).isEmpty();
    }

    @Test
    void aRealModelAnswerIsSavedAsUsual() throws Exception {
        AI.answers(200, TOMATO_SEPTORIA);

        send().andExpect(status().isCreated())
                .andExpect(jsonPath("$.modelVersion").value("effnet-b0-v1"))
                .andExpect(jsonPath("$.placeholder").value(false));
    }
}
