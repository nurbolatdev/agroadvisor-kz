-- Feature access: business code checks "may this user use feature X" instead of roles,
-- so paid plans can be added later without code changes. For now every user is on FREE
-- and every feature is unlimited (daily_limit NULL). Per-minute rate limits live in Redis.

CREATE TABLE plan (
    code       varchar(30) PRIMARY KEY,
    names      jsonb       NOT NULL CHECK (names ?& ARRAY['ru', 'kk', 'en']),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feature (
    code        varchar(40) PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
    description text        NOT NULL
);

CREATE TABLE plan_feature (
    plan_code    varchar(30) NOT NULL REFERENCES plan (code) ON DELETE CASCADE,
    feature_code varchar(40) NOT NULL REFERENCES feature (code) ON DELETE CASCADE,
    -- Uses per day; NULL means unlimited
    daily_limit  integer CHECK (daily_limit > 0),
    PRIMARY KEY (plan_code, feature_code)
);

INSERT INTO plan (code, names) VALUES
    ('FREE', '{"ru": "Бесплатный", "kk": "Тегін", "en": "Free"}');

INSERT INTO feature (code, description) VALUES
    ('diagnosis',     'Photo diagnosis of plant diseases'),
    ('community',     'Farmer community: questions, answers, votes'),
    ('consultations', 'Consultations and chat with agrochemists'),
    ('disease_map',   'Disease map and outbreak alerts'),
    ('weather',       'Agro weather and spraying hints'),
    ('calculator',    'Farm economics calculator'),
    ('shops',         'Nearby agro shops'),
    ('catalog',       'Disease and pest reference');

INSERT INTO plan_feature (plan_code, feature_code, daily_limit)
SELECT 'FREE', code, NULL FROM feature;
