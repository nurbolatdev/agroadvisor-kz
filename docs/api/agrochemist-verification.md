# Agrochemist verification API

An agrochemist registers like anyone else (`POST /api/auth/register` with `role: agrochemist`) and gets tokens at once, but stays hidden from farmers until an admin approves the documents. The status lives in `agrochemist_profiles.verification_status`, not in the role.

## States

| Status | Meaning | Who sets it |
| --- | --- | --- |
| `pending` | Waiting for the admins. The state after registration and after every document sent while `rejected` or `documents_requested`. | registration, the agrochemist's upload |
| `approved` | Documents accepted; the agrochemist is visible to farmers (`verified` is `status = approved`). The documents are locked. | admin |
| `rejected` | Refused, with a reason. The agrochemist may send other documents, which puts the profile back to `pending`. | admin |
| `documents_requested` | The admin needs other or better documents, with a reason. | admin |

`submittedAt` is when the profile entered the queue: at registration, and again when a document is sent after `rejected` or `documents_requested`. A profile that is already `pending` keeps its place when more documents are sent.

## For the agrochemist (app)

All endpoints need the `agrochemist` role and work in every status, including `pending`.

| Method and path | What it does |
| --- | --- |
| `GET /api/agrochemist/verification` | `status`, `submittedAt`, `reviewedAt`, `rejectionReason` (the admin's reason for `rejected` and `documents_requested`) and the `documents` sent. |
| `POST /api/agrochemist/documents` | `multipart/form-data`: `file` (PDF, JPEG or PNG, up to 10 MB), `kind` (`diploma` or `certificate`), optional `title`, `issuer` (up to 200 characters each) and `year` (1950-2100). `201` with the document. |
| `GET /api/agrochemist/documents` | The documents sent, oldest first. |
| `DELETE /api/agrochemist/documents/{id}` | Removes one's own document; `204`. |

The type of the file is taken from its first bytes, not from the `Content-Type` the client sends. An agrochemist can have at most 5 documents. The file is stored in the S3 storage under `agrochemist-documents/{userId}/{uuid}.{pdf|jpg|png}` (bucket `app.documents.bucket`, by default the photo bucket); the table keeps only the key, the type and the size.

Errors (`code`, `reason`):

| HTTP | `code` | `reason` | When |
| --- | --- | --- | --- |
| 400 | `invalid_document` | `empty` \| `unsupported_format` \| `corrupted` | The file is not usable; `corrupted` is a JPEG or PNG whose structure is broken (a segment or chunk running past the end, no end marker). |
| 400 | `bad_request` | - | `file` or `kind` is missing, or `year` is not a number. |
| 413 | `payload_too_large` | - | The file is over 10 MB: the server's upload limit answers before the service sees it. The app must check the size itself (a PDF cannot be compressed like a photo); above 11 MB the connection may be reset instead. |
| 400 | `invalid_document_fields` | `kind` \| `year` \| `title` \| `issuer` | A field is wrong. |
| 404 | `document_not_found` | - | No such document of this agrochemist. |
| 409 | `agrochemist_already_approved` | - | Documents of an approved profile cannot be added or removed. |
| 409 | `document_limit_reached` | - | Already 5 documents. |
| 409 | `agrochemist_profile_missing` | - | The account has the role but no profile. |
| 503 | `storage_unavailable` | - | The storage does not answer; try again. |

**Metadata.** A JPEG or PNG document is cleaned like a diagnosis photo before it is stored (GPS, camera, time, author, thumbnails and trailers are removed; the orientation is kept; the pixels do not change), see "Photo metadata is removed on the server" in [ai-predict.md](ai-predict.md). `sizeBytes` is the size after the cleaning. **Limitation: a PDF is stored exactly as it was sent**, with its own metadata (author, producer, dates, XMP) and any embedded content; only the admins read it, and the file is private (see `docs/architecture.md`).

## For the admin

All endpoints need the `admin` role.

| Method and path | What it does |
| --- | --- |
| `GET /api/admin/agrochemists?status=pending&page=0&size=20` | The queue: agrochemists with the status (default `pending`), the longest waiting first, with `documentCount`. |
| `GET /api/admin/agrochemists/{userId}` | One agrochemist: contacts (`phone`, `email`), specialization, the state of the check and the documents. |
| `GET /api/admin/agrochemists/{userId}/documents/{documentId}/file` | The file as a download (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`) with the type recorded at upload. |
| `POST /api/admin/agrochemists/{userId}/decision` | Body `{"decision": "approve" \| "reject" \| "request_documents", "reason": "..."}`. Returns the agrochemist as `GET` does. |

A `reject` and a `request_documents` need a non-blank `reason` (`400 reason_required`), which the agrochemist sees in `rejectionReason`. An `approve` needs at least one document (`409 no_documents`) and clears the reason. The decision is recorded with the admin (`reviewedBy`) and the time (`reviewedAt`); an admin may change an earlier decision, but not one on their own profile (`403 self_review_forbidden`). An unknown `decision`, a reason over 1000 characters or a bad `status`, `page` or `size` in the queue is `400 validation_failed`; a `page` over 10000 is refused. An unknown agrochemist is `404 agrochemist_not_found`, an unknown document (or one whose file is missing from the storage) `404 document_not_found`.

Sending, removing and deciding take a lock on the profile, so an approval is never undone by an upload that was checked a moment before, the limit of 5 holds for parallel uploads, and an approved profile never ends up without documents. The file is named `document-{id}.pdf|jpg|png` and is sent with `Content-Security-Policy: sandbox`; the admin web must offer it as a download and not render a PDF on its own origin.

Not done here: notifying the agrochemist of the decision (push, task B14) and the first admin account (created outside the API).
