package kz.agroadvisor.consultations.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.consultations.service.ConsultationPhotoStorage;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ConsultationPhotoIntegrationTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF,
        (byte) 0xD9};
    /** SOI, an APP1 segment with GPS text, then an empty DQT and EOI: what a phone camera would add. */
    private static final byte[] JPEG_WITH_GPS = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE1, 0, 12, 'E', 'x',
        'i', 'f', 0, 0, 'G', 'P', 'S', '!', (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF, (byte) 0xD9};

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @MockitoBean
    private ConsultationPhotoStorage storage;

    private final List<UUID> created = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role, String verification) {
        String phone = "+7726" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Photo " + phone, "ru", Set.of(role)))
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

    private record Chat(UUID id, String farmerToken, String agrochemistToken) {
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
        return new Chat(id, farmerToken, agrochemistToken);
    }

    private ResultActions sendPhoto(String token, UUID id, byte[] bytes, String text) throws Exception {
        var request = multipart("/api/consultations/" + id + "/messages/photo")
                .file(new MockMultipartFile("image", "leaf.jpg", "image/jpeg", bytes))
                .header("Authorization", token);
        if (text != null) {
            request.param("text", text);
        }
        return mvc.perform(request);
    }

    @Test
    void aPhotoIsStrippedStoredUnderItsPrefixAndServedToBothSides() throws Exception {
        Chat chat = activeChat();
        when(storage.store(eq(chat.id), any(), anyString())).thenReturn("consultations/" + chat.id + "/a.jpg");
        when(storage.load("consultations/" + chat.id + "/a.jpg")).thenReturn(JPEG);

        String body = sendPhoto(chat.farmerToken, chat.id, JPEG_WITH_GPS, "  See this  ")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.text").value("See this"))
                .andReturn().getResponse().getContentAsString();

        ArgumentCaptor<byte[]> stored = ArgumentCaptor.forClass(byte[].class);
        verify(storage).store(eq(chat.id), stored.capture(), eq("image/jpeg"));
        assertThat(stored.getValue()).isEqualTo(JPEG);
        assertThat(new String(stored.getValue(), StandardCharsets.ISO_8859_1)).doesNotContain("GPS");
        String photoUrl = JsonPath.read(body, "$.photoUrl");
        assertThat(photoUrl).isEqualTo("/api/consultations/" + chat.id + "/messages/"
                + JsonPath.<String>read(body, "$.id") + "/photo");

        String etag = mvc.perform(get(photoUrl).header("Authorization", chat.agrochemistToken))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", "max-age=31536000, private, immutable"))
                .andReturn().getResponse().getHeader("ETag");
        mvc.perform(get(photoUrl).header("Authorization", chat.farmerToken).header("If-None-Match", etag))
                .andExpect(status().isNotModified());
    }

    @Test
    void aPhotoWithoutTextIsAMessageWithoutText() throws Exception {
        Chat chat = activeChat();
        when(storage.store(eq(chat.id), any(), anyString())).thenReturn("consultations/" + chat.id + "/b.jpg");

        sendPhoto(chat.agrochemistToken, chat.id, JPEG, null).andExpect(status().isCreated())
                .andExpect(jsonPath("$.text").doesNotExist()).andExpect(jsonPath("$.photoUrl").exists());
    }

    @Test
    void aGifIsRefusedAndNothingIsStored() throws Exception {
        Chat chat = activeChat();

        sendPhoto(chat.farmerToken, chat.id, "GIF89a....".getBytes(StandardCharsets.ISO_8859_1), null)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_image"));

        verify(storage, never()).store(any(), any(), anyString());
    }

    @Test
    void aStrangerGetsNotFoundForUploadAndDownload() throws Exception {
        Chat chat = activeChat();
        when(storage.store(eq(chat.id), any(), anyString())).thenReturn("consultations/" + chat.id + "/c.jpg");
        String body = sendPhoto(chat.farmerToken, chat.id, JPEG, null).andReturn().getResponse()
                .getContentAsString();
        String stranger = token(newUser(Role.FARMER, null));

        sendPhoto(stranger, chat.id, JPEG, null).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("consultation_not_found"));
        mvc.perform(get(JsonPath.<String>read(body, "$.photoUrl")).header("Authorization", stranger))
                .andExpect(status().isNotFound());
    }

    @Test
    void aFailedInsertRemovesTheStoredObject() throws Exception {
        Chat chat = activeChat();
        // A key longer than the column (512) makes the INSERT fail after the object was stored
        String tooLong = "consultations/" + "k".repeat(520);
        when(storage.store(eq(chat.id), any(), anyString())).thenReturn(tooLong);

        sendPhoto(chat.farmerToken, chat.id, JPEG, null).andExpect(status().is5xxServerError());

        verify(storage).delete(tooLong);
    }

    @Test
    void aClosedConsultationRefusesPhotosBeforeStoring() throws Exception {
        Chat chat = activeChat();
        mvc.perform(post("/api/consultations/" + chat.id + "/close").header("Authorization", chat.farmerToken))
                .andExpect(status().isOk());

        sendPhoto(chat.farmerToken, chat.id, JPEG, null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("invalid_consultation_state"));

        verify(storage, never()).store(any(), any(), anyString());
    }
}
