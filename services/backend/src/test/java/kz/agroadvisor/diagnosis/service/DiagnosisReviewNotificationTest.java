package kz.agroadvisor.diagnosis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.notifications.model.NotificationType;
import kz.agroadvisor.notifications.repository.NotificationRepository.Notification;
import kz.agroadvisor.notifications.service.NotificationService;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** The farmer's feed after verdicts on their diagnosis. Real commits; the users are removed after. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class DiagnosisReviewNotificationTest {

    @Autowired
    private DiagnosisReviewService service;
    @Autowired
    private NotificationService notifications;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> users = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        users.forEach(id -> jdbc.update("DELETE FROM diagnosis_reviews WHERE reviewer_id = ?", id));
        users.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void twoVerdictsCollapseIntoOneUnreadNotificationForTheFarmer() {
        UUID farmer = user();
        UUID agrochemist = user();
        UUID admin = user();
        UUID diagnosis = diagnosis(farmer);

        service.review(agrochemist, diagnosis, "confirmed", null, null);
        service.review(admin, diagnosis, "confirmed", null, null);

        List<Notification> feed = notifications.list(farmer, false, 0, 50);
        assertThat(feed).hasSize(1);
        assertThat(feed.get(0).type()).isEqualTo(NotificationType.DIAGNOSIS_REVIEWED);
        assertThat(feed.get(0).diagnosisId()).isEqualTo(diagnosis);
        assertThat(feed.get(0).count()).isEqualTo(2);
        assertThat(feed.get(0).readAt()).isNull();
        assertThat(notifications.list(agrochemist, false, 0, 50)).isEmpty();
        assertThat(notifications.list(admin, false, 0, 50)).isEmpty();
    }

    @Test
    void aRefusedVerdictCreatesNoNotification() {
        UUID farmer = user();
        UUID reviewer = user();
        UUID diagnosis = diagnosis(farmer);

        assertThatThrownBy(() -> service.review(reviewer, diagnosis, "unclear", "potato__healthy", null))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.review(reviewer, diagnosis, "maybe", null, null))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.review(farmer, diagnosis, "confirmed", null, null))
                .isInstanceOf(ApiException.class);

        assertThat(notifications.list(farmer, false, 0, 50)).isEmpty();
    }

    private UUID diagnosis(UUID farmer) {
        return jdbc.queryForObject("""
                INSERT INTO diagnoses (user_id, crop_code, photo_key, status, top1_code, top1_confidence,
                                       model_version, classes_version)
                VALUES (?, 'potato', 'diagnoses/test.jpg', 'ok', 'potato__late_blight', 0.9, 'effnet-b0-v1', 1)
                RETURNING id
                """, UUID.class, farmer);
    }

    private UUID user() {
        UUID id = jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test user') RETURNING id",
                UUID.class, "+7" + (7_000_000_000L + Math.floorMod(UUID.randomUUID().getLeastSignificantBits(),
                        1_000_000_000L)));
        users.add(id);
        return id;
    }
}
