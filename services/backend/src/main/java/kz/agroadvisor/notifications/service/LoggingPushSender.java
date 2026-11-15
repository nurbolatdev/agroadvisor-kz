package kz.agroadvisor.notifications.service;

import jakarta.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Stand-in until a push provider is chosen: delivers nothing and says so. A provider bean replaces it. */
@Component
class LoggingPushSender implements PushSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingPushSender.class);

    @PostConstruct
    void warn() {
        log.warn("Push delivery is disabled: no push provider is configured");
    }

    @Override
    public void send(PushMessage message) {
        log.debug("push skipped: no provider type={} notification={}", message.type(), message.notificationId());
    }
}
