-- Regions, districts, users and roles.
-- Translated names are jsonb {"ru": ..., "kk": ..., "en": ...}; all three languages are required.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE regions (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       varchar(40) NOT NULL UNIQUE,
    names      jsonb       NOT NULL CHECK (names ?& ARRAY['ru', 'kk', 'en']),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE districts (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id  bigint      NOT NULL REFERENCES regions (id),
    code       varchar(60) NOT NULL UNIQUE,
    names      jsonb       NOT NULL CHECK (names ?& ARRAY['ru', 'kk', 'en']),
    -- District outline for the disease map (ST_Within); filled in later
    boundary   geometry(MultiPolygon, 4326),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX districts_region_id_idx ON districts (region_id);
CREATE INDEX districts_boundary_idx ON districts USING gist (boundary);

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone         varchar(20) UNIQUE CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
    email         varchar(120),
    password_hash varchar(100) NOT NULL,
    full_name     varchar(120) NOT NULL,
    language      char(2)      NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'kk', 'en')),
    status        varchar(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
    region_id     bigint REFERENCES regions (id),
    district_id   bigint REFERENCES districts (id),
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT users_contact_required CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- Emails are unique regardless of case
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE INDEX users_district_id_idx ON users (district_id);

-- A user can have several roles: an agrochemist may also farm
CREATE TABLE roles (
    code  varchar(20) PRIMARY KEY,
    names jsonb       NOT NULL CHECK (names ?& ARRAY['ru', 'kk', 'en'])
);

INSERT INTO roles (code, names) VALUES
    ('farmer',      '{"ru": "Фермер", "kk": "Фермер", "en": "Farmer"}'),
    ('agrochemist', '{"ru": "Агрохимик", "kk": "Агрохимик", "en": "Agrochemist"}'),
    ('admin',       '{"ru": "Администратор", "kk": "Әкімші", "en": "Administrator"}');

CREATE TABLE user_roles (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_code  varchar(20) NOT NULL REFERENCES roles (code),
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_code)
);
