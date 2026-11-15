-- Push tokens of user devices and the in-app notification feed.
-- Notifications carry only a type and references (ids, counters), never names or message text.
-- A token is unique across users: a device that signs in under another account moves the token.

CREATE TABLE push_tokens (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Printable ASCII without spaces
    token      varchar(512) NOT NULL CHECK (token ~ '^[!-~]+$'),
    -- android: raw FCM token, ios: raw APNs token, expo: Expo push token
    platform   varchar(10)  NOT NULL CHECK (platform IN ('android', 'ios', 'expo')),
    created_at timestamptz  NOT NULL DEFAULT now(),
    -- Time of the last registration
    updated_at timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT push_tokens_token_key UNIQUE (token)
);

CREATE INDEX push_tokens_user_updated_idx ON push_tokens (user_id, updated_at DESC);

CREATE TABLE notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type            varchar(40) NOT NULL CHECK (type IN (
        'consultation_requested', 'consultation_accepted', 'consultation_declined', 'consultation_closed',
        'consultation_message', 'verification_approved', 'verification_rejected',
        'verification_documents_requested', 'diagnosis_reviewed')),
    consultation_id uuid        REFERENCES consultations (id) ON DELETE CASCADE,
    message_id      uuid        REFERENCES consultation_messages (id) ON DELETE CASCADE,
    diagnosis_id    uuid        REFERENCES diagnoses (id) ON DELETE CASCADE,
    -- Unread rows with the same key of one recipient collapse into one row with a counter
    collapse_key    varchar(100),
    event_count     integer     NOT NULL DEFAULT 1 CHECK (event_count > 0),
    created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    read_at         timestamptz,
    CONSTRAINT notifications_refs_match_type CHECK (
        CASE
            WHEN type IN ('consultation_requested', 'consultation_accepted', 'consultation_declined',
                          'consultation_closed')
                THEN consultation_id IS NOT NULL AND message_id IS NULL AND diagnosis_id IS NULL
            WHEN type = 'consultation_message'
                THEN consultation_id IS NOT NULL AND message_id IS NOT NULL AND diagnosis_id IS NULL
            WHEN type = 'diagnosis_reviewed'
                THEN diagnosis_id IS NOT NULL AND consultation_id IS NULL AND message_id IS NULL
            ELSE consultation_id IS NULL AND message_id IS NULL AND diagnosis_id IS NULL
        END)
);

CREATE INDEX notifications_feed_idx ON notifications (recipient_id, updated_at DESC, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (recipient_id) WHERE read_at IS NULL;
-- Foreign keys with ON DELETE CASCADE: without an index each parent delete scans the table
CREATE INDEX notifications_consultation_idx ON notifications (consultation_id) WHERE consultation_id IS NOT NULL;
CREATE INDEX notifications_message_idx ON notifications (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX notifications_diagnosis_idx ON notifications (diagnosis_id) WHERE diagnosis_id IS NOT NULL;
CREATE UNIQUE INDEX notifications_collapse_idx
    ON notifications (recipient_id, collapse_key) WHERE read_at IS NULL;
