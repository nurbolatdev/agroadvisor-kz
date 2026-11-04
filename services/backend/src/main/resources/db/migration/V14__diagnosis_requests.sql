-- #60: one model call per Idempotency-Key. A row here means "this request is being processed right now";
-- it is created before the photo is stored and the model is called, and removed when the diagnosis is
-- recorded or the attempt fails. The finished result lives in `diagnoses` (V11/V12 unique index on
-- (user_id, idempotency_key) stays the last guard of the result).
--
-- The primary key is the claim: INSERT ... ON CONFLICT DO NOTHING lets exactly one request in. No lock is
-- held while the model runs. claim_id is a fencing token: a request whose claim expired (started_at older
-- than app.diagnosis.claim-timeout) is taken over by writing a new claim_id, and the slow original can then
-- neither release nor overwrite the new owner's row because it deletes only WHERE claim_id = its own.
-- started_at is set by the database clock so that all backend instances compare against one clock.
-- request_fingerprint and crop_code let a second request with the same key but another photo or crop be
-- refused (422 idempotency_key_reused) while the first is still running, as it is after it has finished.
-- Undo: DROP TABLE diagnosis_requests;
CREATE TABLE diagnosis_requests (
    user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    idempotency_key     varchar(80) NOT NULL,
    request_fingerprint varchar(64) NOT NULL
        CONSTRAINT diagnosis_requests_request_fingerprint_hex CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    crop_code           varchar(40) NOT NULL REFERENCES crops (code),
    claim_id            uuid        NOT NULL,
    started_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, idempotency_key)
);

-- The scheduled cleanup of abandoned rows (older than an hour) scans by age
CREATE INDEX diagnosis_requests_started_at_idx ON diagnosis_requests (started_at);
