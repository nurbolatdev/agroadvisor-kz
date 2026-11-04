package kz.agroadvisor.verification.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;
import kz.agroadvisor.verification.service.AgrochemistVerificationService;
import kz.agroadvisor.verification.service.DocumentStorage;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AgrochemistAdminControllerTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private AgrochemistVerificationService verification;
    @MockitoBean
    private DocumentStorage storage;

    private final List<UUID> created = new ArrayList<>();
    private UUID adminId;
    private String admin;
    private UUID agrochemistId;
    private UUID documentId;

    @BeforeEach
    void setUp() {
        adminId = newUser(Role.ADMIN, "+7721");
        admin = token(adminId);
        agrochemistId = newUser(Role.AGROCHEMIST, "+7722");
        // Far in the past, so this profile is first in the queue however many others other tests left behind
        jdbc.update("""
                INSERT INTO agrochemist_profiles (user_id, specialization, submitted_at)
                VALUES (?, 'agronomist', now() - interval '10 years')""", agrochemistId);
        documentId = jdbc.queryForObject("""
                INSERT INTO agrochemist_documents (user_id, kind, object_key, title, content_type, size_bytes)
                VALUES (?, 'diploma', 'agrochemist-documents/x/d.pdf', 'Diploma', 'application/pdf', 5)
                RETURNING id""", UUID.class, agrochemistId);
    }

    @AfterEach
    void cleanUp() {
        // The profile's reviewed_by points at the admin, so profiles go first
        created.forEach(id -> jdbc.update("DELETE FROM agrochemist_profiles WHERE user_id = ?", id));
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

    private ResultActions decide(String body) throws Exception {
        return mvc.perform(post("/api/admin/agrochemists/" + agrochemistId + "/decision")
                .header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void nonAdminsAreForbidden() throws Exception {
        String farmer = token(newUser(Role.FARMER, "+7723"));
        String agrochemist = token(agrochemistId);

        for (String token : List.of(farmer, agrochemist)) {
            mvc.perform(get("/api/admin/agrochemists").header("Authorization", token))
                    .andExpect(status().isForbidden());
            mvc.perform(get("/api/admin/agrochemists/" + agrochemistId + "/documents/" + documentId + "/file")
                    .header("Authorization", token)).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/agrochemists/" + agrochemistId + "/decision").header("Authorization", token)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"approve\"}"))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/admin/agrochemists")).andExpect(status().isUnauthorized());
    }

    @Test
    void theQueueListsPendingAgrochemistsWithTheirDocumentCount() throws Exception {
        mvc.perform(get("/api/admin/agrochemists").param("size", "100").header("Authorization", admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + agrochemistId + "')].documentCount").value(1))
                .andExpect(jsonPath("$[?(@.userId=='" + agrochemistId + "')].status").value("pending"));
        mvc.perform(get("/api/admin/agrochemists").param("status", "approved").param("size", "100")
                .header("Authorization", admin))
                .andExpect(jsonPath("$[?(@.userId=='" + agrochemistId + "')]").isEmpty());
    }

    @Test
    void anUnknownStatusFilterIsRefused() throws Exception {
        mvc.perform(get("/api/admin/agrochemists").param("status", "banned").header("Authorization", admin))
                .andExpect(status().isBadRequest());
    }

    @Test
    void detailsShowTheContactsAndTheDocuments() throws Exception {
        mvc.perform(get("/api/admin/agrochemists/" + agrochemistId).header("Authorization", admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Test User"))
                .andExpect(jsonPath("$.phone").exists())
                .andExpect(jsonPath("$.specialization").value("agronomist"))
                .andExpect(jsonPath("$.documents.length()").value(1))
                .andExpect(jsonPath("$.documents[0].id").value(documentId.toString()));
        mvc.perform(get("/api/admin/agrochemists/" + UUID.randomUUID()).header("Authorization", admin))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("agrochemist_not_found"));
    }

    @Test
    void approvingMakesTheAgrochemistVerified() throws Exception {
        assertThat(verification.isApproved(agrochemistId)).isFalse();

        decide("{\"decision\":\"approve\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"))
                .andExpect(jsonPath("$.reviewedBy").value(adminId.toString()))
                .andExpect(jsonPath("$.reviewedAt").exists())
                .andExpect(jsonPath("$.rejectionReason").doesNotExist());

        assertThat(verification.isApproved(agrochemistId)).isTrue();
    }

    @Test
    void approvingNeedsADocument() throws Exception {
        jdbc.update("DELETE FROM agrochemist_documents WHERE user_id = ?", agrochemistId);

        decide("{\"decision\":\"approve\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("no_documents"));
        assertThat(verification.isApproved(agrochemistId)).isFalse();
    }

    @Test
    void rejectingAndAskingForDocumentsNeedAReasonTheAgrochemistSees() throws Exception {
        decide("{\"decision\":\"reject\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("reason_required"));
        decide("{\"decision\":\"request_documents\",\"reason\":\"  \"}").andExpect(status().isBadRequest());

        decide("{\"decision\":\"request_documents\",\"reason\":\"Send the diploma, not the certificate\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("documents_requested"));
        mvc.perform(get("/api/agrochemist/verification").header("Authorization", token(agrochemistId)))
                .andExpect(jsonPath("$.status").value("documents_requested"))
                .andExpect(jsonPath("$.rejectionReason").value("Send the diploma, not the certificate"));

        decide("{\"decision\":\"reject\",\"reason\":\"Fake\"}")
                .andExpect(jsonPath("$.status").value("rejected"));
        assertThat(verification.isApproved(agrochemistId)).isFalse();
    }

    @Test
    void approvalAfterARejectionClearsTheReason() throws Exception {
        decide("{\"decision\":\"reject\",\"reason\":\"Blurry\"}").andExpect(status().isOk());

        decide("{\"decision\":\"approve\"}")
                .andExpect(jsonPath("$.status").value("approved"))
                .andExpect(jsonPath("$.rejectionReason").doesNotExist());
    }

    @Test
    void anAdminCannotDecideOnTheirOwnProfile() throws Exception {
        UUID both = users.saveAndFlush(new User(Login.parse("+77251234567"), "x", "Both", "ru",
                Set.of(Role.ADMIN, Role.AGROCHEMIST))).getId();
        created.add(both);
        jdbc.update("INSERT INTO agrochemist_profiles (user_id) VALUES (?)", both);

        mvc.perform(post("/api/admin/agrochemists/" + both + "/decision").header("Authorization", token(both))
                .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"approve\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("self_review_forbidden"));
    }

    @Test
    void aHugePageNumberIsRefusedNotAnOverflow() throws Exception {
        mvc.perform(get("/api/admin/agrochemists").param("page", "2000000000").header("Authorization", admin))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anUnknownDecisionIsRefused() throws Exception {
        decide("{\"decision\":\"ban\"}").andExpect(status().isBadRequest());
        decide("{}").andExpect(status().isBadRequest());
    }

    @Test
    void theFileComesBackAsADownloadWithTheRecordedType() throws Exception {
        when(storage.load("agrochemist-documents/x/d.pdf")).thenReturn("%PDF-1.7".getBytes());

        mvc.perform(get("/api/admin/agrochemists/" + agrochemistId + "/documents/" + documentId + "/file")
                .header("Authorization", admin))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/pdf"))
                .andExpect(content().bytes("%PDF-1.7".getBytes()))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.allOf(org.hamcrest.Matchers.startsWith("attachment"),
                                org.hamcrest.Matchers.endsWith(".pdf\""))))
                .andExpect(header().string("Content-Security-Policy", "sandbox"))
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")));
    }

    @Test
    void aDocumentOfAnotherAgrochemistIsNotFound() throws Exception {
        UUID other = newUser(Role.AGROCHEMIST, "+7724");
        jdbc.update("INSERT INTO agrochemist_profiles (user_id) VALUES (?)", other);

        mvc.perform(get("/api/admin/agrochemists/" + other + "/documents/" + documentId + "/file")
                .header("Authorization", admin))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("document_not_found"));
    }
}
