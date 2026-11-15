package kz.agroadvisor.verification.service;

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

/** The agrochemist's feed after the admin's decision. Real commits; the users are removed after. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AgrochemistDecisionNotificationTest {

    @Autowired
    private AgrochemistReviewService service;
    @Autowired
    private NotificationService notifications;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> users = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        // The profiles point to the admin who decided, so they go first
        users.forEach(id -> jdbc.update("DELETE FROM agrochemist_profiles WHERE user_id = ?", id));
        users.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void eachDecisionGivesTheAgrochemistItsOwnType() {
        UUID admin = user();
        UUID approved = agrochemist(true);
        UUID rejected = agrochemist(true);
        UUID requested = agrochemist(true);

        service.decide(admin, approved, "approve", null);
        service.decide(admin, rejected, "reject", "Blurred scan");
        service.decide(admin, requested, "request_documents", "Send the diploma");

        assertThat(feed(approved)).extracting(Notification::type)
                .containsExactly(NotificationType.VERIFICATION_APPROVED);
        assertThat(feed(rejected)).extracting(Notification::type)
                .containsExactly(NotificationType.VERIFICATION_REJECTED);
        assertThat(feed(requested)).extracting(Notification::type)
                .containsExactly(NotificationType.VERIFICATION_DOCUMENTS_REQUESTED);
        assertThat(feed(approved).get(0).consultationId()).isNull();
        assertThat(feed(admin)).isEmpty();
    }

    @Test
    void aRefusedDecisionCreatesNoNotification() {
        UUID admin = user();
        UUID withDocument = agrochemist(true);
        UUID withoutDocument = agrochemist(false);

        assertThatThrownBy(() -> service.decide(admin, withDocument, "reject", " "))
                .isInstanceOf(ApiException.class).hasMessageContaining("reason");
        assertThatThrownBy(() -> service.decide(admin, withoutDocument, "approve", null))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.decide(admin, withDocument, "maybe", null))
                .isInstanceOf(ApiException.class);

        assertThat(feed(withDocument)).isEmpty();
        assertThat(feed(withoutDocument)).isEmpty();
    }

    private List<Notification> feed(UUID user) {
        return notifications.list(user, false, 0, 50);
    }

    private UUID agrochemist(boolean withDocument) {
        UUID id = user();
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'agrochemist')", id);
        jdbc.update("INSERT INTO agrochemist_profiles (user_id, specialization) VALUES (?, 'agronomist')", id);
        if (withDocument) {
            jdbc.update("""
                    INSERT INTO agrochemist_documents (user_id, kind, object_key, title, content_type, size_bytes)
                    VALUES (?, 'diploma', 'agrochemist-documents/x/d.pdf', 'Diploma', 'application/pdf', 5)""", id);
        }
        return id;
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
