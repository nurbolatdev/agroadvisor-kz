-- The admin overview and the AI quality page filter diagnoses by a time window (`created_at >= ? AND created_at < ?`)
-- across all users. The existing indexes start with `user_id` or `top1_code`, so every such query scans the table.
-- A plain btree on `created_at` serves the windows, the per-day series and the previous-window comparison.
-- The table is small today, so the index is built in the migration's transaction (no CONCURRENTLY).
-- Undo: DROP INDEX diagnoses_created_at_idx;
CREATE INDEX diagnoses_created_at_idx ON diagnoses (created_at);
