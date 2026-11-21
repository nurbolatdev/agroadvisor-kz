# Notifications API

The notification inbox of a user and the registration of device push tokens. Schemas and operation ids are in [`openapi.json`](openapi.json); the tables `notifications` and `push_tokens` (migration `V21`) are described in [`database-er.md`](../diagrams/database-er.md).

Errors are RFC 9457 problem documents with a `code` field (see [error codes](#error-codes)). Every endpoint needs a signed-in user; there is no role or feature check, because notifications are delivery infrastructure.

A notification carries only a type, references (ids) and a counter, never a name or message text. The client loads the details over REST from the references.

## Endpoints

| Operation | Endpoint | Result |
| --- | --- | --- |
| `listNotifications` | `GET /api/notifications?unread=false&page=0&size=20` | `200`, an array of notifications, the latest activity first. `unread=true` returns unread ones only. `page` is 0 to 10000, `size` is 1 to 50 (default 20); a value out of range is 400 `validation_failed`. |
| `getNotificationUnreadCount` | `GET /api/notifications/unread-count` | `200 { "count" }` |
| `markNotificationRead` | `POST /api/notifications/{id}/read` | `200 { "count" }`, how many notifications are still unread. Idempotent: repeating it changes nothing. |
| `markAllNotificationsRead` | `POST /api/notifications/read-all` | `200 { "count": 0 }` |
| `registerPushToken` | `PUT /api/push-tokens` | `200`, the registered token |
| `deletePushToken` | `DELETE /api/push-tokens/{id}` | `204` |

### Notification

```
{ "id", "type", "consultationId", "messageId", "diagnosisId", "questionId", "answerId", "count",
  "createdAt", "updatedAt", "readAt" }
```

`consultationId`, `messageId`, `diagnosisId`, `questionId`, `answerId` and `readAt` are null when they do not apply. `updatedAt` orders the list. `count` is how many events were collapsed into the row (1 for a single event).

### Types

The references that are set depend on the `type` (enforced by a check constraint of `V21`).

| `type` | Recipient | Event | References |
| --- | --- | --- | --- |
| `consultation_requested` | agrochemist | a farmer sent a request | `consultationId` |
| `consultation_accepted` | farmer | the agrochemist accepted | `consultationId` |
| `consultation_declined` | farmer | the agrochemist declined | `consultationId` |
| `consultation_closed` | the other participant | one participant closed the consultation (a withdrawal of the request by the farmer too) | `consultationId` |
| `consultation_message` | the other participant | a new chat message | `consultationId`, `messageId` (the newest message) |
| `verification_approved` | agrochemist | the admin approved the profile | none |
| `verification_rejected` | agrochemist | the admin rejected the profile | none |
| `verification_documents_requested` | agrochemist | the admin asked for more documents | none |
| `diagnosis_reviewed` | farmer, the owner of the diagnosis | an agrochemist or an admin gave a verdict | `diagnosisId` |
| `community_answer` | the author of the question | a new answer (not when the author answers their own question) | `questionId`, `answerId` (the newest answer) |
| `community_answer_accepted` | the author of the answer | the question author picked it as the best answer (clearing the choice, picking the same answer again or picking one's own is silent) | `questionId`, `answerId` |
| `community_question` | users following the crop of the question | a new question (active accounts only, the author excluded) | `questionId` (the newest question) |

The reason of a verification decision and the verdict itself are not in the notification: the client reads the reason from the verification status.

### Collapsing

Unread notifications of one recipient with the same key collapse into one row, so a busy chat does not fill the list:

- `consultation_message` collapses per consultation: the row keeps the newest `messageId`, `count` grows, `updatedAt` moves.
- `diagnosis_reviewed` collapses per diagnosis, so two verdicts on one diagnosis give one row with `count` 2.
- `community_answer` collapses per question: the row keeps the newest `answerId`, `count` grows.
- `community_answer_accepted` collapses per answer: picking, clearing and picking the same answer again while the first row is unread gives one row with `count` 2.
- `community_question` collapses per recipient: one unread row holds the newest `questionId`, `count` is the number of new questions.
- Other types never collapse.

After a row is read, the next event starts a new row with `count` 1.

## Push tokens

`PUT /api/push-tokens` with `{ "platform": "android" | "ios" | "expo", "token": string }`.

| `platform` | The token is |
| --- | --- |
| `android` | a raw FCM token |
| `ios` | a raw APNs token |
| `expo` | an Expo push token |

- `token` is 1 to 512 printable ASCII characters without spaces (400 `validation_failed` otherwise).
- The call is an idempotent upsert by token: repeating it only moves `updatedAt`.
- A token is unique across users. A device that signs in under another account moves the token to that account, so the previous account stops receiving pushes on it.
- A user has at most 10 devices. Registering one more drops the one registered the longest ago; a forgotten device never blocks a new one, so there is no error for the limit.
- Registrations are limited to 20 per hour per user (every attempt counts); more is 429 `rate_limited`. Listing, deleting and read marks are not limited.
- A new token of the same device is registered with `PUT`, then the old one is removed with `DELETE /api/push-tokens/{id}` (the id is in the response of the first `PUT`).

## Delivery

- The feed row is written in the same transaction as the event that causes it (a consultation message, a status change, a verification decision, a verdict). It exists exactly when the event is saved, and nothing is lost if the process stops right after.
- Push is handed to the push sender after that transaction commits. A failure of the push never undoes or fails the change; the feed row stays and the client catches up over REST.
- No push provider is connected yet. The sender only logs that the push was skipped, so tokens are stored but nothing is delivered to devices.
- A client that gets no push (for example an iPhone before APNs is set up) polls `GET /api/notifications/unread-count` when the app opens or returns to the foreground, and loads the list when the count changes.

## Error codes

| Status | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | a bad `page`, `size`, `platform` or `token` |
| 401 | | no or an expired access token |
| 404 | `notification_not_found` | a missing notification or one of another user |
| 404 | `push_token_not_found` | a missing token or one of another user |
| 429 | `rate_limited` | more than 20 token registrations per hour |

## Not available yet

- Delivery to devices: no push provider is connected (FCM or Expo Push Service is a separate decision, with its own credentials).
- Cleanup of old notifications: rows stay until the user is deleted.
- Reading a chat does not mark its notification as read; the client marks it with `markNotificationRead`.
- Realtime updates of the feed: the STOMP channel of [consultations](consultations.md#realtime-events) carries consultation events only.
- The verdict for the farmer: `diagnosis_reviewed` only tells that the diagnosis was checked; an endpoint that shows the verdict to the farmer does not exist yet.
