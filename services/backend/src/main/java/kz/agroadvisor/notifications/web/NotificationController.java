package kz.agroadvisor.notifications.web;

import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import kz.agroadvisor.notifications.service.NotificationService;

/**
 * The notification feed of the signed-in user. Open to every authenticated user: notifications are delivery
 * infrastructure, not a feature. Another user's notification and a missing one both answer 404
 * notification_not_found.
 */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    /** The latest activity first. */
    @GetMapping
    @Operation(operationId = "listNotifications")
    public List<NotificationResponse> list(
            @RequestParam(defaultValue = "false") boolean unread,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int size, Authentication authentication) {
        return notifications.list(me(authentication), unread, page, size).stream()
                .map(NotificationResponse::of).toList();
    }

    @GetMapping("/unread-count")
    @Operation(operationId = "getNotificationUnreadCount")
    public NotificationUnreadCount unreadCount(Authentication authentication) {
        return new NotificationUnreadCount(notifications.unreadCount(me(authentication)));
    }

    @PostMapping("/{id}/read")
    @Operation(operationId = "markNotificationRead",
            description = "Idempotent. Returns how many notifications are still unread.")
    public NotificationUnreadCount markRead(@PathVariable UUID id, Authentication authentication) {
        return new NotificationUnreadCount(notifications.markRead(me(authentication), id));
    }

    @PostMapping("/read-all")
    @Operation(operationId = "markAllNotificationsRead", description = "Always returns count 0.")
    public NotificationUnreadCount markAllRead(Authentication authentication) {
        notifications.markAllRead(me(authentication));
        return new NotificationUnreadCount(0);
    }

    private static UUID me(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
