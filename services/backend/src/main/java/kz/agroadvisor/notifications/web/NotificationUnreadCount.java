package kz.agroadvisor.notifications.web;

import io.swagger.v3.oas.annotations.media.Schema;

/** How many notifications of the caller are still unread. */
public record NotificationUnreadCount(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int count) {
}
