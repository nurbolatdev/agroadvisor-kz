package kz.agroadvisor.community.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.community.repository.CommunityAnswerRepository;
import kz.agroadvisor.community.repository.CommunityComplaintRepository;
import kz.agroadvisor.community.repository.CommunityQuestionRepository;
import kz.agroadvisor.community.service.CommunityModerationService.ComplaintView;
import kz.agroadvisor.users.service.UserAdminService;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Not transactional, like the report test; the users and questions of each test are removed afterwards. The
 * filters are checked on the cases of the test's own questions, so cases of other tests do not matter.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CommunityModerationServiceTest {

    @Autowired
    private CommunityComplaintRepository repository;
    @Autowired
    private CommunityQuestionRepository questions;
    @Autowired
    private CommunityAnswerService answers;
    @Autowired
    private CommunityAnswerRepository answerRepository;
    @Autowired
    private UserAdminService userAdmin;
    @Autowired
    private CommunityModerationService moderation;
    @Autowired
    private JdbcTemplate jdbc;

    private CommunityModerationService service;
    private final List<UUID> users = new ArrayList<>();
    private long region;
    private UUID author;
    private UUID answerAuthor;
    private UUID admin;
    private UUID question;

    @BeforeEach
    void setUp() {
        service = new CommunityModerationService(repository, questions, answerRepository, userAdmin,
                Clock.systemUTC());
        region = jdbc.queryForObject("SELECT id FROM regions ORDER BY id LIMIT 1", Long.class);
        author = user();
        answerAuthor = user();
        admin = user();
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'farmer')", author);
        question = UUID.randomUUID();
        assertThat(questions.insert(question, author, "tomato", null, "Blight?", "Spots on leaves")).isTrue();
    }

    @AfterEach
    void tearDown() {
        jdbc.update("DELETE FROM community_questions WHERE author_id = ?", author);
        for (UUID id : users) {
            jdbc.update("DELETE FROM users WHERE id = ?", id);
        }
    }

    @Test
    void aCaseGroupsReportsByReasonAndKeepsTheLatestComments() {
        UUID complaint = complaint("question", question, null, "new");
        for (int i = 0; i < 7; i++) {
            report(complaint, i < 4 ? "spam" : "ads", "comment " + i, i);
        }
        report(complaint, "abuse", null, 7);

        ComplaintView view = service.get(complaint);

        assertThat(view.reason()).isEqualTo("spam");
        assertThat(view.reports()).extracting("reason", "count")
                .containsExactly(org.assertj.core.groups.Tuple.tuple("spam", 4),
                        org.assertj.core.groups.Tuple.tuple("ads", 3),
                        org.assertj.core.groups.Tuple.tuple("abuse", 1));
        assertThat(view.comments()).containsExactly("comment 6", "comment 5", "comment 4", "comment 3",
                "comment 2");
        assertThat(view.resolution()).isNull();
        assertThat(view.target().type()).isEqualTo("question");
        assertThat(view.target().questionTitle()).isEqualTo("Blight?");
        assertThat(view.target().hidden()).isFalse();
        assertThat(view.author().id()).isEqualTo(author);
        assertThat(view.author().role()).isEqualTo("farmer");
        assertThat(view.author().expert()).isFalse();
        assertThat(view.author().status()).isEqualTo("active");
    }

    @Test
    void aTieOfReasonsGoesToTheFirstInTheList() {
        UUID complaint = complaint("question", question, null, "new");
        report(complaint, "abuse", null, 0);
        report(complaint, "misinformation", null, 1);

        assertThat(service.get(complaint).reason()).isEqualTo("misinformation");
    }

    @Test
    void anAnswerCaseShowsTheAnswerItsAuthorAndTheHiddenHistory() {
        UUID answer = answers.answer(answerAuthor, question, "Use copper").id();
        jdbc.update("UPDATE community_answers SET hidden_at = now(), hidden_by = ? WHERE id = ?", admin, answer);
        UUID other = answers.answer(answerAuthor, question, "Another one").id();
        UUID complaint = complaint("answer", question, other, "new");
        report(complaint, "ads", null, 0);

        ComplaintView view = service.get(complaint);

        assertThat(view.target().type()).isEqualTo("answer");
        assertThat(view.target().answerId()).isEqualTo(other);
        assertThat(view.target().body()).isEqualTo("Another one");
        assertThat(view.target().questionTitle()).isEqualTo("Blight?");
        assertThat(view.author().id()).isEqualTo(answerAuthor);
        assertThat(view.author().hiddenCount()).isEqualTo(1);
    }

    @Test
    void aHiddenTargetIsStillShownAndAResolvedCaseHasItsResolution() {
        jdbc.update("UPDATE community_questions SET hidden_at = now(), hidden_by = ? WHERE id = ?", admin, question);
        UUID complaint = complaint("question", question, null, "new");
        report(complaint, "spam", null, 0);
        jdbc.update("""
                UPDATE community_complaints SET status = 'resolved', resolved_at = now(), resolved_by = ?,
                       action = 'hide', comment = 'Spam' WHERE id = ?""", admin, complaint);

        ComplaintView view = service.get(complaint);

        assertThat(view.target().hidden()).isTrue();
        assertThat(view.status()).isEqualTo("resolved");
        assertThat(view.resolution().action()).isEqualTo("hide");
        assertThat(view.resolution().comment()).isEqualTo("Spam");
        assertThat(view.resolution().resolvedAt()).isNotNull();
    }

    @Test
    void theListFiltersByStatusTypeAndReason() {
        UUID answer = answers.answer(answerAuthor, question, "Use copper").id();
        UUID asked = complaint("question", question, null, "new");
        report(asked, "ads", null, 0);
        UUID answered = complaint("answer", question, answer, "in_progress");
        report(answered, "abuse", null, 0);

        assertThat(ids(service.list("new", null, null, 0, 100))).contains(asked).doesNotContain(answered);
        assertThat(ids(service.list("in_progress", null, null, 0, 100))).contains(answered).doesNotContain(asked);
        assertThat(ids(service.list(null, "answer", null, 0, 100))).contains(answered).doesNotContain(asked);
        assertThat(ids(service.list(null, null, "ads", 0, 100))).contains(asked).doesNotContain(answered);
        assertThat(ids(service.list("new", "answer", null, 0, 100))).doesNotContain(asked, answered);
        assertThat(ids(service.list("resolved", null, null, 0, 100))).doesNotContain(asked, answered);
    }

    @Test
    void theListIsNewestFirstAndPaged() {
        UUID answer = answers.answer(answerAuthor, question, "Use copper").id();
        UUID older = complaint("question", question, null, "new");
        UUID newer = complaint("answer", question, answer, "new");
        jdbc.update("UPDATE community_complaints SET created_at = now() - interval '1 day' WHERE id = ?", older);

        List<UUID> all = ids(service.list(null, null, null, 0, 100));

        assertThat(all.indexOf(newer)).isLessThan(all.indexOf(older));
        assertThat(service.list(null, null, null, 0, 1)).hasSize(1);
    }

    @Test
    void invalidFiltersAndUnknownCaseAreRejected() {
        assertThatThrownBy(() -> service.list("open", null, null, 0, 10)).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo("validation_failed"));
        assertThatThrownBy(() -> service.list(null, "post", null, 0, 10)).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo("validation_failed"));
        assertThatThrownBy(() -> service.list(null, null, "rude", 0, 10)).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo("validation_failed"));
        assertThatThrownBy(() -> service.list(null, null, null, -1, 10)).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo("validation_failed"));
        assertThatThrownBy(() -> service.list(null, null, null, 0, 101)).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo("validation_failed"));
        assertThatThrownBy(() -> service.get(UUID.randomUUID())).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo("complaint_not_found"));
    }

    @Test
    void theNumbersAreCountedFromUtcMidnightAndTheLastSevenDays() {
        // a clock far in the future: no case of any other test falls into its windows
        Instant now = Instant.parse("2090-03-10T15:00:00Z");
        var future = new CommunityModerationService(repository, questions, answerRepository, userAdmin,
                Clock.fixed(now, ZoneOffset.UTC));

        insertAt("new", "2090-03-10T00:00:01Z", null);          // today, new
        insertAt("new", "2090-03-09T23:59:59Z", null);          // yesterday, new
        insertAt("resolved", "2090-03-08T10:00:00Z", "2090-03-08T10:30:00Z");   // 30 min, this week
        insertAt("resolved", "2090-03-07T10:00:00Z", "2090-03-07T11:30:00Z");   // 90 min, this week
        insertAt("resolved", "2090-03-01T10:00:00Z", "2090-03-01T10:10:00Z");   // older than 7 days

        var stats = future.stats();

        assertThat(stats.complaintsToday()).isEqualTo(1);
        assertThat(stats.resolvedThisWeek()).isEqualTo(2);
        assertThat(stats.avgResolutionMinutes()).isEqualTo(60.0);
        assertThat(stats.newComplaints()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void withoutDecisionsTheMeanIsEmpty() {
        var none = new CommunityModerationService(repository, questions, answerRepository, userAdmin,
                Clock.fixed(Instant.parse("2095-01-01T00:00:00Z"), ZoneOffset.UTC));

        assertThat(none.stats().avgResolutionMinutes()).isNull();
        assertThat(none.stats().resolvedThisWeek()).isZero();
    }

    @Test
    void startTakesANewCaseIntoWorkAndIsRepeatable() {
        UUID complaint = complaint("question", question, null, "new");
        report(complaint, "spam", null, 0);

        assertThat(moderation.start(admin, complaint).status()).isEqualTo("in_progress");
        assertThat(moderation.start(admin, complaint).status()).isEqualTo("in_progress");
        assertThat(jdbc.queryForObject("SELECT started_at IS NOT NULL FROM community_complaints WHERE id = ?",
                Boolean.class, complaint)).isTrue();
        resolveKeep(complaint);
        assertCode(() -> moderation.start(admin, complaint), "complaint_resolved");
        assertCode(() -> moderation.start(admin, UUID.randomUUID()), "complaint_not_found");
    }

    @Test
    void keepResolvesWithoutTouchingTheTargetAndASecondDecisionIsAConflict() {
        UUID complaint = complaint("question", question, null, "in_progress");
        report(complaint, "ads", null, 0);

        ComplaintView view = moderation.resolve(admin, complaint, "keep", "  Looks fine ", "en");

        assertThat(view.status()).isEqualTo("resolved");
        assertThat(view.resolution().action()).isEqualTo("keep");
        assertThat(view.resolution().comment()).isEqualTo("Looks fine");
        assertThat(view.target().hidden()).isFalse();
        assertCode(() -> moderation.resolve(admin, complaint, "hide", null, "en"), "complaint_resolved");
        assertThat(questions.findVisible(question)).isPresent();
    }

    @Test
    void hideHidesTheTargetAnswerOnly() {
        UUID answer = answers.answer(answerAuthor, question, "Use copper").id();
        UUID complaint = complaint("answer", question, answer, "new");
        report(complaint, "spam", null, 0);

        moderation.resolve(admin, complaint, "hide", null, "en");

        assertThat(answerRepository.findVisible(question, answer, author)).isEmpty();
        assertThat(questions.findVisible(question)).isPresent();
        assertThat(jdbc.queryForObject("SELECT status FROM users WHERE id = ?", String.class, answerAuthor))
                .isEqualTo("active");
    }

    @Test
    void blockHidesTheTargetBlocksTheAuthorAndRevokesRefreshTokens() {
        UUID complaint = complaint("question", question, null, "new");
        report(complaint, "abuse", null, 0);
        jdbc.update("""
                INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
                VALUES (?, gen_random_uuid(), repeat('a', 64), now() + interval '1 day')""", author);

        moderation.resolve(admin, complaint, "block", "Abuse", "en");

        assertThat(questions.findVisible(question)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT status FROM users WHERE id = ?", String.class, author))
                .isEqualTo("blocked");
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM refresh_tokens WHERE user_id = ?",
                Boolean.class, author)).isTrue();
        assertThat(moderation.get(complaint).author().status()).isEqualTo("blocked");
    }

    @Test
    void blockingAnAdminIsRefusedAndRollsEverythingBack() {
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'admin')", author);
        UUID complaint = complaint("question", question, null, "new");
        report(complaint, "abuse", null, 0);

        assertThatThrownBy(() -> moderation.resolve(admin, complaint, "block", null, "en"))
                .isInstanceOf(ApiException.class);

        assertThat(questions.findVisible(question)).isPresent();
        assertThat(moderation.get(complaint).status()).isEqualTo("new");
        assertThat(jdbc.queryForObject("SELECT status FROM users WHERE id = ?", String.class, author))
                .isEqualTo("active");
        jdbc.update("DELETE FROM user_roles WHERE user_id = ? AND role_code = 'admin'", author);
    }

    @Test
    void anInvalidActionOrLongCommentIsRejectedAndTheCaseStaysOpen() {
        UUID complaint = complaint("question", question, null, "new");

        assertCode(() -> moderation.resolve(admin, complaint, "ban", null, "en"), "validation_failed");
        assertCode(() -> moderation.resolve(admin, complaint, null, null, "en"), "validation_failed");
        assertCode(() -> moderation.resolve(admin, complaint, "keep", "x".repeat(501), "en"), "validation_failed");
        assertCode(() -> moderation.resolve(admin, UUID.randomUUID(), "keep", null, "en"), "complaint_not_found");
        assertThat(moderation.get(complaint).status()).isEqualTo("new");
    }

    @Test
    void hidingTheBestAnswerReopensTheQuestionAndRestoringDoesNotChooseItAgain() {
        UUID answer = answers.answer(answerAuthor, question, "Use copper").id();
        answers.accept(author, question, answer);
        assertThat(questions.find(question).orElseThrow().status()).isEqualTo("solved");

        moderation.setAnswerHidden(admin, answer, true);
        moderation.setAnswerHidden(admin, answer, true);

        assertThat(questions.find(question).orElseThrow().status()).isEqualTo("open");
        assertThat(answerRepository.findVisible(question, answer, author)).isEmpty();

        moderation.setAnswerHidden(admin, answer, false);

        assertThat(answerRepository.findVisible(question, answer, author)).isPresent();
        assertThat(questions.find(question).orElseThrow().status()).isEqualTo("open");
        assertCode(() -> moderation.setAnswerHidden(admin, UUID.randomUUID(), true), "answer_not_found");
    }

    @Test
    void aHiddenQuestionLeavesTheFeedAndRestoringBringsItBack() {
        moderation.setQuestionHidden(admin, question, true);
        moderation.setQuestionHidden(admin, question, true);

        assertThat(questions.feed(CommunityQuestionRepository.Filter.NONE, null, 500))
                .extracting("id").doesNotContain(question);

        moderation.setQuestionHidden(admin, question, false);
        moderation.setQuestionHidden(admin, question, false);

        assertThat(questions.feed(CommunityQuestionRepository.Filter.NONE, null, 500))
                .extracting("id").contains(question);
        assertCode(() -> moderation.setQuestionHidden(admin, UUID.randomUUID(), true), "question_not_found");
    }

    private void resolveKeep(UUID complaint) {
        moderation.resolve(admin, complaint, "keep", null, "en");
    }

    private static void assertCode(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, String code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo(code));
    }

    private void insertAt(String status, String createdAt, String resolvedAt) {
        UUID target = UUID.randomUUID();
        assertThat(questions.insert(target, author, "tomato", null, "Stats", "Body")).isTrue();
        if (resolvedAt == null) {
            jdbc.update("""
                    INSERT INTO community_complaints (target_type, question_id, status, created_at)
                    VALUES ('question', ?, ?, ?::timestamptz)""", target, status, createdAt);
        } else {
            jdbc.update("""
                    INSERT INTO community_complaints (target_type, question_id, status, created_at, resolved_at,
                           resolved_by, action)
                    VALUES ('question', ?, ?, ?::timestamptz, ?::timestamptz, ?, 'keep')""", target, status,
                    createdAt, resolvedAt, admin);
        }
    }

    private UUID complaint(String type, UUID questionId, UUID answerId, String status) {
        return jdbc.queryForObject("""
                INSERT INTO community_complaints (target_type, question_id, answer_id, status, started_at)
                VALUES (?, ?, ?, ?, CASE WHEN ? = 'in_progress' THEN now() END) RETURNING id""", UUID.class,
                type, questionId, answerId, status, status);
    }

    private void report(UUID complaint, String reason, String comment, int secondsAgo) {
        jdbc.update("""
                INSERT INTO community_reports (complaint_id, reporter_id, reason, comment, created_at)
                VALUES (?, ?, ?, ?, now() - make_interval(secs => ?))""", complaint, user(), reason, comment,
                (double) (100 - secondsAgo));
    }

    private static List<UUID> ids(List<ComplaintView> views) {
        return views.stream().map(ComplaintView::id).toList();
    }

    private UUID user() {
        UUID id = jdbc.queryForObject("""
                INSERT INTO users (phone, password_hash, full_name, region_id) VALUES (?, 'x', 'Test', ?)
                RETURNING id""", UUID.class,
                "+77053" + String.format("%09d", Math.abs(UUID.randomUUID().getMostSignificantBits()) % 1_000_000_000L),
                region);
        users.add(id);
        return id;
    }
}
