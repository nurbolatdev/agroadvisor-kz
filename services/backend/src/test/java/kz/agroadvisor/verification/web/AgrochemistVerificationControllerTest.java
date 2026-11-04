package kz.agroadvisor.verification.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;
import kz.agroadvisor.verification.service.DocumentStorage;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AgrochemistVerificationControllerTest {

    private static final byte[] PDF = "%PDF-1.7 diploma".getBytes();
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDB, 0, 2, (byte) 0xFF,
        (byte) 0xD9};

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @MockitoBean
    private DocumentStorage storage;

    private final List<UUID> created = new ArrayList<>();
    private UUID agrochemistId;
    private String agrochemist;

    @BeforeEach
    void setUp() {
        when(storage.store(any(), any(), anyString())).thenAnswer(call -> "agrochemist-documents/x/" + UUID.randomUUID());
        agrochemistId = newUser(Role.AGROCHEMIST, "+7711");
        jdbc.update("INSERT INTO agrochemist_profiles (user_id) VALUES (?)", agrochemistId);
        agrochemist = token(agrochemistId);
    }

    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role, String prefix) {
        String phone = prefix + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Test User", "ru", Set.of(role))).getId();
        created.add(id);
        return id;
    }

    private String token(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private MockMultipartHttpServletRequestBuilder upload(byte[] bytes, String kind) {
        return multipart("/api/agrochemist/documents")
                .file(new MockMultipartFile("file", "scan.pdf", "application/octet-stream", bytes))
                .param("kind", kind);
    }

    private ResultActions send(MockMultipartHttpServletRequestBuilder request, String token) throws Exception {
        return mvc.perform(request.header("Authorization", token));
    }

    private String profileStatus(UUID id) {
        return jdbc.queryForObject("SELECT verification_status FROM agrochemist_profiles WHERE user_id = ?",
                String.class, id);
    }

    @Test
    void aNewAgrochemistIsPendingWithoutDocuments() throws Exception {
        mvc.perform(get("/api/agrochemist/verification").header("Authorization", agrochemist))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.submittedAt").exists())
                .andExpect(jsonPath("$.documents").isEmpty());
    }

    @Test
    void uploadStoresTheFileRecordsItAndPutsTheProfileInTheQueue() throws Exception {
        send(upload(PDF, "diploma").param("title", " Diploma ").param("issuer", "KazNAU").param("year", "2015"),
                agrochemist)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("diploma"))
                .andExpect(jsonPath("$.title").value("Diploma"))
                .andExpect(jsonPath("$.year").value(2015))
                .andExpect(jsonPath("$.contentType").value("application/pdf"))
                .andExpect(jsonPath("$.sizeBytes").value(PDF.length));

        verify(storage).store(eq(agrochemistId), eq(PDF), eq("application/pdf"));
        mvc.perform(get("/api/agrochemist/verification").header("Authorization", agrochemist))
                .andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.submittedAt").exists())
                .andExpect(jsonPath("$.documents.length()").value(1));
    }

    @Test
    void theTypeComesFromTheBytesNotFromTheClientsHeader() throws Exception {
        send(upload(JPEG, "certificate"), agrochemist)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.contentType").value("image/jpeg"));
    }

    @Test
    void aFileThatIsNotAPdfOrAnImageIsRefusedAndNothingIsStored() throws Exception {
        send(upload("<html>".getBytes(), "diploma"), agrochemist)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_document"))
                .andExpect(jsonPath("$.reason").value("unsupported_format"));
        send(upload(new byte[0], "diploma"), agrochemist)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_document"));

        verify(storage, never()).store(any(), any(), anyString());
    }

    @Test
    void badFieldsAreRefusedBeforeTheFileIsTouched() throws Exception {
        send(upload(PDF, "passport"), agrochemist)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_document_fields"))
                .andExpect(jsonPath("$.reason").value("kind"));
        send(upload(PDF, "diploma").param("year", "1800"), agrochemist)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("year"));

        verify(storage, never()).store(any(), any(), anyString());
    }

    @Test
    void atMostFiveDocuments() throws Exception {
        for (int i = 0; i < 5; i++) {
            send(upload(PDF, "certificate"), agrochemist).andExpect(status().isCreated());
        }

        send(upload(PDF, "certificate"), agrochemist)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("document_limit_reached"));
    }

    @Test
    void aRejectedProfileGoesBackToPendingWhenANewDocumentIsSent() throws Exception {
        jdbc.update("""
                UPDATE agrochemist_profiles SET verification_status = 'rejected', rejection_reason = 'blurry scan'
                WHERE user_id = ?""", agrochemistId);

        send(upload(PDF, "diploma"), agrochemist).andExpect(status().isCreated());

        assertThat(profileStatus(agrochemistId)).isEqualTo("pending");
        mvc.perform(get("/api/agrochemist/verification").header("Authorization", agrochemist))
                .andExpect(jsonPath("$.rejectionReason").doesNotExist())
                .andExpect(jsonPath("$.submittedAt").exists());
    }

    @Test
    void aWaitingProfileKeepsItsPlaceInTheQueue() throws Exception {
        send(upload(PDF, "diploma"), agrochemist).andExpect(status().isCreated());
        Object first = jdbc.queryForObject("SELECT submitted_at FROM agrochemist_profiles WHERE user_id = ?",
                Object.class, agrochemistId);

        send(upload(PDF, "certificate"), agrochemist).andExpect(status().isCreated());

        Object second = jdbc.queryForObject("SELECT submitted_at FROM agrochemist_profiles WHERE user_id = ?",
                Object.class, agrochemistId);
        assertThat(second).isEqualTo(first);
    }

    @Test
    void anApprovedProfileCannotChangeItsDocuments() throws Exception {
        send(upload(PDF, "diploma"), agrochemist).andExpect(status().isCreated());
        String id = mvc.perform(get("/api/agrochemist/documents").header("Authorization", agrochemist))
                .andReturn().getResponse().getContentAsString().replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
        jdbc.update("UPDATE agrochemist_profiles SET verification_status = 'approved' WHERE user_id = ?", agrochemistId);

        send(upload(PDF, "certificate"), agrochemist)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("agrochemist_already_approved"));
        mvc.perform(delete("/api/agrochemist/documents/" + id).header("Authorization", agrochemist))
                .andExpect(status().isConflict());
    }

    @Test
    void deleteRemovesTheRowAndTheObject() throws Exception {
        send(upload(PDF, "diploma"), agrochemist).andExpect(status().isCreated());
        String key = jdbc.queryForObject("SELECT object_key FROM agrochemist_documents WHERE user_id = ?",
                String.class, agrochemistId);
        UUID id = jdbc.queryForObject("SELECT id FROM agrochemist_documents WHERE user_id = ?", UUID.class,
                agrochemistId);

        mvc.perform(delete("/api/agrochemist/documents/" + id).header("Authorization", agrochemist))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("SELECT count(*) FROM agrochemist_documents WHERE user_id = ?", Integer.class,
                agrochemistId)).isZero();
        verify(storage).delete(key);
    }

    @Test
    void aFailedObjectDeleteDoesNotFailTheRequest() throws Exception {
        send(upload(PDF, "diploma"), agrochemist).andExpect(status().isCreated());
        UUID id = jdbc.queryForObject("SELECT id FROM agrochemist_documents WHERE user_id = ?", UUID.class,
                agrochemistId);
        doThrow(new RuntimeException("down")).when(storage).delete(anyString());

        mvc.perform(delete("/api/agrochemist/documents/" + id).header("Authorization", agrochemist))
                .andExpect(status().isNoContent());
    }

    @Test
    void aDocumentOfAnotherAgrochemistIsNotFound() throws Exception {
        UUID otherId = newUser(Role.AGROCHEMIST, "+7712");
        jdbc.update("INSERT INTO agrochemist_profiles (user_id) VALUES (?)", otherId);
        send(upload(PDF, "diploma"), token(otherId)).andExpect(status().isCreated());
        UUID theirs = jdbc.queryForObject("SELECT id FROM agrochemist_documents WHERE user_id = ?", UUID.class,
                otherId);

        mvc.perform(delete("/api/agrochemist/documents/" + theirs).header("Authorization", agrochemist))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("document_not_found"));
        mvc.perform(get("/api/agrochemist/documents").header("Authorization", agrochemist))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void anAccountWithoutAProfileIsRefusedBeforeAnythingIsStored() throws Exception {
        UUID noProfile = newUser(Role.AGROCHEMIST, "+7713");

        send(upload(PDF, "diploma"), token(noProfile))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("agrochemist_profile_missing"));

        verify(storage, never()).store(any(), any(), anyString());
    }

    @Test
    void anUnreachableStorageIsServiceUnavailable() throws Exception {
        when(storage.store(any(), any(), anyString())).thenThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "storage_unavailable", "down"));

        send(upload(PDF, "diploma"), agrochemist)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("storage_unavailable"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM agrochemist_documents WHERE user_id = ?", Integer.class,
                agrochemistId)).isZero();
    }

    @Test
    void anApprovalDuringTheUploadIsNotUndoneAndTheObjectIsDropped() throws Exception {
        when(storage.store(any(), any(), anyString())).thenAnswer(call -> {
            // An admin approves while the file is on its way to the storage
            jdbc.update("""
                    INSERT INTO agrochemist_documents (user_id, kind, object_key, content_type, size_bytes)
                    VALUES (?, 'diploma', 'agrochemist-documents/x/first', 'application/pdf', 1)""", agrochemistId);
            jdbc.update("UPDATE agrochemist_profiles SET verification_status = 'approved' WHERE user_id = ?",
                    agrochemistId);
            return "agrochemist-documents/x/late";
        });

        send(upload(PDF, "certificate"), agrochemist)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("agrochemist_already_approved"));

        assertThat(profileStatus(agrochemistId)).isEqualTo("approved");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM agrochemist_documents WHERE user_id = ?", Integer.class,
                agrochemistId)).isEqualTo(1);
        verify(storage).delete("agrochemist-documents/x/late");
    }

    @Test
    void theObjectIsDroppedWhenTheRowCannotBeSaved() throws Exception {
        when(storage.store(any(), any(), anyString())).thenAnswer(call -> {
            jdbc.update("DELETE FROM agrochemist_profiles WHERE user_id = ?", agrochemistId);
            return "agrochemist-documents/x/orphan";
        });

        send(upload(PDF, "diploma"), agrochemist)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("agrochemist_profile_missing"));

        verify(storage).delete("agrochemist-documents/x/orphan");
    }

    @Test
    void anAdminHasNoBusinessWithTheAgrochemistEndpoints() throws Exception {
        String admin = token(newUser(Role.ADMIN, "+7715"));

        mvc.perform(get("/api/agrochemist/verification").header("Authorization", admin))
                .andExpect(status().isForbidden());
        send(upload(PDF, "diploma"), admin).andExpect(status().isForbidden());
    }

    @Test
    void onlyAnAgrochemistMayUseTheEndpoints() throws Exception {
        String farmer = token(newUser(Role.FARMER, "+7714"));

        mvc.perform(get("/api/agrochemist/verification").header("Authorization", farmer))
                .andExpect(status().isForbidden());
        send(upload(PDF, "diploma"), farmer).andExpect(status().isForbidden());
        mvc.perform(get("/api/agrochemist/documents")).andExpect(status().isUnauthorized());
    }
}
