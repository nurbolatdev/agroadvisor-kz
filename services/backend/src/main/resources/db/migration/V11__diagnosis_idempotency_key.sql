-- B9.1: a client that never got the answer resends the photo with the same Idempotency-Key and gets
-- the diagnosis that was already made (no second photo, no second model call).
-- Nullable: the header is optional. The index is partial, so rows without a key do not collide.
-- Undo: DROP INDEX diagnoses_user_idempotency_key_uq; ALTER TABLE diagnoses DROP COLUMN idempotency_key;
ALTER TABLE diagnoses ADD COLUMN idempotency_key varchar(80);

CREATE UNIQUE INDEX diagnoses_user_idempotency_key_uq
    ON diagnoses (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
