package kz.agroadvisor.community.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.community.repository.CommunityQuestionRepository;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Not transactional: the race test needs real concurrent transactions. The users are removed after each
 * test, which takes their questions, answers, cases and reports with them.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CommunityReportServiceTest {

    @Autowired
    private CommunityReportService service;
    @Autowired
    private CommunityQuestionRepository questions;
    @Autowired
    private CommunityAnswerService answers;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> users = new ArrayList<>();
    private long region;
    private UUID author;
    private UUID first;
    private UUID second;
    private UUID question;

    @BeforeEach
    void setUp() {
        region = jdbc.queryForObject("SELECT id FROM regions ORDER BY id LIMIT 1", Long.class);
        author = user();
        first = user();
        second = user();
        question = UUID.randomUUID();
        assertThat(questions.insert(question, author, "tomato", null, "Title", "Body")).isTrue();
    }

    @AfterEach
    void tearDown() {
        // resolved_by and hidden_by do not cascade, so the questions (and their cases) go first
        jdbc.update("DELETE FROM community_questions WHERE author_id = ?", author);
        for (UUID id : users) {
            jdbc.update("DELETE FROM users WHERE id = ?", id);
        }
    }

    @Test
    void twoUsersShareOneCaseWithTwoReports() {
        service.report(first, "question", question, "ads", "  Selling seeds ");
        service.report(second, "question", question, "spam", null);

        assertThat(complaintCount(question)).isEqualTo(1);
        assertThat(reportCount(question)).isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "SELECT comment FROM community_reports WHERE reporter_id = ?", String.class, first))
                .isEqualTo("Selling seeds");
    }

    @Test
    void aRepeatFromTheSameUserAddsNoReport() {
        service.report(first, "question", question, "ads", null);
        service.report(first, "question", question, "abuse", "Changed my mind");

        assertThat(reportCount(question)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT reason FROM community_reports WHERE reporter_id = ?",
                String.class, first)).isEqualTo("ads");
    }

    @Test
    void anAnswerGetsItsOwnCase() {
        UUID answer = answers.answer(first, question, "Use copper").id();

        service.report(second, "answer", answer, "misinformation", null);
        service.report(author, "answer", answer, "abuse", null);
        service.report(second, "question", question, "ads", null);

        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM community_complaints WHERE answer_id = ? AND target_type = 'answer'""",
                Integer.class, answer)).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM community_reports r JOIN community_complaints c ON c.id = r.complaint_id
                 WHERE c.answer_id = ?""", Integer.class, answer)).isEqualTo(2);
        assertThat(complaintCount(question)).isEqualTo(2);
    }

    @Test
    void aReportAfterTheDecisionOpensANewCase() {
        service.report(first, "question", question, "ads", null);
        jdbc.update("""
                UPDATE community_complaints SET status = 'resolved', resolved_at = now(), resolved_by = ?,
                       action = 'keep' WHERE question_id = ?""", author, question);

        service.report(first, "question", question, "ads", null);

        assertThat(complaintCount(question)).isEqualTo(2);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM community_complaints WHERE question_id = ? AND status = 'new'""",
                Integer.class, question)).isEqualTo(1);
        assertThat(reportCount(question)).isEqualTo(2);
    }

    @Test
    void twoFirstReportsAtOnceMakeOneCase() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 10; round++) {
                UUID target = UUID.randomUUID();
                assertThat(questions.insert(target, author, "tomato", null, "Race " + round, "Body")).isTrue();
                CountDownLatch go = new CountDownLatch(1);
                Future<?> a = pool.submit(() -> report(go, first, target));
                Future<?> b = pool.submit(() -> report(go, second, target));
                go.countDown();
                a.get();
                b.get();

                assertThat(complaintCount(target)).isEqualTo(1);
                assertThat(reportCount(target)).isEqualTo(2);
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void ownContentCannotBeReported() {
        UUID answer = answers.answer(first, question, "Mine").id();

        assertThatThrownBy(() -> service.report(author, "question", question, "ads", null))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("own_content"));
        assertThatThrownBy(() -> service.report(first, "answer", answer, "ads", null))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("own_content"));
        assertThat(complaintCount(question)).isZero();
    }

    @Test
    void aHiddenOrUnknownTargetIsNotFound() {
        jdbc.update("UPDATE community_questions SET hidden_at = now(), hidden_by = ? WHERE id = ?", second,
                question);

        assertThatThrownBy(() -> service.report(first, "question", question, "ads", null))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("question_not_found"));
        assertThatThrownBy(() -> service.report(first, "answer", UUID.randomUUID(), "ads", null))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("answer_not_found"));
    }

    @Test
    void invalidInputIsRejected() {
        assertThatThrownBy(() -> service.report(first, "post", question, "ads", null))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("validation_failed"));
        assertThatThrownBy(() -> service.report(first, "question", question, "rude", null))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("validation_failed"));
        assertThatThrownBy(() -> service.report(first, "question", question, "ads", "x".repeat(501)))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("validation_failed"));
        assertThat(complaintCount(question)).isZero();
    }

    private void report(CountDownLatch go, UUID reporter, UUID target) {
        try {
            go.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return;
        }
        service.report(reporter, "question", target, "spam", null);
    }

    private int complaintCount(UUID questionId) {
        return jdbc.queryForObject("SELECT count(*) FROM community_complaints WHERE question_id = ?",
                Integer.class, questionId);
    }

    private int reportCount(UUID questionId) {
        return jdbc.queryForObject("""
                SELECT count(*) FROM community_reports r JOIN community_complaints c ON c.id = r.complaint_id
                 WHERE c.question_id = ?""", Integer.class, questionId);
    }

    private UUID user() {
        UUID id = jdbc.queryForObject("""
                INSERT INTO users (phone, password_hash, full_name, region_id) VALUES (?, 'x', 'Test', ?)
                RETURNING id""", UUID.class, "+77053" + String.format("%09d", Math.abs(UUID.randomUUID().getMostSignificantBits()) % 1_000_000_000L), region);
        users.add(id);
        return id;
    }
}
