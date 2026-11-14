package kz.agroadvisor.diagnosis.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
class DiagnosisReviewIntegrationTest {

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
        // Reviews of a reviewer block the delete of the user (audit trail), so they go first
        created.forEach(id -> jdbc.update("DELETE FROM diagnosis_reviews WHERE reviewer_id = ?", id));
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID newUser(Role role, String verification) {
        String phone = "+7728" + (1_000_000 + (int) (Math.random() * 8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Rev " + phone, "ru", Set.of(role))).getId();
        created.add(id);
        if (verification != null) {
            jdbc.update("""
                    INSERT INTO agrochemist_profiles (user_id, specialization, experience_years,
                                                      verification_status)
                    VALUES (?, 'plant_protection', 4, ?)""", id, verification);
        }
        return id;
    }

    private String bearer(UUID id) {
        return "Bearer " + jwt.issueAccessToken(id);
    }

    private UUID diagnosis(UUID owner, String status) {
        return jdbc.queryForObject("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version)
                VALUES (?, 'potato', 'diagnoses/review.jpg', ?, 'potato__late_blight', 0.9, 'effnet-b0-v1', 1)
                RETURNING id""", UUID.class, owner, status);
    }

    private record Chat(UUID id, UUID farmer, UUID agrochemist, UUID diagnosis) {
    }

    /** A consultation of a farmer with an agrochemist, the farmer's diagnosis attached; accepted if asked. */
    private Chat chat(boolean accept) throws Exception {
        UUID farmer = newUser(Role.FARMER, null);
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        UUID diagnosis = diagnosis(farmer, "ok");
        String location = mvc.perform(post("/api/consultations").header("Authorization", bearer(farmer))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"agrochemistId\": \"" + agrochemist + "\", \"text\": \"Look\", \"diagnosisId\": \""
                        + diagnosis + "\"}")).andExpect(status().isCreated()).andReturn().getResponse()
                .getHeader("Location");
        UUID id = UUID.fromString(location.substring(location.lastIndexOf('/') + 1));
        if (accept) {
            mvc.perform(post("/api/consultations/" + id + "/accept").header("Authorization", bearer(agrochemist)))
                    .andExpect(status().isOk());
        }
        return new Chat(id, farmer, agrochemist, diagnosis);
    }

    private ResultActions review(String path, UUID user, String json) throws Exception {
        return mvc.perform(put(path).header("Authorization", bearer(user)).contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    private static String consultationPath(Chat chat) {
        return "/api/consultations/" + chat.id + "/diagnosis/review";
    }

    @Test
    void anAgrochemistConfirmsAndThenChangesTheirMind() throws Exception {
        Chat chat = chat(true);

        review(consultationPath(chat), chat.agrochemist, "{\"verdict\": \"confirmed\", \"comment\": \" Typical \"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mine.verdict").value("confirmed"))
                .andExpect(jsonPath("$.mine.correctCode").value("potato__late_blight"))
                .andExpect(jsonPath("$.mine.comment").value("Typical"))
                .andExpect(jsonPath("$.combined.status").value("confirmed"))
                .andExpect(jsonPath("$.combined.reviews").value(1));

        review(consultationPath(chat), chat.agrochemist,
                "{\"verdict\": \"corrected\", \"correctCode\": \"potato__early_blight\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mine.verdict").value("corrected"))
                .andExpect(jsonPath("$.combined.status").value("corrected"))
                .andExpect(jsonPath("$.combined.correctCode").value("potato__early_blight"))
                .andExpect(jsonPath("$.combined.reviews").value(1)); // the same row, not a second one

        mvc.perform(get(consultationPath(chat)).header("Authorization", bearer(chat.agrochemist)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mine.verdict").value("corrected"));
    }

    @Test
    void anAdministratorAndAnAgrochemistWhoDisagreeMakeItDisputed() throws Exception {
        Chat chat = chat(true);
        UUID admin = newUser(Role.ADMIN, null);

        review(consultationPath(chat), chat.agrochemist, "{\"verdict\": \"confirmed\"}").andExpect(status().isOk());
        review("/api/admin/diagnoses/" + chat.diagnosis + "/review", admin,
                "{\"verdict\": \"corrected\", \"correctCode\": \"potato__healthy\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.combined.status").value("disputed"))
                .andExpect(jsonPath("$.combined.reviews").value(2));

        // The agrochemist sees the combined result but not the administrator's own review
        mvc.perform(get(consultationPath(chat)).header("Authorization", bearer(chat.agrochemist)))
                .andExpect(jsonPath("$.mine.verdict").value("confirmed"))
                .andExpect(jsonPath("$.combined.status").value("disputed"));
    }

    @Test
    void theRulesOfAVerdictAreEnforced() throws Exception {
        Chat chat = chat(true);
        String path = consultationPath(chat);

        review(path, chat.agrochemist, "{\"verdict\": \"corrected\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_verdict"));
        review(path, chat.agrochemist, "{\"verdict\": \"corrected\", \"correctCode\": \"potato__late_blight\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_verdict"));
        review(path, chat.agrochemist, "{\"verdict\": \"confirmed\", \"correctCode\": \"potato__early_blight\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_verdict"));
        review(path, chat.agrochemist, "{\"verdict\": \"unclear\", \"correctCode\": \"potato__early_blight\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_verdict"));
        review(path, chat.agrochemist, "{\"verdict\": \"corrected\", \"correctCode\": \"potato__nonexistent\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("unknown_class"));
        review(path, chat.agrochemist, "{\"verdict\": \"maybe\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        review(path, chat.agrochemist, "{\"verdict\": \"unclear\", \"comment\": \"bell\\u0007\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        review(path, chat.agrochemist, "{\"verdict\": \"unclear\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.mine.correctCode").doesNotExist())
                .andExpect(jsonPath("$.combined.status").value("unclear"));
    }

    @Test
    void aModelThatGaveNoAnswerCannotBeConfirmed() throws Exception {
        UUID admin = newUser(Role.ADMIN, null);
        UUID unknown = diagnosis(newUser(Role.FARMER, null), "unknown");

        review("/api/admin/diagnoses/" + unknown + "/review", admin, "{\"verdict\": \"confirmed\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_verdict"));
        review("/api/admin/diagnoses/" + unknown + "/review", admin,
                "{\"verdict\": \"corrected\", \"correctCode\": \"potato__healthy\"}").andExpect(status().isOk());
    }

    @Test
    void onlyTheAcceptedAgrochemistOfAConsultationWithADiagnosisMayReview() throws Exception {
        Chat requested = chat(false);
        Chat accepted = chat(true);
        UUID otherAgrochemist = newUser(Role.AGROCHEMIST, "approved");

        review(consultationPath(requested), requested.agrochemist, "{\"verdict\": \"confirmed\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("invalid_consultation_state"));
        review(consultationPath(accepted), otherAgrochemist, "{\"verdict\": \"confirmed\"}")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("consultation_not_found"));
        // The farmer is not a reviewer of their own diagnosis
        review(consultationPath(accepted), accepted.farmer, "{\"verdict\": \"confirmed\"}")
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/diagnoses/" + accepted.diagnosis + "/review").header("Authorization",
                bearer(accepted.farmer)).contentType(MediaType.APPLICATION_JSON).content("{\"verdict\": \"confirmed\"}"))
                .andExpect(status().is4xxClientError());
        // A closed consultation can still be reviewed
        mvc.perform(post("/api/consultations/" + accepted.id + "/close").header("Authorization",
                bearer(accepted.agrochemist))).andExpect(status().isOk());
        review(consultationPath(accepted), accepted.agrochemist, "{\"verdict\": \"confirmed\"}")
                .andExpect(status().isOk());
    }

    @Test
    void aConsultationWithoutADiagnosisHasNothingToReview() throws Exception {
        UUID farmer = newUser(Role.FARMER, null);
        UUID agrochemist = newUser(Role.AGROCHEMIST, "approved");
        String location = mvc.perform(post("/api/consultations").header("Authorization", bearer(farmer))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"agrochemistId\": \"" + agrochemist + "\", \"text\": \"Hi\"}"))
                .andReturn().getResponse().getHeader("Location");
        String id = location.substring(location.lastIndexOf('/') + 1);
        mvc.perform(post("/api/consultations/" + id + "/accept").header("Authorization", bearer(agrochemist)))
                .andExpect(status().isOk());

        review("/api/consultations/" + id + "/diagnosis/review", agrochemist, "{\"verdict\": \"unclear\"}")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("diagnosis_not_found"));
    }

    @Test
    void theAdminEndpointNeedsTheAdminRoleAndAnExistingDiagnosis() throws Exception {
        Chat chat = chat(true);
        String path = "/api/admin/diagnoses/" + chat.diagnosis + "/review";

        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        review(path, chat.agrochemist, "{\"verdict\": \"unclear\"}").andExpect(status().isForbidden());
        review(path, chat.farmer, "{\"verdict\": \"unclear\"}").andExpect(status().isForbidden());
        UUID admin = newUser(Role.ADMIN, null);
        mvc.perform(get("/api/admin/diagnoses/" + UUID.randomUUID() + "/review")
                .header("Authorization", bearer(admin))).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("diagnosis_not_found"));
        mvc.perform(get(path).header("Authorization", bearer(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$.mine").doesNotExist()).andExpect(jsonPath("$.combined.status").value("none"));
    }
}
