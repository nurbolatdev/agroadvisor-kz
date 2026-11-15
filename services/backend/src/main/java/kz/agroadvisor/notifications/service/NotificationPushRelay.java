package kz.agroadvisor.notifications.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import kz.agroadvisor.notifications.service.NotificationService.NotificationCreated;

/**
 * Hands a notification to the {@link PushSender} once the transaction that wrote it has committed. It does
 * not touch the database. A failure here must never undo or fail the change that has been saved: the feed
 * row exists and the client catches up over REST.
 */
@Component
class NotificationPushRelay {

    private static final Logger log = LoggerFactory.getLogger(NotificationPushRelay.class);

    private final PushSender sender;

    NotificationPushRelay(PushSender sender) {
        this.sender = sender;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void relay(NotificationCreated event) {
        try {
            sender.send(event.message());
        } catch (RuntimeException e) {
            log.warn("Push for notification {} ({}) was not sent: {}", event.message().notificationId(),
                    event.message().type(), e.toString());
        }
    }
}
