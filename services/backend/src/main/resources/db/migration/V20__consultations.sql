-- Consultations between a farmer and a verified agrochemist, and the chat messages inside them.
-- The request text is the first message. A message has one recipient (the other participant),
-- so read_at on the message is the read receipt.
-- Photos of messages live under the consultations/ key prefix, apart from diagnoses/.

CREATE TABLE consultations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    agrochemist_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    diagnosis_id    uuid        REFERENCES diagnoses (id) ON DELETE SET NULL,
    status          varchar(20) NOT NULL
        CHECK (status IN ('requested', 'active', 'declined', 'closed')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    accepted_at     timestamptz,
    closed_at       timestamptz,
    closed_by       uuid        REFERENCES users (id) ON DELETE SET NULL,
    last_message_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT consultations_participants_differ CHECK (farmer_id <> agrochemist_id),
    CONSTRAINT consultations_status_dates CHECK (
        CASE status
            WHEN 'requested' THEN accepted_at IS NULL AND closed_at IS NULL
            WHEN 'active' THEN accepted_at IS NOT NULL AND closed_at IS NULL
            ELSE closed_at IS NOT NULL
        END)
);

-- One open consultation (waiting or running) per farmer and agrochemist
CREATE UNIQUE INDEX consultations_one_open_per_pair_idx
    ON consultations (farmer_id, agrochemist_id) WHERE status IN ('requested', 'active');
CREATE INDEX consultations_farmer_last_message_idx ON consultations (farmer_id, last_message_at DESC);
CREATE INDEX consultations_agrochemist_status_last_message_idx
    ON consultations (agrochemist_id, status, last_message_at DESC);

CREATE TABLE consultation_messages (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id    uuid         NOT NULL REFERENCES consultations (id) ON DELETE CASCADE,
    sender_id          uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body               varchar(2000) CHECK (body = btrim(body) AND body <> ''),
    -- Object key in S3 storage, not a URL
    photo_key          varchar(512),
    photo_content_type varchar(20) CHECK (photo_content_type IN ('image/jpeg', 'image/png')),
    photo_size_bytes   integer CHECK (photo_size_bytes > 0),
    created_at         timestamptz  NOT NULL DEFAULT clock_timestamp(),
    read_at            timestamptz,
    CONSTRAINT consultation_messages_text_or_photo CHECK (body IS NOT NULL OR photo_key IS NOT NULL),
    CONSTRAINT consultation_messages_photo_fields_together CHECK (
        (photo_key IS NULL) = (photo_content_type IS NULL) AND (photo_key IS NULL) = (photo_size_bytes IS NULL))
);

CREATE INDEX consultation_messages_history_idx
    ON consultation_messages (consultation_id, created_at DESC, id DESC);
CREATE INDEX consultation_messages_unread_idx
    ON consultation_messages (consultation_id) WHERE read_at IS NULL;
-- For the future cleanup of photo objects nobody refers to
CREATE INDEX consultation_messages_photo_key_idx
    ON consultation_messages (photo_key) WHERE photo_key IS NOT NULL;
