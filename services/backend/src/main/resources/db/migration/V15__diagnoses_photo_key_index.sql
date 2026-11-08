-- #69: the cleanup of orphaned photo objects asks, for batches of up to 500 object keys, which of them some
-- diagnosis still points to (`WHERE photo_key IN (...)`). Without an index that is a scan of the whole table
-- per batch. A plain (not unique) index: the key is unique by construction (a random object name per attempt),
-- but older rows are not guaranteed to be, and the database is not the place to enforce it.
-- The table is small today, so the index is built in the migration's transaction (no CONCURRENTLY).
-- Undo: DROP INDEX diagnoses_photo_key_idx;
CREATE INDEX diagnoses_photo_key_idx ON diagnoses (photo_key);
