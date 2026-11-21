-- Notifications about the community: a new answer, a best answer and a new question of a followed crop.
-- They point to a question and, for answers, to the answer; like the other references they are plain ids.

ALTER TABLE notifications
    ADD COLUMN question_id uuid REFERENCES community_questions (id) ON DELETE CASCADE,
    ADD COLUMN answer_id   uuid REFERENCES community_answers (id) ON DELETE CASCADE;

-- Foreign keys with ON DELETE CASCADE: without an index each parent delete scans the table
CREATE INDEX notifications_question_idx ON notifications (question_id) WHERE question_id IS NOT NULL;
CREATE INDEX notifications_answer_idx ON notifications (answer_id) WHERE answer_id IS NOT NULL;

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'consultation_requested', 'consultation_accepted', 'consultation_declined', 'consultation_closed',
    'consultation_message', 'verification_approved', 'verification_rejected',
    'verification_documents_requested', 'diagnosis_reviewed',
    'community_answer', 'community_answer_accepted', 'community_question'));

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
        WHEN type = 'community_question'
            THEN question_id IS NOT NULL AND answer_id IS NULL AND consultation_id IS NULL
                 AND message_id IS NULL AND diagnosis_id IS NULL
        ELSE consultation_id IS NULL AND message_id IS NULL AND diagnosis_id IS NULL
             AND question_id IS NULL AND answer_id IS NULL
    END);
