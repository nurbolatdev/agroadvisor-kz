-- An admin invites a verified agrochemist to answer a community question. The invitation is kept in its own
-- table (not only as a notification): notifications are the recipient's feed, which they read and clear.

CREATE TABLE community_invitations (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id   uuid        NOT NULL REFERENCES community_questions (id) ON DELETE CASCADE,
    agrochemist_id uuid       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    invited_by    uuid        NOT NULL REFERENCES users (id),
    created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT community_invitations_pair_key UNIQUE (question_id, agrochemist_id)
);

-- The unique key covers lookups by question; this index serves the cascade of a deleted agrochemist
CREATE INDEX community_invitations_agrochemist_idx ON community_invitations (agrochemist_id);

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'consultation_requested', 'consultation_accepted', 'consultation_declined', 'consultation_closed',
    'consultation_message', 'verification_approved', 'verification_rejected',
    'verification_documents_requested', 'diagnosis_reviewed',
    'community_answer', 'community_answer_accepted', 'community_question', 'community_invitation'));

ALTER TABLE notifications DROP CONSTRAINT notifications_refs_match_type;
ALTER TABLE notifications ADD CONSTRAINT notifications_refs_match_type CHECK (
    CASE
        WHEN type IN ('consultation_requested', 'consultation_accepted', 'consultation_declined',
                      'consultation_closed')
            THEN consultation_id IS NOT NULL AND message_id IS NULL AND diagnosis_id IS NULL
                 AND question_id IS NULL AND answer_id IS NULL
        WHEN type = 'consultation_message'
            THEN consultation_id IS NOT NULL AND message_id IS NOT NULL AND diagnosis_id IS NULL
                 AND question_id IS NULL AND answer_id IS NULL
        WHEN type = 'diagnosis_reviewed'
            THEN diagnosis_id IS NOT NULL AND consultation_id IS NULL AND message_id IS NULL
                 AND question_id IS NULL AND answer_id IS NULL
        WHEN type IN ('community_answer', 'community_answer_accepted')
            THEN question_id IS NOT NULL AND answer_id IS NOT NULL AND consultation_id IS NULL
                 AND message_id IS NULL AND diagnosis_id IS NULL
        WHEN type IN ('community_question', 'community_invitation')
            THEN question_id IS NOT NULL AND answer_id IS NULL AND consultation_id IS NULL
                 AND message_id IS NULL AND diagnosis_id IS NULL
        ELSE consultation_id IS NULL AND message_id IS NULL AND diagnosis_id IS NULL
             AND question_id IS NULL AND answer_id IS NULL
    END);
