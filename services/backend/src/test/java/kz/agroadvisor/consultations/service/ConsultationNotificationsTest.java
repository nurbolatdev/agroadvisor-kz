package kz.agroadvisor.consultations.service;

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
import org.springframework.transaction.support.TransactionTemplate;

import kz.agroadvisor.consultations.repository.ConsultationRepository;

/** Feed notifications of consultation changes. Real commits; the users (and their feeds) are removed after. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ConsultationNotificationsTest {

    @Autowired
    private ConsultationService service;
    @Autowired
    private ConsultationMessageService messageService;
    @Autowired
    private ConsultationRepository repository;
    @Autowired
    private ConsultationEvents events;
    @Autowired
    private NotificationService notifications;
    @Autowired
    private TransactionTemplate tx;
    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> users = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        users.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void aRequestNotifiesTheAgrochemistOnly() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist();

        UUID id = service.request(farmer, agrochemist, "Help", null).consultation().id();

        List<Notification> feed = feed(agrochemist);
        assertThat(feed).hasSize(1);
        assertThat(feed.get(0).type()).isEqualTo(NotificationType.CONSULTATION_REQUESTED);
        assertThat(feed.get(0).consultationId()).isEqualTo(id);
        assertThat(feed(farmer)).isEmpty();
    }

    @Test
    void acceptAndDeclineNotifyTheFarmer() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist();
        UUID accepted = service.request(farmer, agrochemist, "Help", null).consultation().id();
        service.accept(agrochemist, accepted);

        assertThat(feed(farmer)).extracting(Notification::type).containsExactly(NotificationType.CONSULTATION_ACCEPTED);

        UUID otherFarmer = farmer();
        UUID declined = service.request(otherFarmer, agrochemist, "Help", null).consultation().id();
        service.decline(agrochemist, declined);

        assertThat(feed(otherFarmer)).extracting(Notification::type)
                .containsExactly(NotificationType.CONSULTATION_DECLINED);
        assertThat(feed(otherFarmer).get(0).consultationId()).isEqualTo(declined);
    }

    @Test
    void withdrawingARequestNotifiesTheAgrochemist() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist();
        UUID id = service.request(farmer, agrochemist, "Help", null).consultation().id();

        service.close(farmer, id);

        assertThat(feed(agrochemist)).extracting(Notification::type)
                .containsExactlyInAnyOrder(NotificationType.CONSULTATION_REQUESTED,
                        NotificationType.CONSULTATION_CLOSED);
        assertThat(feed(farmer)).isEmpty();
    }

    @Test
    void closingAnActiveConsultationNotifiesTheOtherSide() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist();
        UUID id = service.request(farmer, agrochemist, "Help", null).consultation().id();
        service.accept(agrochemist, id);

        service.close(agrochemist, id);

        assertThat(feed(farmer)).extracting(Notification::type)
                .containsExactlyInAnyOrder(NotificationType.CONSULTATION_ACCEPTED,
                        NotificationType.CONSULTATION_CLOSED);
        assertThat(feed(agrochemist)).extracting(Notification::type)
                .containsExactly(NotificationType.CONSULTATION_REQUESTED);
    }

    @Test
    void messagesCollapseIntoOneUnreadNotificationForTheOtherSide() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist();
        UUID id = active(farmer, agrochemist);

        messageService.send(farmer, id, "one");
        messageService.send(farmer, id, "two");
        UUID last = messageService.send(farmer, id, "three").id();

        List<Notification> messages = feed(agrochemist).stream()
                .filter(n -> n.type() == NotificationType.CONSULTATION_MESSAGE).toList();
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).count()).isEqualTo(3);
        assertThat(messages.get(0).messageId()).isEqualTo(last);
        assertThat(messages.get(0).readAt()).isNull();
        assertThat(feed(farmer)).extracting(Notification::type)
                .containsExactly(NotificationType.CONSULTATION_ACCEPTED);
    }

    @Test
    void aPhotoMessageCollapsesIntoTheSameRow() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist();
        UUID id = active(farmer, agrochemist);
        messageService.send(farmer, id, "text");

        // The upload needs object storage, so the row and the event are made the way the photo path does it
        UUID photo = tx.execute(status -> {
            var row = repository.lock(id).orElseThrow();
            UUID inserted = repository.insertPhotoMessage(id, farmer, "leaf", "consultations/" + id + "/a.jpg",
                    "image/jpeg", 8);
            events.messageCreated(row, farmer, inserted);
            return inserted;
        });

        List<Notification> messages = feed(agrochemist).stream()
                .filter(n -> n.type() == NotificationType.CONSULTATION_MESSAGE).toList();
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).count()).isEqualTo(2);
        assertThat(messages.get(0).messageId()).isEqualTo(photo);
    }

    @Test
    void aRefusedTransitionCreatesNoNotification() {
        UUID farmer = farmer();
        UUID agrochemist = agrochemist();
        UUID id = service.request(farmer, agrochemist, "Help", null).consultation().id();
        service.decline(agrochemist, id);
        int before = feed(farmer).size();

        assertThatThrownBy(() -> service.accept(agrochemist, id)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.close(farmer, id)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> messageService.send(farmer, id, "late")).isInstanceOf(ApiException.class);

        assertThat(feed(farmer)).hasSize(before);
        assertThat(feed(agrochemist)).extracting(Notification::type)
                .containsExactly(NotificationType.CONSULTATION_REQUESTED);
    }

    private UUID active(UUID farmer, UUID agrochemist) {
        UUID id = service.request(farmer, agrochemist, "Help", null).consultation().id();
        service.accept(agrochemist, id);
        return id;
    }

    private List<Notification> feed(UUID user) {
        return notifications.list(user, false, 0, 50);
    }

    private UUID farmer() {
        UUID id = user("farmer");
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'farmer')", id);
        return id;
    }

    private UUID agrochemist() {
        UUID id = user("agrochemist");
        jdbc.update("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'agrochemist')", id);
        jdbc.update("""
                INSERT INTO agrochemist_profiles (user_id, specialization, experience_years, verification_status)
                VALUES (?, 'plant_protection', 5, 'approved')""", id);
        return id;
    }

    private UUID user(String name) {
        UUID id = jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', ?) RETURNING id",
                UUID.class, "+7" + (7_000_000_000L + Math.floorMod(UUID.randomUUID().getLeastSignificantBits(),
                        1_000_000_000L)), "Test " + name);
        users.add(id);
        return id;
    }
}
