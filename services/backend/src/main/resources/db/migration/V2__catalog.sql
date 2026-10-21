-- Crops, diseases and treatments. Codes are the AI class registry codes
-- (services/ai-service/ml/classes.yaml); reference data itself is added by the catalog task.

CREATE TABLE crops (
    code       varchar(40) PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
    names      jsonb       NOT NULL CHECK (names ?& ARRAY['ru', 'kk', 'en']),
    sort_order integer     NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diseases (
    -- Class code, e.g. tomato__late_blight; also healthy classes and unknown
    code       varchar(80) PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
    crop_code  varchar(40) REFERENCES crops (code),
    kind       varchar(20) NOT NULL
        CHECK (kind IN ('fungal', 'bacterial', 'viral', 'pest', 'healthy', 'other')),
    severity   varchar(10) CHECK (severity IN ('low', 'medium', 'high')),
    latin_name varchar(160),
    names      jsonb       NOT NULL CHECK (names ?& ARRAY['ru', 'kk', 'en']),
    -- Texts per language: {"ru": [...], "kk": [...], "en": [...]} for lists, strings otherwise
    symptoms   jsonb,
    conditions jsonb,
    prevention jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- Only the unknown class has no crop
    CONSTRAINT diseases_crop_required CHECK (crop_code IS NOT NULL OR code = 'unknown')
);

CREATE INDEX diseases_crop_code_idx ON diseases (crop_code);

CREATE TABLE treatments (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    disease_code      varchar(80)  NOT NULL REFERENCES diseases (code) ON DELETE CASCADE,
    type              varchar(20)  NOT NULL CHECK (type IN ('chemical', 'biological')),
    product           varchar(160) NOT NULL,
    active_ingredient varchar(160),
    dosage            jsonb,
    method            jsonb,
    sort_order        integer      NOT NULL DEFAULT 0,
    created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX treatments_disease_code_idx ON treatments (disease_code, type, sort_order);
