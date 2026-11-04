package kz.agroadvisor.diagnosis.web;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.diagnosis.model.ClassScore;
import kz.agroadvisor.diagnosis.model.Diagnosis;
import kz.agroadvisor.diagnosis.repository.DiagnosisRepository;
import kz.agroadvisor.diagnosis.service.AiClient;
import kz.agroadvisor.diagnosis.service.DiagnosisService;
import kz.agroadvisor.diagnosis.service.PhotoStorage;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DiagnosisControllerTest {

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
    @MockitoSpyBean
    private AiClient ai;

    private User farmer;
    private String token;

    @BeforeEach
    void signIn() {
        farmer = newUser();
        token = "Bearer " + jwt.issueAccessToken(farmer.getId());
        when(photos.store(any(UUID.class), anyString(), any(byte[].class), anyString())).thenReturn("diagnoses/test/photo.jpg");
    }

    private User newUser() {
        String phone = "+7705" + (1_000_000 + (int) (Math.random() * 8_999_999));
        return users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER)));
    }

    /** The rate limiter counts per wall-clock minute; a fixed clock keeps six requests in one window. */
    @TestConfiguration
    static class FixedClockConfig {

        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(Instant.now(), ZoneOffset.UTC);
        }
    }

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF,
        (byte) 0xD9};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0, 'I', 'E',
        'N', 'D', (byte) 0xAE, 0x42, 0x60, (byte) 0x82};

    /** A JPEG or PNG file (by its bytes); the type the client declares may differ. */
    private static MockMultipartFile image(String declaredType) {
        return new MockMultipartFile("image", "leaf", declaredType, "image/png".equals(declaredType) ? PNG : JPEG);
    }

    @Test
    void requiresSignIn() throws Exception {
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/diagnoses")).andExpect(status().isUnauthorized());
    }

    @Test
    void recognizesThePhotoAndKeepsTheResultInTheHistory() throws Exception {
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.crop").value("tomato"))
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.top1.code").value("tomato__healthy"))
                .andExpect(jsonPath("$.modelVersion").value("placeholder-v0"))
                .andExpect(jsonPath("$.placeholder").value(true))
                .andExpect(jsonPath("$.descriptionReady").value(true))
                .andExpect(jsonPath("$.createdAt").isNotEmpty());

        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10)))
                .singleElement().satisfies(d -> {
                    assertThat(d.getPhotoKey()).isEqualTo("diagnoses/test/photo.jpg");
                    assertThat(d.getTop1Code()).isEqualTo("tomato__healthy");
                });
        verify(photos).store(eq(farmer.getId()), anyString(), any(byte[].class), eq("image/jpeg"));
    }

    @Test
    void rejectsACropTheModelDoesNotSupport() throws Exception {
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "banana")
                        .header("Authorization", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("unknown_crop"));
        verify(photos, never()).store(any(UUID.class), anyString(), any(byte[].class), anyString());
    }

    @Test
    void rejectsAFileThatIsNotAnImageWhateverTheClientDeclares() throws Exception {
        MockMultipartFile text = new MockMultipartFile("image", "leaf.jpg", "image/jpeg", "hello".getBytes());

        mvc.perform(multipart("/api/diagnoses").file(text).param("crop", "tomato").header("Authorization", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_image"));
        verify(photos, never()).store(any(UUID.class), anyString(), any(byte[].class), anyString());
    }

    @Test
    void acceptsAPhotoWhoseDeclaredTypeIsTheNonStandardImageJpg() throws Exception {
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpg")).param("crop", "tomato")
                        .header("Authorization", token))
                .andExpect(status().isCreated());
        verify(photos).store(eq(farmer.getId()), anyString(), any(byte[].class), eq("image/jpeg"));
    }

    @Test
    void rejectsARequestWithoutAPhoto() throws Exception {
        mvc.perform(multipart("/api/diagnoses").param("crop", "tomato").header("Authorization", token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aRepeatedIdempotencyKeyReturnsTheSameDiagnosisAndStoresOnePhoto() throws Exception {
        String key = UUID.randomUUID().toString();
        String first = mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", token).header("Idempotency-Key", key))
                .andExpect(status().isCreated())
                .andExpect(header().doesNotExist("Idempotent-Replayed"))
                .andReturn().getResponse().getContentAsString();

        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", token).header("Idempotency-Key", key))
                .andExpect(status().isCreated())
                .andExpect(header().string("Idempotent-Replayed", "true"))
                .andExpect(content().json(first));

        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10))).hasSize(1);
        verify(photos, times(1)).store(eq(farmer.getId()), anyString(), any(byte[].class), anyString());
    }

    /**
     * The real race: another request with the same key commits its row while this one is in the model call.
     * The unique index rejects this request's insert; it must return the winner's row and delete nothing.
     */
    @Test
    void aRequestThatLosesTheRaceOnTheKeyReturnsTheWinnersDiagnosis() throws Exception {
        String key = UUID.randomUUID().toString();
        doAnswer(call -> {
            diagnoses.saveAndFlush(new Diagnosis(farmer.getId(), "tomato", "diagnoses/test/winner.jpg", "ok",
                    "tomato__healthy", new BigDecimal("0.9000"), List.of(new ClassScore("tomato__healthy", 0.9)),
                    null, "placeholder-v0", 1, 5, key, DiagnosisService.fingerprint(JPEG)));
            return call.callRealMethod();
        }).when(ai).predict(eq("tomato"), any(byte[].class));

        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", token).header("Idempotency-Key", key))
                .andExpect(status().isCreated())
                .andExpect(header().string("Idempotent-Replayed", "true"));

        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10)))
                .singleElement().satisfies(d -> assertThat(d.getPhotoKey()).isEqualTo("diagnoses/test/winner.jpg"));
        // With a key both requests use one object name, so the loser must not remove anything
        verify(photos, never()).delete(anyString());
    }

    @Test
    void theSameKeyOfAnotherUserIsAnotherDiagnosis() throws Exception {
        String key = UUID.randomUUID().toString();
        User other = newUser();
        String otherToken = "Bearer " + jwt.issueAccessToken(other.getId());

        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                .header("Authorization", token).header("Idempotency-Key", key)).andExpect(status().isCreated());
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", otherToken).header("Idempotency-Key", key))
                .andExpect(status().isCreated())
                .andExpect(header().doesNotExist("Idempotent-Replayed"));

        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(other.getId(), PageRequest.of(0, 10))).hasSize(1);
    }

    @Test
    void theKeyIsOptional() throws Exception {
        for (int i = 0; i < 2; i++) {
            mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                    .header("Authorization", token)).andExpect(status().isCreated());
        }

        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10))).hasSize(2);
    }

    @Test
    void aKeyUsedForAnotherCropIsRefused() throws Exception {
        String key = UUID.randomUUID().toString();
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                .header("Authorization", token).header("Idempotency-Key", key)).andExpect(status().isCreated());

        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "potato")
                        .header("Authorization", token).header("Idempotency-Key", key))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("idempotency_key_reused"))
                .andExpect(jsonPath("$.reason").value("crop"));
    }

    @Test
    void aKeyUsedForAnotherPhotoOfTheSameCropIsRefused() throws Exception {
        String key = UUID.randomUUID().toString();
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                .header("Authorization", token).header("Idempotency-Key", key)).andExpect(status().isCreated());

        mvc.perform(multipart("/api/diagnoses").file(image("image/png")).param("crop", "tomato")
                        .header("Authorization", token).header("Idempotency-Key", key))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("idempotency_key_reused"))
                .andExpect(jsonPath("$.reason").value("photo"));
        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10))).hasSize(1);
        verify(photos, times(1)).store(eq(farmer.getId()), anyString(), any(byte[].class), anyString());
    }

    @Test
    void aMalformedKeyIsABadRequest() throws Exception {
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", token).header("Idempotency-Key", "bad key"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_idempotency_key"));
        verify(photos, never()).store(any(UUID.class), anyString(), any(byte[].class), anyString());
    }

    @Test
    void historyHoldsOnlyTheCallersDiagnosesNewestFirst() throws Exception {
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                .header("Authorization", token)).andExpect(status().isCreated());
        mvc.perform(multipart("/api/diagnoses").file(image("image/png")).param("crop", "potato")
                .header("Authorization", token)).andExpect(status().isCreated());
        String otherToken = "Bearer " + jwt.issueAccessToken(newUser().getId());
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "wheat")
                .header("Authorization", otherToken)).andExpect(status().isCreated());

        mvc.perform(get("/api/diagnoses").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].crop").value("potato"))
                .andExpect(jsonPath("$[1].crop").value("tomato"));
    }

    /** Creates a diagnosis through the API as the given token and returns its id. */
    private String createDiagnosis(String bearer) throws Exception {
        String body = mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", bearer))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.photoUrl").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(body, "$.id");
    }

    @Test
    void theOwnerReadsADiagnosisByIdWithThePhotoUrl() throws Exception {
        String id = createDiagnosis(token);

        mvc.perform(get("/api/diagnoses/" + id).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.top1.code").value("tomato__healthy"))
                .andExpect(jsonPath("$.photoUrl").value("/api/diagnoses/" + id + "/photo"));
    }

    @Test
    void anotherUsersAndAMissingDiagnosisGiveTheSame404() throws Exception {
        String id = createDiagnosis(token);
        String stranger = "Bearer " + jwt.issueAccessToken(newUser().getId());

        String foreign = mvc.perform(get("/api/diagnoses/" + id).header("Authorization", stranger))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("diagnosis_not_found"))
                .andReturn().getResponse().getContentAsString();
        String missing = mvc.perform(get("/api/diagnoses/" + UUID.randomUUID()).header("Authorization", stranger))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("diagnosis_not_found"))
                .andReturn().getResponse().getContentAsString();
        // Same body apart from the request-specific fields: nothing tells a foreign id from a missing one
        assertThat(com.jayway.jsonpath.JsonPath.<String>read(foreign, "$.detail"))
                .isEqualTo(com.jayway.jsonpath.JsonPath.<String>read(missing, "$.detail"));
        mvc.perform(get("/api/diagnoses/" + id + "/photo").header("Authorization", stranger))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("diagnosis_not_found"));
    }

    @Test
    void readingByIdRequiresSignIn() throws Exception {
        mvc.perform(get("/api/diagnoses/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/diagnoses/" + UUID.randomUUID() + "/photo")).andExpect(status().isUnauthorized());
    }

    @Test
    void theOwnerGetsThePhotoBytesWithCacheHeaders() throws Exception {
        String id = createDiagnosis(token);
        when(photos.load("diagnoses/test/photo.jpg")).thenReturn(java.util.Optional.of(JPEG));

        mvc.perform(get("/api/diagnoses/" + id + "/photo").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/jpeg"))
                .andExpect(content().bytes(JPEG))
                .andExpect(header().string("Cache-Control", "max-age=31536000, private, immutable"))
                .andExpect(header().string("ETag", "\"diagnoses/test/photo.jpg\""))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    void aPhotoMissingFromTheStorageIs404PhotoNotFound() throws Exception {
        String id = createDiagnosis(token);
        when(photos.load(anyString())).thenReturn(java.util.Optional.empty());

        mvc.perform(get("/api/diagnoses/" + id + "/photo").header("Authorization", token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("photo_not_found"));
    }

    @Test
    void historyIsPaged() throws Exception {
        for (int i = 0; i < 3; i++) {
            mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                    .header("Authorization", token)).andExpect(status().isCreated());
        }

        mvc.perform(get("/api/diagnoses").param("page", "1").param("size", "2").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/diagnoses").param("size", "1000").header("Authorization", token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aRepeatWithTheSameKeyStillWorksWhenTheLimitIsUsedUp() throws Exception {
        String key = UUID.randomUUID().toString();
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                .header("Authorization", token).header("Idempotency-Key", key)).andExpect(status().isCreated());
        for (int i = 0; i < 4; i++) {
            mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                    .header("Authorization", token)).andExpect(status().isCreated());
        }
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", token))
                .andExpect(status().isTooManyRequests());

        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", token).header("Idempotency-Key", key))
                .andExpect(status().isCreated())
                .andExpect(header().string("Idempotent-Replayed", "true"));
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", token).header("Idempotency-Key", UUID.randomUUID().toString()))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10))).hasSize(5);
    }

    @Test
    void aRejectedRequestStillSpendsATokenOfTheLimit() throws Exception {
        for (int i = 0; i < 5; i++) {
            mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "banana")
                            .header("Authorization", token))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("unknown_crop"));
        }

        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", token))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10))).isEmpty();
    }

    @Test
    void theSixthPhotoWithinAMinuteIsRefused() throws Exception {
        for (int i = 0; i < 5; i++) {
            mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                    .header("Authorization", token)).andExpect(status().isCreated());
        }

        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "tomato")
                        .header("Authorization", token))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
        assertThat(diagnoses.findByUserIdOrderByCreatedAtDesc(farmer.getId(), PageRequest.of(0, 10))).hasSize(5);
    }
}
