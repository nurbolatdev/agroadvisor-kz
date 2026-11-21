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

/** The community invitations (V27); each test rolls back its data. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class CommunityInvitationsMigrationTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void theSameAgrochemistIsInvitedToAQuestionOnlyOnce() {
        UUID author = insertUser("+77040000001");
        UUID admin = insertUser("+77040000002");
        UUID agrochemist = insertUser("+77040000003");
        UUID question = insertQuestion(author);

        insertInvitation(question, agrochemist, admin);

        assertThatThrownBy(() -> {
            jdbc.execute("SAVEPOINT dup");
            try {
                insertInvitation(question, agrochemist, admin);
            } finally {
                jdbc.execute("ROLLBACK TO SAVEPOINT dup");
            }
        }).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("community_invitations_pair_key");

        insertInvitation(question, insertUser("+77040000004"), admin);
        insertInvitation(insertQuestion(author), agrochemist, admin);
    }

    @Test
    void deletingTheQuestionDeletesItsInvitations() {
        UUID author = insertUser("+77040000005");
        UUID admin = insertUser("+77040000006");
        UUID agrochemist = insertUser("+77040000007");
        UUID question = insertQuestion(author);
        insertInvitation(question, agrochemist, admin);

        jdbc.update("DELETE FROM community_questions WHERE id = ?", question);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM community_invitations WHERE agrochemist_id = ?",
                Integer.class, agrochemist)).isZero();
    }

    @Test
    void deletingTheAgrochemistDeletesTheirInvitations() {
        UUID author = insertUser("+77040000008");
        UUID admin = insertUser("+77040000009");
        UUID agrochemist = insertUser("+77040000010");
        UUID question = insertQuestion(author);
        insertInvitation(question, agrochemist, admin);

        jdbc.update("DELETE FROM users WHERE id = ?", agrochemist);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM community_invitations WHERE question_id = ?",
                Integer.class, question)).isZero();
    }

    @Test
    void anInviterWithInvitationsCannotBeDeleted() {
        UUID author = insertUser("+77040000011");
        UUID admin = insertUser("+77040000012");
        UUID agrochemist = insertUser("+77040000013");
        insertInvitation(insertQuestion(author), agrochemist, admin);

        assertRejected(() -> jdbc.update("DELETE FROM users WHERE id = ?", admin));
    }

    @Test
    void invitationNotificationPointsOnlyToAQuestion() {
        UUID author = insertUser("+77040000014");
        UUID agrochemist = insertUser("+77040000015");
        UUID question = insertQuestion(author);
        UUID answer = jdbc.queryForObject(
                "INSERT INTO community_answers (question_id, author_id, body) VALUES (?, ?, 'Answer') RETURNING id",
                UUID.class, question, author);

        assertRejected(() -> insertNotification(agrochemist, null, null));
        assertRejected(() -> insertNotification(agrochemist, question, answer));
        assertRejected(() -> insertNotification(agrochemist, null, answer));

        insertNotification(agrochemist, question, null);
        insertNotification(agrochemist, insertQuestion(author), null);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id = ?",
                Integer.class, agrochemist)).isEqualTo(2);
    }

    @Test
    void invitationsAreIndexedByAgrochemist() {
        assertThat(jdbc.queryForList(
                "SELECT indexname FROM pg_indexes WHERE tablename = 'community_invitations'", String.class))
                .contains("community_invitations_agrochemist_idx");
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

    private void insertInvitation(UUID question, UUID agrochemist, UUID invitedBy) {
        jdbc.update("INSERT INTO community_invitations (question_id, agrochemist_id, invited_by) VALUES (?, ?, ?)",
                question, agrochemist, invitedBy);
    }

    private void insertNotification(UUID recipient, UUID question, UUID answer) {
        jdbc.update("""
                INSERT INTO notifications (recipient_id, type, question_id, answer_id)
                VALUES (?, 'community_invitation', ?, ?)
                """, recipient, question, answer);
    }

    /** The test runs in one transaction, so a rejected statement is rolled back to a savepoint. */
    private void assertRejected(Runnable statement) {
        jdbc.execute("SAVEPOINT rejected");
        assertThatThrownBy(statement::run).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.execute("ROLLBACK TO SAVEPOINT rejected");
    }
}
