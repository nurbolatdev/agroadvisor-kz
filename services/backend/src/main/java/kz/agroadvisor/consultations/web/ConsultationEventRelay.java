package kz.agroadvisor.consultations.web;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import kz.agroadvisor.consultations.service.ConsultationEvents.ConsultationEvent;

/**
 * Sends the events of {@link kz.agroadvisor.consultations.service.ConsultationEvents} to the users' queues
 * ({@code /user/queue/consultations}) once the transaction has committed. A failure here must never undo or
 * fail the change that has been saved: the client catches up over REST ({@code after=<id>}, {@code unread-count}).
 */
@Component
class ConsultationEventRelay {

    static final String QUEUE = "/queue/consultations";

    private static final Logger log = LoggerFactory.getLogger(ConsultationEventRelay.class);

    /** What the client receives: ids only. */
    record Payload(String type, UUID consultationId, UUID messageId) {
    }

    private final SimpMessagingTemplate template;

    ConsultationEventRelay(SimpMessagingTemplate template) {
        this.template = template;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void relay(ConsultationEvent event) {
        Payload payload = new Payload(event.type(), event.consultationId(), event.messageId());
        for (UUID user : event.recipients()) {
            try {
                template.convertAndSendToUser(user.toString(), QUEUE, payload);
            } catch (RuntimeException e) {
                log.warn("Event {} for user {} was not delivered: {}", event.type(), user, e.toString());
            }
        }
    }
}
