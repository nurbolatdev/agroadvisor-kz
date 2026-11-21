# Admin community moderation API

The admin's side of the reports users send about community questions and answers (the user's side, `POST /api/community/reports`, is in [`community.md`](community.md); the decisions are in [ADR 0012](../adr/0012-community-and-moderation.md)). Schemas and operation ids are in [`openapi.json`](openapi.json) (`CommunityComplaint`, `CommunityModerationStats`, `ResolveComplaintRequest`, `VisibilityRequest`).

Errors are RFC 9457 problem documents with a `code` field. All endpoints are under `/api/admin/community` and need the `ADMIN` role: no token is 401, a farmer or an agrochemist is 403.

## Cases

All reports about one target (a question or an answer) hang under one case. A case is `new`, then `in_progress` once an admin takes it, then `resolved` once, with an action. After a case is resolved, a new report about the same target opens a new case.

## Endpoints

| Operation | Endpoint | Result |
| --- | --- | --- |
| `listAdminCommunityComplaints` | `GET /api/admin/community/complaints?status=&targetType=&reason=&page=0&size=20` | `200`, a bare array of cases, newest first. |
| `getAdminCommunityComplaint` | `GET /api/admin/community/complaints/{id}` | `200`, one case; its target is shown even when hidden. 404 `complaint_not_found`. |
| `startAdminCommunityComplaint` | `POST /api/admin/community/complaints/{id}/start` | `200`, the case. A `new` case becomes `in_progress`; a case already in work stays as it is. 404 `complaint_not_found`, 409 `complaint_resolved`. |
| `resolveAdminCommunityComplaint` | `POST /api/admin/community/complaints/{id}/resolve?lang=` | `200`, the resolved case. Body `{ "action": "keep" \| "hide" \| "block", "comment": string? }`. A case can be resolved straight from `new`. |
| `getAdminCommunityModerationStats` | `GET /api/admin/community/moderation-stats` | `200`, the numbers of the moderation page. |
| `changeAdminCommunityQuestionStatus` | `PATCH /api/admin/community/questions/{id}/status` | `204`, no body. Body `{ "status": "visible" \| "hidden" }`. 404 `question_not_found`. |
| `changeAdminCommunityAnswerStatus` | `PATCH /api/admin/community/answers/{id}/status` | `204`, no body. Body `{ "status": "visible" \| "hidden" }`. 404 `answer_not_found`. |
| `getAdminCommunityQuestionPhoto` | `GET /api/admin/community/questions/{id}/photos/{photoId}` | `200`, a JPEG or PNG, also for a hidden question. 404 `question_not_found` or `photo_not_found`. |
| `inviteAdminCommunityAgrochemist` | `POST /api/admin/community/questions/{id}/invitations` | `200`, the invitation. Body `{ "agrochemistId": uuid }`. See [Inviting an agrochemist](#inviting-an-agrochemist). |

## Inviting an agrochemist

An admin asks a verified agrochemist to answer a question (the "Invite an agrochemist" button of the "no answer" list). The code is `CommunityInvitationController` and `CommunityInvitationService` in the `community` module; the service asks `AgrochemistVerificationService.isApproved`, so `community` depends on `verification`.

Request: `{ "agrochemistId": uuid }` (required). Response (`CommunityInvitation`): `questionId`, `agrochemist` (`id`, `name`), `invitedAt`.

Rules:

- The question must exist and not be hidden; a hidden question is answered as not found.
- The user must exist and have the agrochemist role, otherwise `agrochemist_not_found`; an agrochemist whose profile is not approved or whose account is not active gets `agrochemist_not_verified`.
- Whether the question already has an answer is not checked: an answer may arrive between the list and the click.
- The invitation is stored in `community_invitations` (one row per question and agrochemist, `V27`) and the agrochemist gets a `community_invitation` notification in the same transaction ([notifications](notifications.md)).
- Repeating the same pair is not an error: the answer is `200` with the first `invitedAt`, no second row and no second notification.

| Status | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | no `agrochemistId`, a malformed id or body. |
| 401, 403 | general | no or invalid token; not an administrator. |
| 404 | `question_not_found` | no such question, or it is hidden. |
| 404 | `agrochemist_not_found` | no such user, or the user is not an agrochemist. |
| 409 | `agrochemist_not_verified` | the profile is not approved, or the account is not active. |

## Parameters of the list

| Parameter | Rule |
| --- | --- |
| `status` | `new`, `in_progress` or `resolved`. Without it, all. |
| `targetType` | `question` or `answer`. |
| `reason` | `ads`, `misinformation`, `spam` or `abuse`; matches the most reported reason of the case (on a tie, the first in this list). |
| `page`, `size` | 0 to 10000 and 1 to 100, default 0 and 20. The list has no total: read pages until one is shorter than `size`. |

A value out of range or another word is 400 `validation_failed`.

## Case

```
{ "id", "status", "reason", "reports": [{ "reason", "count" }], "comments", "createdAt",
  "resolution": { "action", "comment", "resolvedAt" } | null,
  "target": { "type", "questionId", "answerId", "questionTitle", "body", "cropCode",
              "regionId", "photoCount", "photoUrls", "hidden", "createdAt" },
  "author": { "id", "name", "role", "expert", "status", "hiddenCount", "registeredAt" } }
```

- `reason` is the most reported reason; `reports` is the count per reason ("Ads, 3 reports").
- `comments` are the latest comments of the reporters, at most 5.
- `resolution` is null until the case is resolved; its `comment` is null when none was given.
- `target.type` is `question` or `answer`. `questionId` is always set (for an answer, the question it belongs to); `answerId` is set only for an answer. `questionTitle` is the title of the question, `body` the text of the question or of the answer. `photoCount` counts the photos of the question; `photoUrls` lists them as ready admin URLs `/api/admin/community/questions/{questionId}/photos/{photoId}` (the photo endpoint above, a hidden question too), in order of position.
- `target.hidden` tells whether the target is hidden now.
- `target.createdAt` is when the target was posted: the time of the answer for an answer, the time of the question for a question.
- `author` is the author of the target. `hiddenCount` is the number of the author's hidden posts in total, the "history of the author". `status` is `active` or `blocked`. `registeredAt` is when the author registered.

## Decisions

`resolve` decides a case once, under a lock on the case.

| `action` | Effect |
| --- | --- |
| `keep` | The target is left as it is. |
| `hide` | The target is hidden: a hidden question is 404 for everyone, the author included; a hidden answer is not listed and cannot be voted on or picked. Hiding the best answer makes its question open again. |
| `block` | Hides the target and blocks its author through the users module, in the same transaction (see [`admin-users.md`](admin-users.md)): the author's refresh tokens are revoked, a sign-in is 403 `account_blocked`. Other content of the author stays visible. |

`comment` is optional, at most 500 characters, without control characters; blank is stored as null. Another `action` is 400 `validation_failed`.

`block` follows the rules of the users module. When the author is an administrator it is 403 `admin_status_locked` (blocking oneself is refused the same way); then nothing changes: the target stays visible and the case stays open. An author who is already blocked is not an error. The report of a user about content of an administrator cannot happen in practice, because admins do not post.

The author is not notified about a hide or a block.

## Hide and restore without a case

`PATCH .../questions/{id}/status` and `PATCH .../answers/{id}/status` hide or restore a post at any time, with or without a case. Both answer `204` with no body. Repeating the current status is not an error. Hiding this way does not close the open cases about the post: they stay open until an admin decides them. Restoring an answer that was the best one does not choose it again; the author of the question picks again.

## Moderation stats

`GET /api/admin/community/moderation-stats`:

| Field | Meaning |
| --- | --- |
| `complaintsToday` | cases opened since 00:00 UTC of today. |
| `avgResolutionMinutes` | mean minutes from the case creation to the decision, over cases resolved in the last 7 days; `null` when there are none. |
| `resolvedThisWeek` | cases resolved in the last 7 days. |
| `newComplaints` | cases still `new`, not taken into work. |

The windows are UTC (ADR 0012), as the other admin figures; "the last 7 days" is a sliding window up to now, not a calendar week.

## For the admin web (B12.5)

The admin's mock types differ from the API in names; map them like this.

| Admin web | API |
| --- | --- |
| `PostKind` `post` | `target.type` `question` |
| `PostKind` `answer` | `target.type` `answer` |
| `Complaint.postId` | `target.questionId` for a question, `target.answerId` for an answer |
| `CommunityPost.title`, `text` | `target.questionTitle`, `target.body` |
| `CommunityPost.crop` | `target.cropCode` |
| `CommunityPost.district` | no district: the API gives `target.regionId` only (a region) |
| `CommunityPost.hidden` | `target.hidden` |
| `CommunityPost.authorId` | `author.id` |
| `Complaint.status`, `reports`, `createdAt` | the same names and values |
| `Complaint.resolution` | `resolution`, but it is `null` (not absent) while open, and `comment` may be `null` |
| `ModerationAction` | `action`: `keep`, `hide`, `block` |

The status of a post in the admin's mock (hidden or not) is changed with the `PATCH .../status` calls, `hidden` or `visible`.

## Community statistics

Figures for the admin's community screen (B12.5). The operation is `getAdminCommunityStats`, the schema is `CommunityStats` in [`openapi.json`](openapi.json). The code lives in the `analytics` module (`AdminCommunityStatsController`, `CommunityStatsService`, `CommunityStatsRepository`), which reads the `community_*` and `consultations` tables with plain SQL; nothing is written.

| Operation | Endpoint | Result |
| --- | --- | --- |
| `getAdminCommunityStats` | `GET /api/admin/community/stats?period=30d` | `200`, one `CommunityStats`. |

`period` is `7d`, `30d` (default) or `season`, the same windows as [admin-dashboard.md](admin-dashboard.md). Any other value is 400 `validation_failed`. Windows are UTC and half-open: `[from, now)`. Every "change" compares the window with the previous window of the same length that ends where this one starts. All figures of one call read one database snapshot (`REPEATABLE_READ`). Hidden questions and hidden answers are never counted.

### Fields

| Field | Meaning |
| --- | --- |
| `period` | the period asked for: `7d`, `30d` or `season`. |
| `questions` | `value`: visible questions created in the window; `changePercent` against the previous window, 0 when the previous one had none. |
| `firstAnswerMinutes` | `value`: mean minutes from a question of the window to its first visible answer of somebody else (the author's own answer does not count), whole minutes; `null` when no question of the window has such an answer. `changeMinutes`: current minus previous, 0 when either window has no value. |
| `resolvedShare` | `percent`: share of `solved` questions among the visible questions of the window, 0–100, whole number, 0 for an empty window; `changePoints`: percentage points against the previous window, 0 when either window has no questions. |
| `unansweredOver24h` | `value`: visible questions older than 24 hours that have no visible answer of somebody else, right now (not limited to the window); `change`: this number minus the same count at the start of the window. |
| `activity` | questions (visible, created in the window) and answers (visible, created in the window) per bucket, in the bucket order of the table below (for `7d` the calendar weekday order, not oldest first), every bucket present with zeros. Fields: `bucket`, `questions`, `answers`. |
| `topMembers` | up to 4 members with the most visible answers to visible questions in the window, admins left out, ties by name. `name`, `role` (`agrochemist` when the user has that role, otherwise `farmer`), `answers`. |
| `unanswered` | the questions counted by `unansweredOver24h.value`, the oldest first, at most 50 (so its length can be less than `value`). `id`, `title`, `cropCode`, `regionId`, `hoursWithoutAnswer` (whole hours since the question was created, rounded down), `invitedAgrochemist` (`id`, `name` of the agrochemist most recently invited to the question, `null` when nobody was). |
| `consultations` | `requests`: consultations created in the window; `closed`: those with status `closed` whose `closed_at` is in the window; `avgResponseMinutes`: mean minutes from request to acceptance over those accepted in the window, `null` when none was. |

`activity.bucket` depends on the period:

| Period | Bucket |
| --- | --- |
| `7d` | weekday in UTC, 0 = Monday ... 6 = Sunday (7 buckets). The buckets run in calendar weekday order, not oldest first: the window is the last 7 times 24 hours, so the weekday of today is the sum of the incomplete day a week ago and the incomplete day today. |
| `30d` | week of the window from 1: `1 + floor((t - from) / 7 days)`; the last one may be partial. |
| `season` | calendar month in UTC, 0 = January; the months from the start of the window to now. |

Answers to a hidden question still count in `activity` (they were written, and the question may be shown again), but not in `topMembers` and the unanswered figures, which look at visible questions and visible answers only.

### Approximation of the change

`unansweredOver24h.change` is counted with the current hiding flags and the current answers set, applying the rule at the start of the window (a question at least 24 hours old then, with no visible answer of somebody else created before then). A question or an answer hidden or restored since the window started shifts the past count, so the change is an approximation. The list `unanswered` does not depend on the period.

### Nulls and what is not returned

`firstAnswerMinutes.value` and `consultations.avgResponseMinutes` are `null` (not 0) when there is nothing to average; the admin shows a dash. There is no consultation rating: V20 stores no rating, so the response has no `avgRating`, and the admin shows a dash there.

### For the admin web

The admin's `CommunityStats` type (`apps/admin-web/src/shared/types/communityStats.ts`) maps like this.

| Admin web | API |
| --- | --- |
| `period`, `questions`, `resolvedShare`, `unansweredOver24h`, `activity` | the same names and shapes. |
| `firstAnswerMinutes.value`, `consultations.avgResponseMinutes` | `number` or `null` in the API; the admin type must allow `null`. |
| `consultations.avgRating` | not in the API; the adapter sets `null`. |
| `topMembers[].role` | `role`, `farmer` or `agrochemist`. |
| `unanswered[].crop` | `cropCode`. |
| `unanswered[].district` | `regionId`, resolved to a region name through `/api/regions` (a dash if unknown). |
| `unanswered[].invitedAgrochemist` | `invitedAgrochemist` (`id`, `name`), or `null`. |

### Known limits and debt

- There are no indexes on `consultations(created_at)`, `consultations(closed_at)`, `consultations(accepted_at)` and `community_answers(created_at)`, so the statistics scan those tables sequentially. If the response gets slow, add the indexes in a separate migration (V28 or later).
- `unansweredOver24h.value` and `unanswered` scan all visible questions older than 24 hours on every request, with no cache.
- The admin adapter casts `cropCode` to `CropId` without checking it; the same debt is in `liveModeration`, `liveDiseases` and `liveCommunity`.

## Error codes

| Status | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | `period` of the statistics other than `7d`, `30d`, `season`; an unknown `status`, `targetType`, `reason`, `action` or visibility; `size` or `page` out of range; a comment over 500 characters; a malformed id or body. |
| 401, 403 | general | no or invalid token; not an administrator. |
| 403 | `admin_status_locked` | `block` and the author is an administrator or the caller. |
| 404 | `complaint_not_found` | no such case. |
| 404 | `question_not_found` | no such question (status change, photo); no such or a hidden question (invitation). |
| 404 | `agrochemist_not_found` | the invited user does not exist or is not an agrochemist. |
| 409 | `agrochemist_not_verified` | the invited agrochemist is not approved or not active. |
| 404 | `answer_not_found` | no such answer (status change). |
| 404 | `photo_not_found` | the question has no such photo, or its object is missing from the storage. |
| 409 | `complaint_resolved` | `start` or `resolve` on a case that is already resolved, also when two admins decide at once: the second gets this. |
| 503 | `storage_unavailable` | the photo storage did not answer. |
