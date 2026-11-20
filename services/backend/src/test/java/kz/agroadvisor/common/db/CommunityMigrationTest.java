package kz.agroadvisor.common.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/** The community tables (V25); each test rolls back its data. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class CommunityMigrationTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void bestAnswerMustBelongToTheQuestion() {
        UUID author = insertUser("+77030000001");
        UUID first = insertQuestion(author);
        UUID second = insertQuestion(author);
        UUID answerOfSecond = insertAnswer(second, author);

        assertRejected(() -> jdbc.update(
                "UPDATE community_questions SET accepted_answer_id = ? WHERE id = ?", answerOfSecond, first));
        jdbc.update("UPDATE community_questions SET accepted_answer_id = ? WHERE id = ?", answerOfSecond, second);
        assertThat(statusOf(second)).isEqualTo("solved");
    }

    @Test
    void deletingTheBestAnswerReopensTheQuestion() {
        UUID author = insertUser("+77030000002");
        UUID question = insertQuestion(author);
        UUID answer = insertAnswer(question, author);
        jdbc.update("UPDATE community_questions SET accepted_answer_id = ? WHERE id = ?", answer, question);
        assertThat(statusOf(question)).isEqualTo("solved");

        jdbc.update("DELETE FROM community_answers WHERE id = ?", answer);

        assertThat(jdbc.queryForObject("SELECT accepted_answer_id FROM community_questions WHERE id = ?",
                UUID.class, question)).isNull();
        assertThat(statusOf(question)).isEqualTo("open");
    }

    @Test
    void secondOpenComplaintOnTheSameTargetIsRejectedUntilTheFirstIsResolved() {
        UUID author = insertUser("+77030000003");
        UUID admin = insertUser("+77030000004");
        UUID question = insertQuestion(author);
        UUID answer = insertAnswer(question, author);

        UUID first = insertComplaint(question, null);
        assertRejected(() -> insertComplaint(question, null));
        jdbc.update("UPDATE community_complaints SET status = 'in_progress', started_at = now() WHERE id = ?",
                first);
        assertRejected(() -> insertComplaint(question, null));
        jdbc.update("""
                UPDATE community_complaints SET status = 'resolved', resolved_at = now(), resolved_by = ?,
                                                action = 'keep'
                WHERE id = ?
                """, admin, first);
        insertComplaint(question, null);

        insertComplaint(question, answer);
        assertRejected(() -> insertComplaint(question, answer));
    }

    @Test
    void complaintTargetAndResolutionAreConsistent() {
        UUID author = insertUser("+77030000005");
        UUID question = insertQuestion(author);
        UUID other = insertQuestion(author);
        UUID answerOfOther = insertAnswer(other, author);

        assertRejected(() -> jdbc.update(
                "INSERT INTO community_complaints (target_type, question_id) VALUES ('answer', ?)", question));
        assertRejected(() -> jdbc.update("""
                INSERT INTO community_complaints (target_type, question_id, answer_id) VALUES ('question', ?, ?)
                """, other, answerOfOther));
        assertRejected(() -> insertComplaint(question, answerOfOther));
        assertRejected(() -> jdbc.update(
                "INSERT INTO community_complaints (target_type, question_id, status) VALUES ('question', ?, 'resolved')",
                question));
    }

    @Test
    void complaintCommentIsNotBlankAndAWorkingCaseHasAStartTime() {
        UUID author = insertUser("+77030000013");
        UUID question = insertQuestion(author);
        UUID complaint = insertComplaint(question, null);

        assertRejected(() -> jdbc.update("UPDATE community_complaints SET comment = '  ' WHERE id = ?", complaint));
        assertRejected(() -> jdbc.update("UPDATE community_complaints SET comment = '' WHERE id = ?", complaint));
        assertRejected(() -> jdbc.update(
                "UPDATE community_complaints SET comment = ' padded ' WHERE id = ?", complaint));
        jdbc.update("UPDATE community_complaints SET comment = 'Spam' WHERE id = ?", complaint);

        assertRejected(() -> jdbc.update(
                "UPDATE community_complaints SET status = 'in_progress' WHERE id = ?", complaint));
        jdbc.update("UPDATE community_complaints SET status = 'in_progress', started_at = now() WHERE id = ?",
                complaint);
    }

    @Test
    void complaintsAreIndexedByQuestion() {
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM pg_indexes
                WHERE tablename = 'community_complaints' AND indexname = 'community_complaints_question_idx'
                """, Integer.class)).isEqualTo(1);
    }

    @Test
    void voteValueIsPlusOrMinusOne() {
        UUID author = insertUser("+77030000006");
        UUID voter = insertUser("+77030000007");
        UUID answer = insertAnswer(insertQuestion(author), author);

        assertRejected(() -> insertVote(answer, voter, 2));
        assertRejected(() -> insertVote(answer, voter, 0));
        insertVote(answer, voter, -1);
        assertRejected(() -> insertVote(answer, voter, 1));
    }

    @Test
    void sameUserCannotReportTheSameCaseTwice() {
        UUID author = insertUser("+77030000008");
        UUID reporter = insertUser("+77030000009");
        UUID complaint = insertComplaint(insertQuestion(author), null);

        insertReport(complaint, reporter, "spam");
        assertRejected(() -> insertReport(complaint, reporter, "ads"));
        assertRejected(() -> insertReport(complaint, insertUser("+77030000010"), "other"));
    }

    @Test
    void hiddenColumnsComeTogetherAndPhotoPositionIsFromZeroToTwo() {
        UUID author = insertUser("+77030000011");
        UUID question = insertQuestion(author);

        assertRejected(() -> jdbc.update("UPDATE community_questions SET hidden_at = now() WHERE id = ?", question));
        jdbc.update("UPDATE community_questions SET hidden_at = now(), hidden_by = ? WHERE id = ?",
                author, question);

        insertPhoto(question, 2, "image/png");
        assertRejected(() -> insertPhoto(question, 3, "image/png"));
        assertRejected(() -> insertPhoto(question, 2, "image/png"));
        assertRejected(() -> insertPhoto(question, 1, "image/gif"));
    }

    @Test
    void deletingTheDiagnosisKeepsTheQuestionAndDeletingTheAuthorDeletesIt() {
        UUID author = insertUser("+77030000012");
        UUID diagnosis = jdbc.queryForObject("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version)
                VALUES (?, 'potato', 'diagnoses/test.jpg', 'ok', 'potato__late_blight', 0.9, 'effnet-b0-v1', 1)
                RETURNING id
                """, UUID.class, author);
        UUID question = jdbc.queryForObject("""
                INSERT INTO community_questions (author_id, crop_code, region_id, diagnosis_id, title, body)
                VALUES (?, 'potato', (SELECT min(id) FROM regions), ?, 'Title', 'Body') RETURNING id
                """, UUID.class, author, diagnosis);

        jdbc.update("DELETE FROM diagnoses WHERE id = ?", diagnosis);
        assertThat(jdbc.queryForObject("SELECT diagnosis_id FROM community_questions WHERE id = ?",
                UUID.class, question)).isNull();

        jdbc.update("DELETE FROM users WHERE id = ?", author);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM community_questions WHERE id = ?",
                Integer.class, question)).isZero();
    }

    private String statusOf(UUID question) {
        return jdbc.queryForObject("SELECT status FROM community_questions WHERE id = ?", String.class, question);
    }

    private UUID insertUser(String phone) {
        return jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test') RETURNING id",
                UUID.class, phone);
    }

    private UUID insertQuestion(UUID author) {
        return jdbc.queryForObject("""
                INSERT INTO community_questions (author_id, crop_code, region_id, title, body)
                VALUES (?, 'potato', (SELECT min(id) FROM regions), 'Title', 'Body') RETURNING id
                """, UUID.class, author);
    }

    private UUID insertAnswer(UUID question, UUID author) {
        return jdbc.queryForObject(
                "INSERT INTO community_answers (question_id, author_id, body) VALUES (?, ?, 'Answer') RETURNING id",
                UUID.class, question, author);
    }

    private UUID insertComplaint(UUID question, UUID answer) {
        return jdbc.queryForObject("""
                INSERT INTO community_complaints (target_type, question_id, answer_id)
                VALUES (?, ?, ?) RETURNING id
                """, UUID.class, answer == null ? "question" : "answer", question, answer);
    }

    private void insertVote(UUID answer, UUID user, int value) {
        jdbc.update("INSERT INTO community_votes (answer_id, user_id, value) VALUES (?, ?, ?)", answer, user, value);
    }

    private void insertReport(UUID complaint, UUID reporter, String reason) {
        jdbc.update("INSERT INTO community_reports (complaint_id, reporter_id, reason) VALUES (?, ?, ?)",
                complaint, reporter, reason);
    }

    private void insertPhoto(UUID question, int position, String contentType) {
        jdbc.update("""
                INSERT INTO community_question_photos (question_id, photo_key, content_type, size_bytes, position)
                VALUES (?, ?, ?, 10, ?)
                """, question, "community/x/" + position + ".png", contentType, position);
    }

    /** The test runs in one transaction, so a rejected statement is rolled back to a savepoint. */
    private void assertRejected(Runnable statement) {
        jdbc.execute("SAVEPOINT rejected");
        assertThatThrownBy(statement::run).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.execute("ROLLBACK TO SAVEPOINT rejected");
    }
}
