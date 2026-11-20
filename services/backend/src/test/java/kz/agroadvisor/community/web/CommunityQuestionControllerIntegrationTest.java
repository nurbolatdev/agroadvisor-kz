package kz.agroadvisor.community.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.community.service.CommunityPhotoStorage;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CommunityQuestionControllerIntegrationTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF,
        (byte) 0xD9};
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
    private CommunityPhotoStorage storage;

    private final List<UUID> created = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role) {
        String phone = "+7727" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Ask " + phone, "ru", Set.of(role))).getId();
        created.add(id);
        jdbc.update("UPDATE users SET region_id = (SELECT min(id) FROM regions) WHERE id = ?", id);
        return id;
    }

    private String token(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private ResultActions ask(String token, String title, byte[]... photos) throws Exception {
        var request = multipart("/api/community/questions")
                .param("title", title).param("text", "Spots on the leaves").param("cropCode", "potato")
                .header("Authorization", token);
        for (byte[] photo : photos) {
            request.file(new MockMultipartFile("photos", "leaf.jpg", "image/jpeg", photo));
        }
        return mvc.perform(request);
    }

    @Test
    void aFarmerAsksWithAPhotoAndAnotherFarmerReadsTheQuestionAndThePhoto() throws Exception {
        when(storage.store(any(), any(), anyString())).thenAnswer(
                call -> "community/" + call.getArgument(0) + "/" + UUID.randomUUID() + ".jpg");
        when(storage.load(anyString())).thenReturn(JPEG);
        String author = token(newUser(Role.FARMER));
        String reader = token(newUser(Role.FARMER));

        String body = ask(author, "  Late blight?  ", JPEG_WITH_GPS).andExpect(status().isCreated())
                .andExpect(header().string("Location", org.hamcrest.Matchers.startsWith("/api/community/questions/")))
                .andExpect(jsonPath("$.title").value("Late blight?"))
                .andExpect(jsonPath("$.status").value("open"))
                .andExpect(jsonPath("$.mine").value(true))
                .andExpect(jsonPath("$.photoUrls.length()").value(1))
                .andReturn().getResponse().getContentAsString();

        ArgumentCaptor<byte[]> stored = ArgumentCaptor.forClass(byte[].class);
        verify(storage).store(any(), stored.capture(), anyString());
        assertThat(new String(stored.getValue(), StandardCharsets.ISO_8859_1)).doesNotContain("GPS");
        String id = JsonPath.read(body, "$.id");
        String photoUrl = JsonPath.read(body, "$.photoUrls[0]");
        mvc.perform(get("/api/community/questions/" + id).header("Authorization", reader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mine").value(false));
        String etag = mvc.perform(get(photoUrl).header("Authorization", reader))
                .andExpect(status().isOk()).andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andReturn().getResponse().getHeader("ETag");
        mvc.perform(get(photoUrl).header("Authorization", reader).header("If-None-Match", etag))
                .andExpect(status().isNotModified());
        mvc.perform(get("/api/community/questions").param("crop", "potato").param("limit", "50")
                .header("Authorization", reader))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == '" + id + "')]").exists());
    }

    @Test
    void anAgrochemistReadsButDoesNotAskAndAnAdminDoesNeither() throws Exception {
        String agrochemist = token(newUser(Role.AGROCHEMIST));
        String admin = token(newUser(Role.ADMIN));

        ask(agrochemist, "Can I ask?").andExpect(status().isForbidden());
        mvc.perform(get("/api/community/questions").header("Authorization", agrochemist))
                .andExpect(status().isOk());
        mvc.perform(get("/api/community/questions").header("Authorization", admin)).andExpect(status().isForbidden());
        mvc.perform(get("/api/community/questions")).andExpect(status().isUnauthorized());
        verify(storage, never()).store(any(), any(), anyString());
    }

    @Test
    void aHiddenQuestionIsNotFoundForEveryoneAndLeavesTheFeed() throws Exception {
        UUID authorId = newUser(Role.FARMER);
        String author = token(authorId);
        String reader = token(newUser(Role.FARMER));
        String body = ask(author, "Hide me").andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString();
        String id = JsonPath.read(body, "$.id");
        jdbc.update("UPDATE community_questions SET hidden_at = now(), hidden_by = ? WHERE id = ?::uuid",
                authorId, id);

        mvc.perform(get("/api/community/questions/" + id).header("Authorization", author))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("question_not_found"));
        mvc.perform(get("/api/community/questions/" + id).header("Authorization", reader))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/community/questions").param("mine", "true").header("Authorization", author))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void badInputIsRefusedWithItsCodeAndNothingIsStored() throws Exception {
        String author = token(newUser(Role.FARMER));

        ask(author, "ab").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        ask(author, "A title", "GIF89a....".getBytes(StandardCharsets.ISO_8859_1)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_image"));
        mvc.perform(get("/api/community/questions").param("limit", "51").header("Authorization", author))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/community/questions").param("before", UUID.randomUUID().toString())
                .header("Authorization", author))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("question_not_found"));

        verify(storage, never()).store(any(), any(), anyString());
    }
}
