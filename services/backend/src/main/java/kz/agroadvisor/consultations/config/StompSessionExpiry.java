package kz.agroadvisor.consultations.config;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

/**
 * Closes a WebSocket when the access token it connected with has expired. The token is checked once, in the
 * STOMP CONNECT frame; without this a socket would outlive the token (and a user blocked since) for as long as
 * it stays open. The client reconnects with a fresh token, which is what it does for the REST calls too.
 */
@Component
class StompSessionExpiry {

    private static final Logger log = LoggerFactory.getLogger(StompSessionExpiry.class);

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, Instant> expiries = new ConcurrentHashMap<>();

    /** A socket that has not connected by this time is closed (the transport's own timer can be defeated). */
    private final Duration connectDeadline;

    StompSessionExpiry(@Value("${app.websocket.connect-deadline-ms:10000}") long connectDeadlineMs) {
        this.connectDeadline = Duration.ofMillis(connectDeadlineMs);
    }

    void opened(WebSocketSession session) {
        sessions.put(session.getId(), session);
        // CONNECT replaces this with the expiry of the token. A client that sends half a frame (or nothing
        // useful) would otherwise keep the public handshake open for ever.
        expiries.put(session.getId(), Instant.now().plus(connectDeadline));
    }

    void closed(String sessionId) {
        sessions.remove(sessionId);
        expiries.remove(sessionId);
    }

    /** Called from CONNECT once the token is accepted. */
    void expiresAt(String sessionId, Instant expiry) {
        expiries.put(sessionId, expiry);
    }

    @Scheduled(fixedDelayString = "${app.websocket.expiry-check-ms:5000}")
    void closeExpired() {
        Instant now = Instant.now();
        expiries.forEach((id, expiry) -> {
            if (expiry.isAfter(now)) {
                return;
            }
            WebSocketSession session = sessions.get(id);
            closed(id);
            if (session != null && session.isOpen()) {
                try {
                    session.close(CloseStatus.POLICY_VIOLATION.withReason("token expired"));
                } catch (IOException e) {
                    log.debug("Closing the expired socket {} failed: {}", id, e.toString());
                }
            }
        });
    }
}
