# ADR 0009: Realtime delivery for consultations

- Status: accepted (team decision, 14 Nov 2026), for one backend instance
- Scope: `services/backend` (`consultations`), `apps/mobile` (M13, M14)

## Context

A consultation is a chat between a farmer and an agrochemist. Without push, an app can only poll, which
delays an answer by the polling interval and drains the battery of a phone in a field with a weak network. The
mobile plan already chose `@stomp/stompjs` for M14, and React Native has a built-in WebSocket client.

## Decision

- **STOMP over a plain WebSocket**, endpoint `/ws`, with Spring's in-memory simple broker. The dependency is
  `spring-boot-starter-websocket`, part of Spring Boot.
- **The server is the only publisher.** A client may only `SUBSCRIBE` to `/user/queue/**`; `SEND` and any other
  destination close the session. The queue of a user is `/user/queue/consultations`; Spring routes it by the
  principal name (the user id), so nobody can subscribe to another person's queue.
- **The token is checked in the STOMP `CONNECT` frame** (`Authorization: Bearer <access token>`), not in the
  URL, so it never reaches access logs. The handshake `GET /ws` is public because a browser cannot add a header
  to it; a socket that sends no `CONNECT` within 10 s is dropped, and nothing is delivered before `CONNECT`.
  The user is built from the database exactly like for REST (blocked users and changed roles count), and must be
  a farmer or an agrochemist with the feature `consultations`.
- **The socket ends with its token.** A scheduled check closes sockets whose access token has expired (15 min);
  the client reconnects with a fresh token, as it refreshes the token for REST.
- **Events carry ids only** (`message_created`, `messages_read`, `consultation_updated`, with `consultationId`
  and `messageId`). The client reads the data again over REST (`GET .../messages?after=<id>`,
  `GET /api/consultations/{id}`). That keeps one source of truth, makes a lost event harmless and keeps text and
  photos out of the socket.
- **Events are published after the commit** (`@TransactionalEventListener(AFTER_COMMIT)`), so a rolled-back
  change is never announced, and a failure to deliver never fails the saved change.
- Heartbeats of 25 s both ways keep the connection alive behind a proxy; messages from a client are limited to
  8 KB.
- **Catching up is always REST.** After a reconnect, or if an event was lost, the client calls
  `GET /api/consultations/unread-count` and the history with the `after` cursor.

## Rejected

- **Server-Sent Events:** React Native has no `EventSource`, so the mobile app would need a new library, and a
  request header for the token is not possible with the standard API.
- **Polling only:** simplest, but latency and battery cost; it stays as the fallback described above.
- **An external broker (RabbitMQ, Redis pub/sub):** a new service to run and secure, not needed for one
  instance.
- **Token in the URL (`/ws?token=`):** ends in access logs and proxies.
- **Pushing the message text over the socket:** a second copy of the data to keep consistent and to protect.

## Consequences

- **One instance only.** The simple broker keeps subscriptions in memory, so a second backend instance would not
  see the sockets of the first. Scaling out needs a relay through Redis pub/sub or a STOMP broker; the services
  publish ordinary application events, so only the relay class would change.
- **The reverse proxy must pass the upgrade** (nginx: `proxy_http_version 1.1`, `Upgrade` and `Connection`
  headers, `proxy_read_timeout` above 60 s or rely on the 25 s heartbeat). To be done in the staging task.
- A user blocked while connected stays connected until the token expires (at most 15 minutes); REST calls
  are refused at once.
- Events are not stored: a client that is offline gets nothing, and learns from REST on the next start.
