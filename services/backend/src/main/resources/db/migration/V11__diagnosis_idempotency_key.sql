-- B9.1: a client that never got the answer resends the photo with the same Idempotency-Key and gets
-- the diagnosis that was already made (no second photo, no second model call).
-- idempotency_key is nullable: the header is optional. The index is partial, so rows without a key do not collide.
-- request_fingerprint is the SHA-256 (hex) of the photo bytes: the same key with another photo is refused.
-- Undo: DROP INDEX diagnoses_user_idempotency_key_uq;
--       ALTER TABLE diagnoses DROP COLUMN idempotency_key, DROP COLUMN request_fingerprint;
ALTER TABLE diagnoses ADD COLUMN idempotency_key varchar(80);
ALTER TABLE diagnoses ADD COLUMN request_fingerprint varchar(64)
    CONSTRAINT diagnoses_request_fingerprint_hex CHECK (request_fingerprint ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX diagnoses_user_idempotency_key_uq
    ON diagnoses (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
