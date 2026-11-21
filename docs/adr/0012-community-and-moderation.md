# ADR 0012: Community questions and moderation

- Status: accepted by the backend developer on 20 Nov 2026 (the lead asked the developers to decide such
  questions themselves); the schema (V25), the new module `community` and the access rules are key decisions,
  so the lead confirms them in the review of the PR
- Applies to: `services/backend` (`community`), later `apps/mobile` (M16) and `apps/admin-web` (B12.5)

## Context

Farmers ask the community about their crops, like in Plantix: a feed with filters, answers, votes, a best answer,
a subscription to crops, and a way to report abuse that an admin moderates. The work is split into three PRs:
questions and answers (B15.1), reports and moderation (B15.2) and notifications (B15.3). The whole schema is
approved once, in `V25`; the notification columns come later in `V26`.

## Decision

- **Seven tables in one migration (V25):** `community_questions`, `community_question_photos`,
  `community_answers`, `community_votes`, `community_crop_subscriptions`, `community_complaints`,
  `community_reports`. The prefix keeps them apart from `consultation_messages` and `shop_requests`. The API says
  "question", not "post" (the mobile app and the screens do); the admin adapter (B12.5) maps `question` to `post`.
- **The status of a question is not stored.** `accepted_answer_id` is the best answer and a generated column
  `status` is `open` or `solved`. Hiding is a separate pair `hidden_at`, `hidden_by`, so returning a hidden item
  needs no memory of the old status. A composite foreign key `(id, accepted_answer_id)` to
  `community_answers (question_id, id)` with `ON DELETE SET NULL (accepted_answer_id)` makes the database keep
  the best answer inside its question.
- **No counters in columns.** The number of visible answers and the score are computed in the query for a page
  (up to 50 questions, up to 200 answers). Revisit if the feed becomes slow.
- **Feed paging by cursor.** `before=<id of the last question>`, order `(created_at DESC, id DESC)`, the response is
  a plain list, like the chat history. An unknown cursor is 404 `question_not_found`; a hidden question is a valid
  cursor.
- **The region comes from the author's profile** (`users.region_id`, `district_id`) when the question is created,
  as for diagnoses. There is no point: the map (B17) will use the centre of the district. A farmer without a region
  gets 400 `region_required`.
- **Photos:** up to 3 in the multipart request that creates the question, each up to 10 MB, the whole request up to
  the existing 11 MB. Keys `community/<questionId>/<uuid>.<ext>` in the same bucket; the nightly cleanup of
  `diagnoses/` does not look there. Own storage class and a new `common.image.ImageFormat` (type by the first
  bytes) used only here.
- **Attached diagnosis:** only the author's own, of the same crop; readers get it through the question
  (`/diagnosis` and `/diagnosis/photo`), the photo is not copied.
- **Roles:** only a farmer asks; a farmer or an agrochemist reads, answers, votes, reports and follows crops; every
  endpoint also needs the feature `community`. The `expert` mark is shown only for a verified agrochemist.
- **Rules:** one cannot vote for or pick one's own answer (409 `own_answer`) or report one's own content (409
  `own_content`); the author may answer their own question; at most 200 answers per question (409
  `answer_limit`, checked under a lock on the question row); the best answer can be changed or cleared.
- **Hiding:** a hidden question is 404 for everyone, the author included; a hidden answer is not listed and cannot
  be voted on or picked. Hiding the best answer clears the choice; returning the answer does not restore it.
- **Two levels of reports.** `community_complaints` is a case: one open case per target (partial unique indexes),
  with the status `new`, `in_progress`, `resolved` and the action `keep`, `hide` or `block`. `community_reports` is
  one report per user in a case (a repeat is idempotent, 204). After a case is resolved, a new report opens a new
  case. The admin sees "Ads, 3 reports" and decides once per target.
- **`block`** hides the target and calls `UserAdminService.changeStatus(..., "blocked")` in the same transaction,
  so the rules of B12.1 apply (an admin or oneself cannot be blocked: 403 `admin_status_locked`, and the target
  stays visible; refresh tokens are revoked). `PATCH .../status` of a question or an answer answers 204.
- **Moderation figures** are computed in UTC: "today" from 00:00 UTC, "this week" is the last 7 days, the average
  resolution time is over the cases resolved in the last 7 days.
- **Limits** are properties in `RateLimitProperties` like the consultations ones: 10 questions and 30 answers an
  hour, 60 votes a minute, 20 reports an hour; every attempt counts.
- **Notifications (B15.3):** types `community_answer` (to the author of the question, collapsed per question),
  `community_answer_accepted` (to the author of the answer) and `community_question` (to the subscribers of the
  crop, one unread row per recipient). Subscribers are notified inside the transaction that creates the question,
  through `NotificationService.notify`.
- **Border with B12.5:** B15 gives the moderation API (cases, hide and restore, moderation figures, the counter of
  new cases). The statistics page of the admin community, "no answer for more than 24 hours" and "invite an
  agrochemist" belong to B12.5.

## Consequences

- The schema is approved as a whole; after the merge `V25` is not edited, notification columns come in `V26`.
- Counters are computed per page: simple and always right, but a very busy feed needs denormalization later.
- Photo objects of questions are not cleaned when a transaction fails after the upload and a crash, or when a user
  is deleted (the same debt as in consultations); the index on `photo_key` is ready for the cleanup.
- Notifying subscribers inside the question transaction is simple but does not scale: above about 1000
  subscribers of one crop move to a batch insert or an outbox.
- The push relay is synchronous and runs after the commit: with a real FCM provider, sending to N subscribers delays
  the request of the question, so it needs `@Async` or an outbox.
- A notification keeps the latest `questionId` and `answerId`; after moderation hides that question or answer, the
  link leads to 404.
- A blocked author keeps their other content visible; only the target of the case is hidden.
- Not in B15: editing and deleting one's own questions and answers, photos in answers, votes on questions,
  `users.reputation`, a notice to the author about hiding, a push provider.

## Rejected

- **`status OPEN/SOLVED/HIDDEN` in a column** (as in the ER of the documentation): "restore" would not know the
  status before hiding.
- **Names `post`, `answer`, `vote`, `report` from the ER:** too general next to the consultation and shop tables.
- **Checking in the service only that the best answer belongs to the question:** the composite foreign key does it
  for every writer.
- **Columns `answer_count` and `score`:** they drift on hiding, restoring and races.
- **An opaque cursor token and a `{items, nextCursor}` object:** the project already pages by id.
- **`regionId` in the request and `district_point` from the ER:** districts are empty, and a point of a field
  reveals the place.
- **A separate `POST .../photos`:** a question without its photos would be visible before the upload ends.
- **Raising `max-request-size` for all endpoints:** it touches every upload.
- **A shared storage class for all modules:** a refactoring outside this task.
- **Copying the diagnosis photo into the question photos:** a duplicate object.
- **Showing the role `agrochemist` as the expert mark without a check:** an unverified user would pose as an expert.
- **One flat `report` table:** the admin needs one decision per target and the count of reports by reason.
- **A block of its own inside `community`:** two truths about the status of a user.
- **Asia/Almaty for the moderation figures:** UTC is used everywhere in B12, so the figures stay comparable.
- **An asynchronous outbox for the notifications now:** new infrastructure for a small audience.
- **Three approvals of the schema (V25 split by PR):** one approval of the whole schema is enough.
