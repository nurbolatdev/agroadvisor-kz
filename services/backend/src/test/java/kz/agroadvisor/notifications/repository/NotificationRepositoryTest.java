package kz.agroadvisor.notifications.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.notifications.model.NotificationType;
import kz.agroadvisor.notifications.repository.NotificationRepository.Notification;
import kz.agroadvisor.notifications.repository.NotificationRepository.Refs;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
class NotificationRepositoryTest {

    @Autowired
    private NotificationRepository repository;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID farmer;
    private UUID agrochemist;
    private UUID consultation;
    private int seq;

    @BeforeEach
    void setUp() {
        farmer = user();
        agrochemist = user();
        consultation = jdbc.queryForObject("""
                INSERT INTO consultations (farmer_id, agrochemist_id, status) VALUES (?, ?, 'requested')
                RETURNING id""", UUID.class, farmer, agrochemist);
    }

    @Test
    void typeCodesRoundTrip() {
        for (NotificationType type : NotificationType.values()) {
            assertThat(NotificationType.fromCode(type.code())).isEqualTo(type);
            assertThat(type.code()).isEqualTo(type.name().toLowerCase());
        }
    }

    @Test
    void collapsingKeyMergesUnreadRowsIntoOne() {
        UUID first = message();
        UUID second = message();
        String key = "consultation_message:" + consultation;

        Notification a = repository.insertOrCollapse(agrochemist, NotificationType.CONSULTATION_MESSAGE,
                new Refs(consultation, first, null), key);
        Notification b = repository.insertOrCollapse(agrochemist, NotificationType.CONSULTATION_MESSAGE,
                new Refs(consultation, second, null), key);

        assertThat(a.count()).isEqualTo(1);
        assertThat(b.id()).isEqualTo(a.id());
        assertThat(b.count()).isEqualTo(2);
        assertThat(b.messageId()).isEqualTo(second);
        assertThat(b.updatedAt()).isAfter(a.updatedAt());
        assertThat(b.createdAt()).isEqualTo(a.createdAt());
        assertThat(repository.list(agrochemist, false, 10, 0)).hasSize(1);
    }

    @Test
    void readRowIsNotCollapsedInto() {
        String key = "consultation_message:" + consultation;
        Notification a = repository.insertOrCollapse(agrochemist, NotificationType.CONSULTATION_MESSAGE,
                new Refs(consultation, message(), null), key);
        assertThat(repository.markRead(agrochemist, a.id())).isTrue();

        Notification c = repository.insertOrCollapse(agrochemist, NotificationType.CONSULTATION_MESSAGE,
                new Refs(consultation, message(), null), key);

        assertThat(c.id()).isNotEqualTo(a.id());
        assertThat(c.count()).isEqualTo(1);
        assertThat(repository.list(agrochemist, false, 10, 0)).hasSize(2);
    }

    @Test
    void rowsWithoutKeyNeverCollapse() {
        repository.insertOrCollapse(agrochemist, NotificationType.VERIFICATION_APPROVED, Refs.NONE, null);
        repository.insertOrCollapse(agrochemist, NotificationType.VERIFICATION_APPROVED, Refs.NONE, null);

        assertThat(repository.list(agrochemist, false, 10, 0)).hasSize(2);
        assertThat(repository.countUnread(agrochemist)).isEqualTo(2);
    }

    @Test
    void listReturnsOnlyOwnRowsNewestFirstWithoutOverlappingPages() {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            ids.add(repository.insertOrCollapse(agrochemist, NotificationType.VERIFICATION_REJECTED, Refs.NONE,
                    null).id());
        }
        repository.insertOrCollapse(farmer, NotificationType.VERIFICATION_APPROVED, Refs.NONE, null);

        List<Notification> page0 = repository.list(agrochemist, false, 2, 0);
        List<Notification> page1 = repository.list(agrochemist, false, 2, 2);
        List<Notification> page2 = repository.list(agrochemist, false, 2, 4);

        assertThat(page0).extracting(Notification::id).containsExactly(ids.get(4), ids.get(3));
        assertThat(page1).extracting(Notification::id).containsExactly(ids.get(2), ids.get(1));
        assertThat(page2).extracting(Notification::id).containsExactly(ids.get(0));
        assertThat(page0).allSatisfy(n -> {
            assertThat(n.recipientId()).isEqualTo(agrochemist);
            assertThat(n.type()).isEqualTo(NotificationType.VERIFICATION_REJECTED);
            assertThat(n.readAt()).isNull();
        });
    }

    @Test
    void unreadOnlyFiltersReadRows() {
        UUID read = repository.insertOrCollapse(agrochemist, NotificationType.VERIFICATION_REJECTED, Refs.NONE,
                null).id();
        UUID unread = repository.insertOrCollapse(agrochemist, NotificationType.VERIFICATION_APPROVED, Refs.NONE,
                null).id();
        repository.markRead(agrochemist, read);

        assertThat(repository.list(agrochemist, true, 10, 0)).extracting(Notification::id)
                .containsExactly(unread);
        assertThat(repository.list(agrochemist, false, 10, 0)).hasSize(2);
        assertThat(repository.countUnread(agrochemist)).isEqualTo(1);
        assertThat(repository.countUnread(farmer)).isZero();
    }

    @Test
    void markReadIgnoresSomeoneElsesRowAndKeepsTheFirstReadTime() {
        UUID id = repository.insertOrCollapse(agrochemist, NotificationType.VERIFICATION_APPROVED, Refs.NONE,
                null).id();

        assertThat(repository.markRead(farmer, id)).isFalse();
        assertThat(repository.markRead(agrochemist, UUID.randomUUID())).isFalse();
        assertThat(repository.list(agrochemist, false, 10, 0).get(0).readAt()).isNull();

        assertThat(repository.markRead(agrochemist, id)).isTrue();
        Instant firstRead = repository.list(agrochemist, false, 10, 0).get(0).readAt();
        assertThat(firstRead).isNotNull();
        assertThat(repository.markRead(agrochemist, id)).isTrue();
        assertThat(repository.list(agrochemist, false, 10, 0).get(0).readAt()).isEqualTo(firstRead);
    }

    @Test
    void markAllReadClearsOnlyTheRecipientsRows() {
        repository.insertOrCollapse(agrochemist, NotificationType.VERIFICATION_APPROVED, Refs.NONE, null);
        repository.insertOrCollapse(agrochemist, NotificationType.VERIFICATION_REJECTED, Refs.NONE, null);
        repository.insertOrCollapse(farmer, NotificationType.VERIFICATION_APPROVED, Refs.NONE, null);

        repository.markAllRead(agrochemist);

        assertThat(repository.countUnread(agrochemist)).isZero();
        assertThat(repository.countUnread(farmer)).isEqualTo(1);
    }

    private UUID message() {
        return jdbc.queryForObject("""
                INSERT INTO consultation_messages (consultation_id, sender_id, body) VALUES (?, ?, 'Hi')
                RETURNING id""", UUID.class, consultation, farmer);
    }

    private UUID user() {
        seq++;
        return jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test') RETURNING id",
                UUID.class, "+7704100%04d".formatted(seq));
    }
}
