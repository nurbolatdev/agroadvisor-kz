-- Farmer community: questions, answers, votes, crop subscriptions, and complaints with admin moderation.
-- Names carry the community_ prefix so they do not clash with consultation_messages or shop_requests.
-- The status of a question is not stored as a column of its own: it comes from accepted_answer_id.
-- Hiding is a separate pair of columns, so returning a hidden item needs no memory of the old status.
-- Photos of questions live under the community/ key prefix, apart from diagnoses/ and consultations/.

CREATE TABLE community_questions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id          uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    crop_code          varchar(40)   NOT NULL REFERENCES crops (code),
    -- copied from the author profile when the question is created
    region_id          bigint        NOT NULL REFERENCES regions (id),
    district_id        bigint REFERENCES districts (id),
    diagnosis_id       uuid REFERENCES diagnoses (id) ON DELETE SET NULL,
    title              varchar(120)  NOT NULL CHECK (title = btrim(title) AND title <> ''),
    body               varchar(2000) NOT NULL CHECK (body = btrim(body) AND body <> ''),
    -- the best answer, chosen by the author; the foreign key below keeps it inside this question
    accepted_answer_id uuid,
    status             varchar(10) GENERATED ALWAYS AS
                           (CASE WHEN accepted_answer_id IS NULL THEN 'open' ELSE 'solved' END) STORED,
    hidden_at          timestamptz,
    hidden_by          uuid REFERENCES users (id),
    created_at         timestamptz   NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT community_questions_hidden_together CHECK ((hidden_at IS NULL) = (hidden_by IS NULL))
);

-- The feed shows visible questions only, newest first
CREATE INDEX community_questions_feed_idx
    ON community_questions (created_at DESC, id DESC) WHERE hidden_at IS NULL;
CREATE INDEX community_questions_crop_feed_idx
    ON community_questions (crop_code, created_at DESC, id DESC) WHERE hidden_at IS NULL;
CREATE INDEX community_questions_region_feed_idx
    ON community_questions (region_id, created_at DESC, id DESC) WHERE hidden_at IS NULL;
CREATE INDEX community_questions_author_idx ON community_questions (author_id, created_at DESC);
CREATE INDEX community_questions_diagnosis_idx
    ON community_questions (diagnosis_id) WHERE diagnosis_id IS NOT NULL;

CREATE TABLE community_question_photos (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id  uuid         NOT NULL REFERENCES community_questions (id) ON DELETE CASCADE,
    -- Object key in S3 storage, not a URL
    photo_key    varchar(512) NOT NULL,
    content_type varchar(20)  NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
    size_bytes   integer      NOT NULL CHECK (size_bytes > 0),
    position     smallint     NOT NULL CHECK (position BETWEEN 0 AND 2),
    CONSTRAINT community_question_photos_position_unique UNIQUE (question_id, position)
);

-- For the future cleanup of photo objects nobody refers to
CREATE INDEX community_question_photos_photo_key_idx ON community_question_photos (photo_key);

CREATE TABLE community_answers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid          NOT NULL REFERENCES community_questions (id) ON DELETE CASCADE,
    author_id   uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body        varchar(2000) NOT NULL CHECK (body = btrim(body) AND body <> ''),
    hidden_at   timestamptz,
    hidden_by   uuid REFERENCES users (id),
    created_at  timestamptz   NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT community_answers_hidden_together CHECK ((hidden_at IS NULL) = (hidden_by IS NULL)),
    -- the target of the composite foreign keys from questions and complaints
    CONSTRAINT community_answers_question_id_id_unique UNIQUE (question_id, id)
);

CREATE INDEX community_answers_question_created_at_idx ON community_answers (question_id, created_at);
CREATE INDEX community_answers_author_idx ON community_answers (author_id);

-- Deleting the best answer makes the question open again; with the column list only accepted_answer_id is cleared
ALTER TABLE community_questions ADD CONSTRAINT community_questions_accepted_answer_fk
    FOREIGN KEY (id, accepted_answer_id) REFERENCES community_answers (question_id, id)
    ON DELETE SET NULL (accepted_answer_id);

-- One vote per user and answer: +1 or -1
CREATE TABLE community_votes (
    answer_id  uuid        NOT NULL REFERENCES community_answers (id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    value      smallint    NOT NULL CHECK (value IN (-1, 1)),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (answer_id, user_id)
);

CREATE INDEX community_votes_user_idx ON community_votes (user_id);

CREATE TABLE community_crop_subscriptions (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    crop_code  varchar(40) NOT NULL REFERENCES crops (code),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, crop_code)
);

CREATE INDEX community_crop_subscriptions_crop_idx ON community_crop_subscriptions (crop_code);

-- A case of moderation: one open case per target, all reports about it hang under it.
-- After the admin resolves the case, a new report opens a new case.
CREATE TABLE community_complaints (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type varchar(10)  NOT NULL CHECK (target_type IN ('question', 'answer')),
    question_id uuid         NOT NULL REFERENCES community_questions (id) ON DELETE CASCADE,
    answer_id   uuid,
    status      varchar(15)  NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
    created_at  timestamptz  NOT NULL DEFAULT clock_timestamp(),
    started_at  timestamptz,
    resolved_at timestamptz,
    resolved_by uuid REFERENCES users (id),
    action      varchar(10) CHECK (action IN ('keep', 'hide', 'block')),
    comment     varchar(500) CHECK (comment = btrim(comment) AND comment <> ''),
    CONSTRAINT community_complaints_started_with_work CHECK (status <> 'in_progress' OR started_at IS NOT NULL),
    CONSTRAINT community_complaints_answer_belongs_to_question
        FOREIGN KEY (question_id, answer_id) REFERENCES community_answers (question_id, id) ON DELETE CASCADE,
    CONSTRAINT community_complaints_answer_by_type CHECK ((target_type = 'answer') = (answer_id IS NOT NULL)),
    CONSTRAINT community_complaints_resolution_together CHECK (
        (status = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND action IS NOT NULL)
        AND (status = 'resolved' OR (resolved_at IS NULL AND resolved_by IS NULL AND action IS NULL)))
);

CREATE UNIQUE INDEX community_complaints_one_open_question_idx
    ON community_complaints (question_id) WHERE answer_id IS NULL AND status <> 'resolved';
CREATE UNIQUE INDEX community_complaints_one_open_answer_idx
    ON community_complaints (answer_id) WHERE answer_id IS NOT NULL AND status <> 'resolved';
CREATE INDEX community_complaints_status_created_at_idx ON community_complaints (status, created_at DESC);
-- For the cascade of deleting a question and for the cases of one question
CREATE INDEX community_complaints_question_idx ON community_complaints (question_id);

-- A single user's report inside a case; sending it again changes nothing
CREATE TABLE community_reports (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id uuid        NOT NULL REFERENCES community_complaints (id) ON DELETE CASCADE,
    reporter_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason       varchar(20) NOT NULL CHECK (reason IN ('ads', 'misinformation', 'spam', 'abuse')),
    comment      varchar(500) CHECK (comment = btrim(comment) AND comment <> ''),
    created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT community_reports_one_per_user UNIQUE (complaint_id, reporter_id)
);

CREATE INDEX community_reports_reporter_idx ON community_reports (reporter_id);
