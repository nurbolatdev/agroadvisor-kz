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

/** The consultations tables (V20); each test rolls back its data. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class ConsultationsMigrationTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void onlyOneOpenConsultationPerPair() {
        UUID farmer = insertUser("+77020000001");
        UUID agrochemist = insertUser("+77020000002");
        UUID first = insertConsultation(farmer, agrochemist, "requested");

        assertRejected(() -> insertConsultation(farmer, agrochemist, "requested"));
        assertRejected(() -> insertConsultation(farmer, agrochemist, "active"));

        jdbc.update("UPDATE consultations SET status = 'closed', closed_at = now() WHERE id = ?", first);
        insertConsultation(farmer, agrochemist, "requested");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM consultations WHERE farmer_id = ?",
                Integer.class, farmer)).isEqualTo(2);
    }

    @Test
    void participantsMustDiffer() {
        UUID user = insertUser("+77020000003");
        assertRejected(() -> insertConsultation(user, user, "requested"));
    }

    @Test
    void statusMustMatchItsDates() {
        UUID farmer = insertUser("+77020000004");
        UUID agrochemist = insertUser("+77020000005");

        assertRejected(() -> jdbc.update("""
                INSERT INTO consultations (farmer_id, agrochemist_id, status) VALUES (?, ?, 'active')
                """, farmer, agrochemist));
        assertRejected(() -> jdbc.update("""
                INSERT INTO consultations (farmer_id, agrochemist_id, status) VALUES (?, ?, 'closed')
                """, farmer, agrochemist));
        assertRejected(() -> jdbc.update("""
                INSERT INTO consultations (farmer_id, agrochemist_id, status) VALUES (?, ?, 'declined')
                """, farmer, agrochemist));
        assertRejected(() -> jdbc.update("""
                INSERT INTO consultations (farmer_id, agrochemist_id, status, closed_at)
                VALUES (?, ?, 'requested', now())
                """, farmer, agrochemist));
        assertRejected(() -> jdbc.update("""
                INSERT INTO consultations (farmer_id, agrochemist_id, status, accepted_at, closed_at)
                VALUES (?, ?, 'active', now(), now())
                """, farmer, agrochemist));
        assertRejected(() -> jdbc.update("""
                INSERT INTO consultations (farmer_id, agrochemist_id, status) VALUES (?, ?, 'archived')
                """, farmer, agrochemist));

        jdbc.update("""
                INSERT INTO consultations (farmer_id, agrochemist_id, status, accepted_at)
                VALUES (?, ?, 'active', now())
                """, farmer, agrochemist);
    }

    @Test
    void messageNeedsTextOrPhoto() {
        UUID farmer = insertUser("+77020000006");
        UUID agrochemist = insertUser("+77020000007");
        UUID consultation = insertConsultation(farmer, agrochemist, "requested");

        assertRejected(() -> jdbc.update(
                "INSERT INTO consultation_messages (consultation_id, sender_id) VALUES (?, ?)",
                consultation, farmer));
        insertMessage(consultation, farmer, "Hello");
        jdbc.update("""
                INSERT INTO consultation_messages (consultation_id, sender_id, photo_key, photo_content_type,
                                                   photo_size_bytes)
                VALUES (?, ?, 'consultations/x/a.jpg', 'image/jpeg', 10)
                """, consultation, farmer);
    }

    @Test
    void messageTextIsTrimmedNotEmptyAndAtMost2000Characters() {
        UUID farmer = insertUser("+77020000008");
        UUID agrochemist = insertUser("+77020000009");
        UUID consultation = insertConsultation(farmer, agrochemist, "requested");

        assertRejected(() -> insertMessage(consultation, farmer, " x"));
        assertRejected(() -> insertMessage(consultation, farmer, "x "));
        assertRejected(() -> insertMessage(consultation, farmer, " "));
        assertRejected(() -> insertMessage(consultation, farmer, "x".repeat(2001)));
        insertMessage(consultation, farmer, "x".repeat(2000));
    }

    @Test
    void messagePhotoFieldsComeTogetherAndAreJpegOrPng() {
        UUID farmer = insertUser("+77020000010");
        UUID agrochemist = insertUser("+77020000011");
        UUID consultation = insertConsultation(farmer, agrochemist, "requested");

        assertRejected(() -> insertPhoto(consultation, farmer, "consultations/x/a.jpg", null, null));
        assertRejected(() -> insertPhoto(consultation, farmer, "consultations/x/a.jpg", "image/jpeg", null));
        assertRejected(() -> insertPhoto(consultation, farmer, "consultations/x/a.gif", "image/gif", 10));
        assertRejected(() -> insertPhoto(consultation, farmer, "consultations/x/a.jpg", "image/jpeg", 0));
        insertPhoto(consultation, farmer, "consultations/x/a.png", "image/png", 10);
    }

    @Test
    void deletingTheFarmerDeletesTheConsultationAndItsMessages() {
        UUID farmer = insertUser("+77020000012");
        UUID agrochemist = insertUser("+77020000013");
        UUID consultation = insertConsultation(farmer, agrochemist, "requested");
        insertMessage(consultation, farmer, "Hello");

        jdbc.update("DELETE FROM users WHERE id = ?", farmer);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM consultations WHERE id = ?",
                Integer.class, consultation)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM consultation_messages WHERE consultation_id = ?",
                Integer.class, consultation)).isZero();
    }

    @Test
    void deletingTheDiagnosisKeepsTheConsultation() {
        UUID farmer = insertUser("+77020000014");
        UUID agrochemist = insertUser("+77020000015");
        UUID diagnosis = jdbc.queryForObject("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version)
                VALUES (?, 'potato', 'diagnoses/test.jpg', 'ok', 'potato__late_blight', 0.9, 'effnet-b0-v1', 1)
                RETURNING id
                """, UUID.class, farmer);
        UUID consultation = jdbc.queryForObject("""
                INSERT INTO consultations (farmer_id, agrochemist_id, diagnosis_id, status)
                VALUES (?, ?, ?, 'requested') RETURNING id
                """, UUID.class, farmer, agrochemist, diagnosis);

        jdbc.update("DELETE FROM diagnoses WHERE id = ?", diagnosis);

        assertThat(jdbc.queryForObject("SELECT diagnosis_id FROM consultations WHERE id = ?",
                UUID.class, consultation)).isNull();
    }

    @Test
    void consultationsAndMessagesAreIndexed() {
        assertThat(jdbc.queryForList("""
                SELECT indexname FROM pg_indexes
                WHERE tablename IN ('consultations', 'consultation_messages') ORDER BY indexname
                """, String.class)).contains(
                "consultations_one_open_per_pair_idx",
                "consultations_farmer_last_message_idx",
                "consultations_agrochemist_status_last_message_idx",
                "consultation_messages_history_idx",
                "consultation_messages_unread_idx",
                "consultation_messages_photo_key_idx");
    }

    private UUID insertUser(String phone) {
        return jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test') RETURNING id",
                UUID.class, phone);
    }

    private UUID insertConsultation(UUID farmer, UUID agrochemist, String status) {
        String accepted = status.equals("active") ? "now()" : "NULL";
        return jdbc.queryForObject("INSERT INTO consultations (farmer_id, agrochemist_id, status, accepted_at) "
                + "VALUES (?, ?, ?, " + accepted + ") RETURNING id", UUID.class, farmer, agrochemist, status);
    }

    private void insertMessage(UUID consultation, UUID sender, String body) {
        jdbc.update("INSERT INTO consultation_messages (consultation_id, sender_id, body) VALUES (?, ?, ?)",
                consultation, sender, body);
    }

    private void insertPhoto(UUID consultation, UUID sender, String key, String contentType, Integer size) {
        jdbc.update("""
                INSERT INTO consultation_messages (consultation_id, sender_id, photo_key, photo_content_type,
                                                   photo_size_bytes)
                VALUES (?, ?, ?, ?, ?)
                """, consultation, sender, key, contentType, size);
    }

    /** The test runs in one transaction, so a rejected statement is rolled back to a savepoint. */
    private void assertRejected(Runnable statement) {
        jdbc.execute("SAVEPOINT rejected");
        assertThatThrownBy(statement::run).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.execute("ROLLBACK TO SAVEPOINT rejected");
    }
}
