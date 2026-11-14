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

    private final StompSessionExpiry expiry = new StompSessionExpiry(10_000);

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
        expiry.expiresAt("a", Instant.now().minusSeconds(1));
        expiry.expiresAt("b", Instant.now().plusSeconds(600));

        expiry.closeExpired();

        verify(expired).close(ArgumentMatchers.argThat(s -> s.getCode() == CloseStatus.POLICY_VIOLATION.getCode()));
        verify(valid, never()).close(ArgumentMatchers.any(CloseStatus.class));
    }

    @Test
    void aSocketThatNeverConnectsIsClosedAfterTheDeadline() throws Exception {
        StompSessionExpiry shortDeadline = new StompSessionExpiry(0);
        WebSocketSession silent = mock(WebSocketSession.class);
        when(silent.getId()).thenReturn("s");
        when(silent.isOpen()).thenReturn(true);
        shortDeadline.opened(silent);

        shortDeadline.closeExpired();

        verify(silent).close(ArgumentMatchers.any(CloseStatus.class));
        // and one that is still within the deadline is left alone
        WebSocketSession fresh = open("f");
        expiry.closeExpired();
        verify(fresh, never()).close(ArgumentMatchers.any(CloseStatus.class));
    }

    @Test
    void aClosedSocketIsForgotten() throws Exception {
        StompSessionExpiry shortDeadline = new StompSessionExpiry(0);
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("a");
        shortDeadline.opened(session);
        shortDeadline.closed("a");

        shortDeadline.closeExpired();

        verify(session, never()).close(ArgumentMatchers.any(CloseStatus.class));
    }
}
