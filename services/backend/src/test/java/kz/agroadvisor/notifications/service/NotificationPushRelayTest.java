package kz.agroadvisor.notifications.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import kz.agroadvisor.TestcontainersConfiguration;
import kz.agroadvisor.notifications.model.NotificationType;
import kz.agroadvisor.notifications.repository.NotificationRepository.Notification;
import kz.agroadvisor.notifications.service.NotificationService.Refs;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

/** Not transactional: the commit and the rollback are the point. Users are removed after. */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class NotificationPushRelayTest {

    @Autowired
    private NotificationService service;
    @Autowired
    private TransactionTemplate tx;
    @Autowired
    private JdbcTemplate jdbc;
    @MockitoBean
    private PushSender sender;

    private final List<UUID> users = new ArrayList<>();
    private int seq;

    @AfterEach
    void cleanUp() {
        users.forEach(id -> jdbc.update("DELETE FROM users WHERE id = ?", id));
    }

    @Test
    void pushIsSentOnceAfterCommitWithTheIdsOfTheRow() {
        UUID user = user();

        Notification row = tx.execute(status ->
                service.notify(user, NotificationType.VERIFICATION_APPROVED, Refs.none()));

        ArgumentCaptor<PushMessage> sent = ArgumentCaptor.forClass(PushMessage.class);
        verify(sender).send(sent.capture());
        assertThat(sent.getValue()).isEqualTo(new PushMessage(row.id(), user, "verification_approved",
                null, null, null, 1));
    }

    @Test
    void nothingIsSentWhenTheTransactionRollsBack() {
        UUID user = user();

        tx.executeWithoutResult(status -> {
            service.notify(user, NotificationType.VERIFICATION_APPROVED, Refs.none());
            status.setRollbackOnly();
        });

        verify(sender, never()).send(any());
    }

    @Test
    void aFailingSenderDoesNotBreakTheCallerAndTheRowStays() {
        UUID user = user();
        doThrow(new IllegalStateException("provider down")).when(sender).send(any());

        tx.executeWithoutResult(status ->
                service.notify(user, NotificationType.VERIFICATION_REJECTED, Refs.none()));

        verify(sender).send(any());
        assertThat(service.unreadCount(user)).isEqualTo(1);
    }

    private UUID user() {
        seq++;
        UUID id = jdbc.queryForObject(
                "INSERT INTO users (phone, password_hash, full_name) VALUES (?, 'x', 'Test') RETURNING id",
                UUID.class, "+7705300%04d".formatted(seq));
        users.add(id);
        return id;
    }
}
