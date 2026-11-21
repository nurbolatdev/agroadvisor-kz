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

/** The push token and notification tables (V21, V26); each test rolls back its data. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class NotificationsMigrationTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void pushTokenIsUniqueAcrossUsers() {
        UUID first = insertUser("+77030000001");
        UUID second = insertUser("+77030000002");
        insertToken(first, "token-1", "android");

        assertThatThrownBy(() -> {
            jdbc.execute("SAVEPOINT dup");
            try {
                insertToken(second, "token-1", "ios");
            } finally {
                jdbc.execute("ROLLBACK TO SAVEPOINT dup");
            }
        }).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("push_tokens_token_key");
    }

    @Test
    void pushTokenPlatformAndShapeAreChecked() {
        UUID user = insertUser("+77030000003");

        assertRejected(() -> insertToken(user, "token-2", "web"));
        assertRejected(() -> insertToken(user, "has space", "android"));
        assertRejected(() -> insertToken(user, "", "android"));
        insertToken(user, "ExponentPushToken[abc-123]", "expo");
        insertToken(user, "token-3", "ios");
    }

    @Test
    void unknownNotificationTypeIsRejected() {
        UUID user = insertUser("+77030000004");
        assertRejected(() -> insertNotification(user, "consultation_updated", null, null, null, null));
    }

    @Test
    void referencesMustMatchTheType() {
        UUID farmer = insertUser("+77030000005");
        UUID agrochemist = insertUser("+77030000006");
        UUID consultation = insertConsultation(farmer, agrochemist);
        UUID message = insertMessage(consultation, farmer);
        UUID diagnosis = insertDiagnosis(farmer);

        assertRejected(() -> insertNotification(agrochemist, "consultation_message", consultation, null, null, null));
        assertRejected(() -> insertNotification(agrochemist, "verification_approved", consultation, null, null, null));
        assertRejected(() -> insertNotification(agrochemist, "consultation_requested", null, null, null, null));
        assertRejected(() -> insertNotification(farmer, "diagnosis_reviewed", null, null, null, null));
        assertRejected(() -> insertNotification(farmer, "diagnosis_reviewed", consultation, null, diagnosis, null));

        insertNotification(agrochemist, "consultation_message", consultation, message, null, null);
        insertNotification(agrochemist, "consultation_requested", consultation, null, null, null);
        insertNotification(agrochemist, "verification_approved", null, null, null, null);
        insertNotification(farmer, "diagnosis_reviewed", null, null, diagnosis, null);
    }

    @Test
    void communityReferencesMustMatchTheType() {
        UUID author = insertUser("+77030000014");
        UUID other = insertUser("+77030000015");
        UUID question = jdbc.queryForObject("""
                INSERT INTO community_questions (author_id, crop_code, region_id, title, body)
                VALUES (?, 'potato', (SELECT min(id) FROM regions), 'Title', 'Body') RETURNING id
                """, UUID.class, author);
        UUID answer = jdbc.queryForObject(
                "INSERT INTO community_answers (question_id, author_id, body) VALUES (?, ?, 'Answer') RETURNING id",
                UUID.class, question, other);
        UUID diagnosis = insertDiagnosis(author);

        assertRejected(() -> insertCommunity(author, "community_answer", question, null));
        assertRejected(() -> insertCommunity(author, "community_answer", null, answer));
        assertRejected(() -> insertCommunity(other, "community_answer_accepted", question, null));
        assertRejected(() -> insertCommunity(author, "community_question", null, null));
        assertRejected(() -> insertCommunity(author, "community_question", question, answer));
        assertRejected(() -> insertCommunity(author, "verification_approved", question, null));
        assertRejected(() -> insertCommunity(author, "consultation_requested", question, null));
        assertRejected(() -> jdbc.update("""
                INSERT INTO notifications (recipient_id, type, diagnosis_id, question_id)
                VALUES (?, 'community_question', ?, ?)
                """, author, diagnosis, question));

        insertCommunity(author, "community_answer", question, answer);
        insertCommunity(other, "community_answer_accepted", question, answer);
        insertCommunity(other, "community_question", question, null);

        jdbc.update("DELETE FROM community_questions WHERE id = ?", question);
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM notifications WHERE recipient_id IN (?, ?)", Integer.class, author, other))
                .isZero();
    }

    @Test
    void deletingAnAnswerDeletesItsNotifications() {
        UUID author = insertUser("+77030000016");
        UUID other = insertUser("+77030000017");
        UUID question = jdbc.queryForObject("""
                INSERT INTO community_questions (author_id, crop_code, region_id, title, body)
                VALUES (?, 'potato', (SELECT min(id) FROM regions), 'Title', 'Body') RETURNING id
                """, UUID.class, author);
        UUID answer = jdbc.queryForObject(
                "INSERT INTO community_answers (question_id, author_id, body) VALUES (?, ?, 'Answer') RETURNING id",
                UUID.class, question, other);
        insertCommunity(author, "community_answer", question, answer);

        jdbc.update("DELETE FROM community_answers WHERE id = ?", answer);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id = ?",
                Integer.class, author)).isZero();
    }

    @Test
    void onlyOneUnreadNotificationPerCollapseKey() {
        UUID user = insertUser("+77030000007");

        insertNotification(user, "verification_approved", null, null, null, "key-1");
        assertRejected(() -> insertNotification(user, "verification_approved", null, null, null, "key-1"));

        jdbc.update("UPDATE notifications SET read_at = now() WHERE recipient_id = ?", user);
        insertNotification(user, "verification_approved", null, null, null, "key-1");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id = ?",
                Integer.class, user)).isEqualTo(2);
    }

    @Test
    void rowsWithoutCollapseKeyNeverConflict() {
        UUID user = insertUser("+77030000008");
        insertNotification(user, "verification_approved", null, null, null, null);
        insertNotification(user, "verification_approved", null, null, null, null);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id = ?",
                Integer.class, user)).isEqualTo(2);
    }

    @Test
    void eventCountMustBePositive() {
        UUID user = insertUser("+77030000009");
        assertRejected(() -> jdbc.update("""
                INSERT INTO notifications (recipient_id, type, event_count)
                VALUES (?, 'verification_approved', 0)
                """, user));
    }

    @Test
    void deletingTheUserDeletesTokensAndNotifications() {
        UUID user = insertUser("+77030000010");
        insertToken(user, "token-4", "android");
        insertNotification(user, "verification_approved", null, null, null, null);

        jdbc.update("DELETE FROM users WHERE id = ?", user);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM push_tokens WHERE user_id = ?",
                Integer.class, user)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id = ?",
                Integer.class, user)).isZero();
    }

    @Test
    void deletingTheDiagnosisDeletesItsNotification() {
        UUID farmer = insertUser("+77030000011");
        UUID diagnosis = insertDiagnosis(farmer);
        insertNotification(farmer, "diagnosis_reviewed", null, null, diagnosis, null);

        jdbc.update("DELETE FROM diagnoses WHERE id = ?", diagnosis);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id = ?",
                Integer.class, farmer)).isZero();
    }

    @Test
    void deletingTheConsultationDeletesItsNotifications() {
        UUID farmer = insertUser("+77030000012");
        UUID agrochemist = insertUser("+77030000013");
        UUID consultation = insertConsultation(farmer, agrochemist);
        insertNotification(agrochemist, "consultation_requested", consultation, null, null, null);

        jdbc.update("DELETE FROM consultations WHERE id = ?", consultation);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE recipient_id = ?",
                Integer.class, agrochemist)).isZero();
    }

    @Test
    void notificationsAndTokensAreIndexed() {
        assertThat(jdbc.queryForList("""
                SELECT indexname FROM pg_indexes
                WHERE tablename IN ('push_tokens', 'notifications') ORDER BY indexname
                """, String.class)).contains(
                "push_tokens_user_updated_idx",
                "notifications_feed_idx",
                "notifications_unread_idx",
                "notifications_collapse_idx",
                "notifications_consultation_idx",
                "notifications_message_idx",
                "notifications_diagnosis_idx",
                "notifications_question_idx",
                "notifications_answer_idx");
    }

    @Test
    void notificationTimestampsDefaultToTheClockTime() {
        assertThat(jdbc.queryForList("""
                SELECT column_default FROM information_schema.columns
                WHERE table_name = 'notifications' AND column_name IN ('created_at', 'updated_at')
                """, String.class)).hasSize(2).allSatisfy(d -> assertThat(d).contains("clock_timestamp()"));
    }

    private UUID insertUser(String phone) {
        return jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test') RETURNING id",
                UUID.class, phone);
    }

    private void insertToken(UUID user, String token, String platform) {
        jdbc.update("INSERT INTO push_tokens (user_id, token, platform) VALUES (?, ?, ?)", user, token, platform);
    }

    private void insertNotification(UUID recipient, String type, UUID consultation, UUID message, UUID diagnosis,
                                    String collapseKey) {
        jdbc.update("""
                INSERT INTO notifications (recipient_id, type, consultation_id, message_id, diagnosis_id,
                                           collapse_key)
                VALUES (?, ?, ?, ?, ?, ?)
                """, recipient, type, consultation, message, diagnosis, collapseKey);
    }

    private void insertCommunity(UUID recipient, String type, UUID question, UUID answer) {
        jdbc.update("INSERT INTO notifications (recipient_id, type, question_id, answer_id) VALUES (?, ?, ?, ?)",
                recipient, type, question, answer);
    }

    private UUID insertConsultation(UUID farmer, UUID agrochemist) {
        return jdbc.queryForObject("""
                INSERT INTO consultations (farmer_id, agrochemist_id, status) VALUES (?, ?, 'requested')
                RETURNING id
                """, UUID.class, farmer, agrochemist);
    }

    private UUID insertMessage(UUID consultation, UUID sender) {
        return jdbc.queryForObject("""
                INSERT INTO consultation_messages (consultation_id, sender_id, body) VALUES (?, ?, 'Hello')
                RETURNING id
                """, UUID.class, consultation, sender);
    }

    private UUID insertDiagnosis(UUID user) {
        return jdbc.queryForObject("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version)
                VALUES (?, 'potato', 'diagnoses/test.jpg', 'ok', 'potato__late_blight', 0.9, 'effnet-b0-v1', 1)
                RETURNING id
                """, UUID.class, user);
    }

    /** The test runs in one transaction, so a rejected statement is rolled back to a savepoint. */
    private void assertRejected(Runnable statement) {
        jdbc.execute("SAVEPOINT rejected");
        assertThatThrownBy(statement::run).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.execute("ROLLBACK TO SAVEPOINT rejected");
    }
}
