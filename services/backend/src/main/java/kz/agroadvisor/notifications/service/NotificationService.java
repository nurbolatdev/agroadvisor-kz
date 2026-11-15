package kz.agroadvisor.notifications.service;

import java.util.List;
import java.util.UUID;

import kz.agroadvisor.common.web.ApiException;
import kz.agroadvisor.notifications.model.NotificationType;
import kz.agroadvisor.notifications.repository.NotificationRepository;
import kz.agroadvisor.notifications.repository.NotificationRepository.Notification;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The notification feed of a user. Other modules call only {@link #notify}.
 *
 * <p>The feed row is written inside the transaction of the event that causes it (hence
 * {@code MANDATORY}): it exists exactly when that event is committed, and nothing is lost if the process
 * stops right after the commit. Writing it after the commit would need a second transaction and a second
 * pooled connection while the first is still held, and would leave a window where the event is
 * committed but the row is not. The only failure of the insert is a foreign key to a deleted recipient,
 * which fails the event itself the same way. A call outside a transaction is a programming error and fails
 * loudly. Notifications carry only a type, ids and a counter, never names or message text.
 */
@Service
public class NotificationService {

    /** Ids a notification points to; build them with the factories. */
    public record Refs(UUID consultationId, UUID messageId, UUID diagnosisId) {

        public static Refs none() {
            return new Refs(null, null, null);
        }

        public static Refs consultation(UUID consultationId) {
            return new Refs(consultationId, null, null);
        }

        public static Refs message(UUID consultationId, UUID messageId) {
            return new Refs(consultationId, messageId, null);
        }

        public static Refs diagnosis(UUID diagnosisId) {
            return new Refs(null, null, diagnosisId);
        }
    }

    /** Published in the caller's transaction; {@link NotificationPushRelay} reacts after the commit. */
    record NotificationCreated(PushMessage message) {
    }

    private final NotificationRepository notifications;
    private final ApplicationEventPublisher events;

    public NotificationService(NotificationRepository notifications, ApplicationEventPublisher events) {
        this.notifications = notifications;
        this.events = events;
    }

    /**
     * Adds a notification to the recipient's feed in the caller's transaction. Unread chat messages of one
     * consultation, and verdicts on one diagnosis, collapse into one row with a counter.
     *
     * @throws IllegalArgumentException when the references do not fit the type
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Notification notify(UUID recipientId, NotificationType type, Refs refs) {
        String collapseKey = checkAndKey(type, refs);
        Notification row = notifications.insertOrCollapse(recipientId, type,
                new NotificationRepository.Refs(refs.consultationId(), refs.messageId(), refs.diagnosisId()),
                collapseKey);
        events.publishEvent(new NotificationCreated(new PushMessage(row.id(), row.recipientId(),
                row.type().code(), row.consultationId(), row.messageId(), row.diagnosisId(), row.count())));
        return row;
    }

    @Transactional(readOnly = true)
    public List<Notification> list(UUID me, boolean unreadOnly, int page, int size) {
        return notifications.list(me, unreadOnly, size, page * size);
    }

    @Transactional(readOnly = true)
    public int unreadCount(UUID me) {
        return notifications.countUnread(me);
    }

    /** Marks one of my notifications read and returns how many are still unread; repeating it changes nothing. */
    @Transactional
    public int markRead(UUID me, UUID id) {
        if (!notifications.markRead(me, id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, NotificationErrors.NOTIFICATION_NOT_FOUND,
                    "Notification not found");
        }
        return notifications.countUnread(me);
    }

    @Transactional
    public void markAllRead(UUID me) {
        notifications.markAllRead(me);
    }

    private static String checkAndKey(NotificationType type, Refs refs) {
        boolean consultation = refs.consultationId() != null;
        boolean message = refs.messageId() != null;
        boolean diagnosis = refs.diagnosisId() != null;
        boolean fits = switch (type) {
            case CONSULTATION_REQUESTED, CONSULTATION_ACCEPTED, CONSULTATION_DECLINED, CONSULTATION_CLOSED ->
                    consultation && !message && !diagnosis;
            case CONSULTATION_MESSAGE -> consultation && message && !diagnosis;
            case DIAGNOSIS_REVIEWED -> diagnosis && !consultation && !message;
            case VERIFICATION_APPROVED, VERIFICATION_REJECTED, VERIFICATION_DOCUMENTS_REQUESTED ->
                    !consultation && !message && !diagnosis;
        };
        if (!fits) {
            throw new IllegalArgumentException("References do not fit notification type " + type.code());
        }
        return switch (type) {
            case CONSULTATION_MESSAGE -> type.code() + ":" + refs.consultationId();
            case DIAGNOSIS_REVIEWED -> type.code() + ":" + refs.diagnosisId();
            default -> null;
        };
    }
}
