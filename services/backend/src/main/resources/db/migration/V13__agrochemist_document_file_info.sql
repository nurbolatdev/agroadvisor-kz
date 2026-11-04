-- B10: the API serves an agrochemist's document to the admin, so the table must know what the object is.
-- content_type is what the upload was recognised as (by its first bytes, never by the client's header);
-- size_bytes is what was stored. Nothing wrote to agrochemist_documents before B10, so there are no rows
-- to fill; the guard below refuses to apply the migration if there are some, instead of inventing values.
-- Undo: ALTER TABLE agrochemist_documents DROP COLUMN content_type, DROP COLUMN size_bytes;
DO $$
DECLARE
    existing bigint;
BEGIN
    SELECT count(*) INTO existing FROM agrochemist_documents;
    IF existing > 0 THEN
        RAISE EXCEPTION 'V13 cannot be applied: agrochemist_documents has % rows without content_type and size_bytes', existing;
    END IF;
END $$;

ALTER TABLE agrochemist_documents
    ADD COLUMN content_type varchar(30) NOT NULL
        CONSTRAINT agrochemist_documents_content_type_check
        CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    ADD COLUMN size_bytes integer NOT NULL
        CONSTRAINT agrochemist_documents_size_bytes_check CHECK (size_bytes > 0);
