-- B9.2: a diagnosis saved with an Idempotency-Key must carry the photo fingerprint, otherwise a repeat could
-- not tell the same photo from another one. The code always writes both; this makes the database refuse the rest.
-- V11 is already applied elsewhere and is not edited.
-- Undo: ALTER TABLE diagnoses DROP CONSTRAINT diagnoses_idempotency_key_needs_fingerprint;
DO $$
DECLARE
    broken bigint;
BEGIN
    SELECT count(*) INTO broken FROM diagnoses WHERE idempotency_key IS NOT NULL AND request_fingerprint IS NULL;
    IF broken > 0 THEN
        RAISE EXCEPTION 'V12 cannot be applied: % diagnoses have an idempotency_key but no request_fingerprint', broken;
    END IF;
END $$;

ALTER TABLE diagnoses
    ADD CONSTRAINT diagnoses_idempotency_key_needs_fingerprint
    CHECK (idempotency_key IS NULL OR request_fingerprint IS NOT NULL);
