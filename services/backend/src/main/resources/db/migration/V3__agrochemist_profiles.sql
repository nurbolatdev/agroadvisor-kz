-- Agrochemist profiles. An agrochemist is hidden from farmers until an admin approves
-- the documents; documents are stored in S3 storage (SeaweedFS), only object keys live here.

CREATE TABLE agrochemist_profiles (
    user_id             uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    specialization      varchar(160),
    experience_years    smallint CHECK (experience_years BETWEEN 0 AND 80),
    rating              numeric(2, 1) CHECK (rating BETWEEN 0 AND 5),
    verification_status varchar(30) NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'approved', 'rejected', 'documents_requested')),
    verified            boolean GENERATED ALWAYS AS (verification_status = 'approved') STORED,
    submitted_at        timestamptz NOT NULL DEFAULT now(),
    reviewed_at         timestamptz,
    reviewed_by         uuid REFERENCES users (id),
    rejection_reason    text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agrochemist_profiles_status_idx ON agrochemist_profiles (verification_status);

CREATE TABLE agrochemist_documents (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid         NOT NULL REFERENCES agrochemist_profiles (user_id) ON DELETE CASCADE,
    kind        varchar(20)  NOT NULL CHECK (kind IN ('diploma', 'certificate')),
    object_key  varchar(512) NOT NULL,
    title       varchar(200),
    issuer      varchar(200),
    year        smallint CHECK (year BETWEEN 1950 AND 2100),
    uploaded_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX agrochemist_documents_user_id_idx ON agrochemist_documents (user_id);

-- Crops and districts the agrochemist works with
CREATE TABLE agrochemist_crops (
    user_id   uuid        NOT NULL REFERENCES agrochemist_profiles (user_id) ON DELETE CASCADE,
    crop_code varchar(40) NOT NULL REFERENCES crops (code),
    PRIMARY KEY (user_id, crop_code)
);

CREATE INDEX agrochemist_crops_crop_code_idx ON agrochemist_crops (crop_code);

CREATE TABLE agrochemist_districts (
    user_id     uuid   NOT NULL REFERENCES agrochemist_profiles (user_id) ON DELETE CASCADE,
    district_id bigint NOT NULL REFERENCES districts (id),
    PRIMARY KEY (user_id, district_id)
);

CREATE INDEX agrochemist_districts_district_id_idx ON agrochemist_districts (district_id);
