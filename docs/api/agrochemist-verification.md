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
| 400 | `invalid_document` | `empty` \| `too_large` \| `unsupported_format` | The file is not usable. |
| 400 | `invalid_document_fields` | `kind` \| `year` \| `title` \| `issuer` | A field is wrong. |
| 404 | `document_not_found` | - | No such document of this agrochemist. |
| 409 | `agrochemist_already_approved` | - | Documents of an approved profile cannot be added or removed. |
| 409 | `document_limit_reached` | - | Already 5 documents. |
| 409 | `agrochemist_profile_missing` | - | The account has the role but no profile. |
| 503 | `storage_unavailable` | - | The storage does not answer; try again. |

The document images are stored as they were sent, with their metadata (photos of a diploma may carry GPS); only the admins read them.

## For the admin

All endpoints need the `admin` role.

| Method and path | What it does |
| --- | --- |
| `GET /api/admin/agrochemists?status=pending&page=0&size=20` | The queue: agrochemists with the status (default `pending`), the longest waiting first, with `documentCount`. |
| `GET /api/admin/agrochemists/{userId}` | One agrochemist: contacts (`phone`, `email`), specialization, the state of the check and the documents. |
| `GET /api/admin/agrochemists/{userId}/documents/{documentId}/file` | The file as a download (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`) with the type recorded at upload. |
| `POST /api/admin/agrochemists/{userId}/decision` | Body `{"decision": "approve" \| "reject" \| "request_documents", "reason": "..."}`. Returns the agrochemist as `GET` does. |

A `reject` and a `request_documents` need a non-blank `reason` (up to 1000 characters; `400 reason_required`), which the agrochemist sees in `rejectionReason`. An `approve` needs at least one document (`409 no_documents`) and clears the reason. The decision is recorded with the admin (`reviewedBy`) and the time (`reviewedAt`); an admin may change an earlier decision.

Not done here: notifying the agrochemist of the decision (push, task B14) and the first admin account (created outside the API).
