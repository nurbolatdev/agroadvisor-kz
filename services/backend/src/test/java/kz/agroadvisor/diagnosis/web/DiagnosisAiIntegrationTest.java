package kz.agroadvisor.diagnosis.web;

import static kz.agroadvisor.diagnosis.web.FakeAiService.TOMATO_SEPTORIA;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.test.web.servlet.ResultActions;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;
import kz.agroadvisor.diagnosis.service.PhotoStorage;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

/**
 * The whole backend path with the real {@code HttpAiClient}: request, photo storage (faked), a fake AI
 * service that speaks the contract, saved diagnosis, history. The model itself is exercised by
 * services/ai-service; here the AI answers are canned. The placeholder model is allowed here
 * (the test profile); {@link DiagnosisAiPlaceholderGuardTest} covers the production setting.
 */
@SpringBootTest(properties = "app.ai.client=http")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DiagnosisAiIntegrationTest {

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
        String phone = "+7706" + (1_000_000 + (int) (Math.random() * 8_999_999));
        farmer = users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER)));
        token = "Bearer " + jwt.issueAccessToken(farmer.getId());
        when(photos.store(any(UUID.class), anyString(), any(byte[].class), anyString())).thenReturn("diagnoses/test/photo.jpg");
    }

    private ResultActions send(String crop) throws Exception {
        return mvc.perform(multipart("/api/diagnoses")
                .file(new MockMultipartFile("image", "leaf", "image/jpeg", JPEG))
                .param("crop", crop).header("Authorization", token));
    }

    private void nothingIsKept() {
        verify(photos, never()).store(any(UUID.class), anyString(), any(byte[].class), anyString());
        verify(photos, never()).delete(anyString());
        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10))).isEmpty();
    }

    @Test
    void aPhotoOfATomatoGetsTheModelsDiagnosisAndItShowsInTheHistory() throws Exception {
        AI.answers(200, TOMATO_SEPTORIA);

        send("tomato")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.top1.code").value("tomato__septoria_leaf_spot"))
                .andExpect(jsonPath("$.top1.confidence").value(0.8599))
                .andExpect(jsonPath("$.top3.length()").value(3))
                .andExpect(jsonPath("$.modelVersion").value("effnet-b0-v1"))
                .andExpect(jsonPath("$.placeholder").value(false));

        mvc.perform(get("/api/diagnoses").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].top1.code").value("tomato__septoria_leaf_spot"))
                .andExpect(jsonPath("$[0].modelVersion").value("effnet-b0-v1"));
        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10)))
                .singleElement().satisfies(d -> {
                    assertThat(d.getInferenceMs()).isEqualTo(47);
                    assertThat(d.getModelVersion()).isEqualTo("effnet-b0-v1");
                });
    }

    @Test
    void anUnknownAnswerIsSavedWithItsStatusAsTheSourceOfTruth() throws Exception {
        AI.answers(200, """
                {"status": "unknown", "crop": "wheat",
                 "top1": {"code": "wheat__leaf_rust", "confidence": 0.21},
                 "top3": [{"code": "wheat__leaf_rust", "confidence": 0.21},
                          {"code": "wheat__septoria", "confidence": 0.19}],
                 "detected_crop": null, "model_version": "effnet-b0-v1", "classes_version": 1, "inference_ms": 83}""");

        send("wheat")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("unknown"))
                .andExpect(jsonPath("$.top1.code").value("wheat__leaf_rust"));
    }

    @Test
    void aPlaceholderAnswerIsSavedAndMarkedWhenThePlaceholderIsAllowed() throws Exception {
        AI.answers(200, TOMATO_SEPTORIA.replace("effnet-b0-v1", "placeholder-v0"));

        send("tomato")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.modelVersion").value("placeholder-v0"))
                .andExpect(jsonPath("$.placeholder").value(true));
        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10))).hasSize(1);
    }

    @Test
    void aPhotoTheServiceRejectsForQualityIsAnswered422WithTheReasonAndNothingIsKept() throws Exception {
        AI.answers(422, "{\"error\": \"low_quality\", \"reason\": \"dark\", \"message\": \"Photo is too dark\"}");

        send("tomato")
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("low_quality"))
                .andExpect(jsonPath("$.reason").value("dark"))
                .andExpect(jsonPath("$.detail").value("The photo is too dark, retake it in better light"));

        nothingIsKept();
    }

    @Test
    void anAnswerWithoutAReasonCarriesNoReasonProperty() throws Exception {
        AI.answers(503, "{\"error\": \"model_not_loaded\", \"reason\": null, \"message\": \"x\"}");

        send("tomato")
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("ai_unavailable"))
                .andExpect(jsonPath("$.reason").doesNotExist());

        nothingIsKept();
    }

    @Test
    void aFaultOfTheServiceIsAnswered502NotARawServerError() throws Exception {
        AI.answers(500, "{\"error\": \"internal_error\", \"reason\": null, \"message\": \"x\"}");

        send("tomato")
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("ai_error"));

        nothingIsKept();
    }

    @Test
    void aCropTheReferenceDoesNotKnowNeverReachesTheService() throws Exception {
        AI.answers(200, TOMATO_SEPTORIA);

        send("banana").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("unknown_crop"));

        verify(photos, never()).store(eq(farmer.getId()), anyString(), any(byte[].class), anyString());
        assertThat(AI.predictCalls()).isZero();
    }
}
