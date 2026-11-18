package kz.agroadvisor.diagnosis.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.auth.service.JwtService;
import kz.agroadvisor.diagnosis.repository.AiQualityRepository;
import kz.agroadvisor.users.model.Login;
import kz.agroadvisor.users.model.Role;
import kz.agroadvisor.users.model.User;
import kz.agroadvisor.users.repository.UserRepository;

/**
 * The database is shared with other test classes, so the figures are compared before and after this class adds
 * its own diagnoses instead of being compared with absolute numbers.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AdminAiQualityControllerTest {

    private static final String AI = "potato__late_blight";
    private static final String RIGHT = "tomato__late_blight";

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private JwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private JsonMapper json;
    @Autowired
    private AiQualityRepository quality;

    private final List<UUID> created = new ArrayList<>();
    private UUID farmerId;
    private UUID adminId;
    private UUID secondAdminId;
    private String adminToken;
    private String farmerToken;

    @BeforeEach
    void setUp() {
        farmerId = user(Role.FARMER);
        adminId = user(Role.ADMIN);
        secondAdminId = user(Role.ADMIN);
        adminToken = "Bearer " + jwt.issueAccessToken(adminId);
        farmerToken = "Bearer " + jwt.issueAccessToken(farmerId);
    }

    /** The farmer goes first: deleting the owner removes the diagnoses and their reviews before the reviewers. */
    @AfterEach
    void cleanUp() {
        created.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    private UUID user(Role role) {
        String phone = "+7705" + (1_000_000 + ThreadLocalRandom.current().nextInt(8_999_999));
        UUID id = users.saveAndFlush(new User(Login.parse(phone), "x", "Quality " + role, "ru", Set.of(role)))
                .getId();
        created.add(id);
        return id;
    }

    private UUID diagnosis(String status, String code, double confidence) {
        return jdbc.queryForObject("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version)
                VALUES (?, 'potato', 'diagnoses/quality.jpg', ?, ?, ?, 'effnet-b0-v1', 1)
                RETURNING id""", UUID.class, farmerId, status, code, confidence);
    }

    private void review(UUID diagnosis, UUID reviewer, String verdict, String correctCode) {
        jdbc.update("""
                INSERT INTO diagnosis_reviews (diagnosis_id, reviewer_id, verdict, correct_code)
                VALUES (?, ?, ?, ?)""", diagnosis, reviewer, verdict, correctCode);
    }

    private JsonNode stats(String query) throws Exception {
        String body = mvc.perform(get("/api/admin/ai-quality" + query).header("Authorization", adminToken))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private static JsonNode pair(JsonNode mismatches, String ai, String confirmed) {
        for (JsonNode m : mismatches) {
            if (ai.equals(m.get("aiCode").asString()) && confirmed.equals(m.get("confirmedCode").asString())) {
                return m;
            }
        }
        return null;
    }

    @Test
    void requiresAnAdministrator() throws Exception {
        mvc.perform(get("/api/admin/ai-quality")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/ai-quality").header("Authorization", farmerToken))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").exists());
    }

    @Test
    void rejectsAnUnknownPeriod() throws Exception {
        mvc.perform(get("/api/admin/ai-quality?period=year").header("Authorization", adminToken))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void forbidsAnAgrochemist() throws Exception {
        UUID chemist = user(Role.AGROCHEMIST);
        mvc.perform(get("/api/admin/ai-quality").header("Authorization", "Bearer " + jwt.issueAccessToken(chemist)))
                .andExpect(status().isForbidden());
    }

    @Test
    void countsADiseaseButNotAHealthyClass() throws Exception {
        // the repository with a large limit, so the figures do not depend on what else is in the shared database
        Instant since = Instant.now().minus(Duration.ofDays(7));
        int before = count(quality.topDiseases(since, "ru", 1000), AI);
        diagnosis("ok", AI, 0.9);
        diagnosis("low_confidence", AI, 0.3);
        diagnosis("unknown", AI, 0.2); // no answer the model stood behind
        for (int i = 0; i < 40; i++) {
            diagnosis("ok", "potato__healthy", 0.9);
        }

        List<AiQualityRepository.ClassCount> top = quality.topDiseases(since, "ru", 1000);

        assertThat(count(top, "potato__healthy")).isZero();
        assertThat(count(top, AI) - before).isEqualTo(2);
        // and the endpoint caps the list
        assertThat(stats("?period=7d").get("topDiseases").size()).isLessThanOrEqualTo(6);
    }

    private static int count(List<AiQualityRepository.ClassCount> top, String code) {
        return top.stream().filter(c -> c.code().equals(code)).mapToInt(AiQualityRepository.ClassCount::count)
                .sum();
    }

    @Test
    void countsConfidenceBucketsAndTopDiseases() throws Exception {
        JsonNode before = stats("?period=7d");
        diagnosis("ok", AI, 0.05);
        diagnosis("ok", AI, 0.95);
        diagnosis("low_confidence", AI, 1.0);
        diagnosis("unknown", "unknown", 0.31);
        JsonNode after = stats("?period=7d");

        assertThat(after.get("confidenceHistogram")).hasSize(10);
        assertThat(after.get("total").asInt() - before.get("total").asInt()).isEqualTo(4);
        assertThat(bucket(after, 0) - bucket(before, 0)).isEqualTo(1);
        assertThat(bucket(after, 3) - bucket(before, 3)).isEqualTo(1);
        // 1.0 falls into the last bucket together with 0.95
        assertThat(bucket(after, 9) - bucket(before, 9)).isEqualTo(2);
        assertThat(after.get("period").asString()).isEqualTo("7d");
        assertThat(after.get("topDiseases").size()).isLessThanOrEqualTo(6);
        // "unknown" is no disease
        for (JsonNode d : after.get("topDiseases")) {
            assertThat(d.get("code").asString()).isNotEqualTo("unknown");
        }
    }

    @Test
    void namesClassesInTheAskedLanguage() throws Exception {
        UUID d = diagnosis("ok", AI, 0.9);
        review(d, adminId, "corrected", RIGHT);
        String ru = jdbc.queryForObject("SELECT names ->> 'ru' FROM diseases WHERE code = ?", String.class, AI);
        String en = jdbc.queryForObject("SELECT names ->> 'en' FROM diseases WHERE code = ?", String.class, AI);

        JsonNode inRussian = pair(stats("?period=7d&lang=ru").get("mismatches"), AI, RIGHT);
        JsonNode inEnglish = pair(stats("?period=7d&lang=en").get("mismatches"), AI, RIGHT);

        assertThat(inRussian).isNotNull();
        assertThat(inRussian.get("aiName").asString()).isEqualTo(ru);
        assertThat(inEnglish).isNotNull();
        assertThat(inEnglish.get("aiName").asString()).isEqualTo(en);
    }

    @Test
    void countsOnlyAgreedDecisionsAsTrainingData() throws Exception {
        JsonNode before = stats("?period=30d").get("trainingData");
        UUID confirmed = diagnosis("ok", AI, 0.9);
        review(confirmed, adminId, "confirmed", AI);
        UUID corrected = diagnosis("ok", AI, 0.8);
        review(corrected, adminId, "corrected", RIGHT);
        review(corrected, secondAdminId, "corrected", RIGHT);
        UUID disputed = diagnosis("ok", AI, 0.7);
        review(disputed, adminId, "confirmed", AI);
        review(disputed, secondAdminId, "corrected", RIGHT);
        UUID unclear = diagnosis("low_confidence", AI, 0.4);
        review(unclear, adminId, "unclear", null);
        diagnosis("ok", AI, 0.6); // no review at all

        JsonNode after = stats("?period=30d").get("trainingData");

        assertThat(after.get("labeled").asInt() - before.get("labeled").asInt()).isEqualTo(2);
        assertThat(after.get("addedThisWeek").asInt() - before.get("addedThisWeek").asInt()).isEqualTo(2);
        assertThat(after.get("classes").asInt()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void listsWhereExpertsDisagreedWithTheModel() throws Exception {
        // the repository with a large limit: the endpoint's top 5 depends on what else is in the shared database
        Instant since = Instant.now().minus(Duration.ofDays(7));
        int cases = cases(quality.mismatches(since, "ru", 1000), AI, RIGHT);
        UUID wrong = diagnosis("ok", AI, 0.9);
        review(wrong, adminId, "corrected", RIGHT);
        UUID right = diagnosis("ok", AI, 0.9);
        review(right, adminId, "confirmed", AI); // agreement is no mismatch
        UUID unanswered = diagnosis("unknown", "unknown", 0.2);
        review(unanswered, adminId, "corrected", RIGHT); // the model gave no answer to disagree with

        List<AiQualityRepository.Mismatch> all = quality.mismatches(since, "ru", 1000);

        assertThat(cases(all, AI, RIGHT) - cases).isEqualTo(1);
        assertThat(cases(all, AI, AI)).isZero();
        assertThat(cases(all, "unknown", RIGHT)).isZero();
        assertThat(stats("?period=7d").get("mismatches").size()).isLessThanOrEqualTo(5);
    }

    private static int cases(List<AiQualityRepository.Mismatch> all, String ai, String confirmed) {
        return all.stream().filter(m -> m.aiCode().equals(ai) && m.confirmedCode().equals(confirmed))
                .mapToInt(AiQualityRepository.Mismatch::cases).sum();
    }

    @Test
    void leavesOldDiagnosesOutOfShortPeriods() throws Exception {
        int weekBefore = stats("?period=7d").get("total").asInt();
        int monthBefore = stats("?period=30d").get("total").asInt();
        UUID old = diagnosis("ok", AI, 0.5);
        jdbc.update("UPDATE diagnoses SET created_at = now() - interval '20 days' WHERE id = ?", old);

        assertThat(stats("?period=7d").get("total").asInt()).isEqualTo(weekBefore);
        assertThat(stats("?period=30d").get("total").asInt()).isEqualTo(monthBefore + 1);
    }

    private static int bucket(JsonNode stats, int i) {
        return stats.get("confidenceHistogram").get(i).asInt();
    }
}
