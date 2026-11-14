package kz.agroadvisor.consultations.config;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

class StompSessionExpiryTest {

    private final StompSessionExpiry expiry = new StompSessionExpiry();

    private WebSocketSession open(String id) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        expiry.opened(session);
        return session;
    }

    @Test
    void closesASocketWhoseTokenHasExpiredAndKeepsTheOthers() throws Exception {
        WebSocketSession expired = open("a");
        WebSocketSession valid = open("b");
        WebSocketSession unauthenticated = open("c");
        expiry.expiresAt("a", Instant.now().minusSeconds(1));
        expiry.expiresAt("b", Instant.now().plusSeconds(600));

        expiry.closeExpired();

        verify(expired).close(ArgumentMatchers.argThat(s -> s.getCode() == CloseStatus.POLICY_VIOLATION.getCode()));
        verify(valid, never()).close(ArgumentMatchers.any(CloseStatus.class));
        // A socket without CONNECT is dropped by the time-to-first-message, not by this check
        verify(unauthenticated, never()).close(ArgumentMatchers.any(CloseStatus.class));
    }

    @Test
    void aClosedSocketIsForgotten() throws Exception {
        WebSocketSession session = open("a");
        expiry.expiresAt("a", Instant.now().minusSeconds(1));
        expiry.closed("a");

        expiry.closeExpired();

        verify(session, never()).close(ArgumentMatchers.any(CloseStatus.class));
    }
}
