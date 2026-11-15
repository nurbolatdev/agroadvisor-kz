package kz.agroadvisor.notifications.service;

import java.util.UUID;

/**
 * What is handed to a {@link PushSender}: the notification id, who gets it, its wire type, the ids it points
 * to and the collapse counter. Never names, message text or tokens.
 */
public record PushMessage(UUID notificationId, UUID recipientId, String type, UUID consultationId,
        UUID messageId, UUID diagnosisId, int count) {
}
