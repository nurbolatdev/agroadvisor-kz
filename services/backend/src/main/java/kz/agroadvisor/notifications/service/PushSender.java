package kz.agroadvisor.notifications.service;

/**
 * Delivers a notification to the recipient's devices. Called after the transaction that wrote the
 * notification has committed, on the calling thread: an implementation looks up tokens and talks to the
 * provider on its own thread and connection, and must return quickly. Failures never reach the caller.
 */
public interface PushSender {

    void send(PushMessage message);
}
