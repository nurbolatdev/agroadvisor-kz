package kz.agroadvisor.diagnosis.web;

import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
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

    private User farmer;
    private String token;

    @BeforeEach
    void signIn() {
        farmer = newUser();
        token = "Bearer " + jwt.issueAccessToken(farmer.getId());
        when(photos.store(any(UUID.class), any(byte[].class), anyString())).thenReturn("diagnoses/test/photo.jpg");
    }

    private User newUser() {
        String phone = "+7705" + (1_000_000 + (int) (Math.random() * 8_999_999));
        return users.saveAndFlush(new User(Login.parse(phone), "x", "Farmer", "ru", Set.of(Role.FARMER)));
    }

    private static MockMultipartFile image(String type) {
        return new MockMultipartFile("image", "leaf.jpg", type, new byte[] {1, 2, 3});
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
        verify(photos).store(eq(farmer.getId()), any(byte[].class), eq("image/jpeg"));
    }

    @Test
    void rejectsACropTheModelDoesNotSupport() throws Exception {
        mvc.perform(multipart("/api/diagnoses").file(image("image/jpeg")).param("crop", "banana")
                        .header("Authorization", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("unknown_crop"));
        verify(photos, never()).store(any(UUID.class), any(byte[].class), anyString());
    }

    @Test
    void rejectsAFileThatIsNotAnImage() throws Exception {
        mvc.perform(multipart("/api/diagnoses").file(image("text/plain")).param("crop", "tomato")
                        .header("Authorization", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_image"));
    }

    @Test
    void rejectsARequestWithoutAPhoto() throws Exception {
        mvc.perform(multipart("/api/diagnoses").param("crop", "tomato").header("Authorization", token))
                .andExpect(status().isBadRequest());
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
