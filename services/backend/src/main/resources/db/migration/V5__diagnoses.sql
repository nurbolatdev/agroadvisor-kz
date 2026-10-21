-- Diagnosis history. Fields follow the AI service /predict contract (docs/api/ai-predict.md).
-- top1_code has no foreign key on purpose: a new model may return a class that is not in
-- the catalog yet, and the diagnosis must still be saved (rule 5 in docs/ai/classes.md).

CREATE TABLE diagnoses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    crop_code       varchar(40)   NOT NULL REFERENCES crops (code),
    -- Object key in S3 storage (SeaweedFS), not a URL
    photo_key       varchar(512)  NOT NULL,
    status          varchar(20)   NOT NULL
        CHECK (status IN ('ok', 'low_confidence', 'unknown', 'crop_mismatch')),
    top1_code       varchar(80)   NOT NULL,
    top1_confidence numeric(5, 4) NOT NULL CHECK (top1_confidence BETWEEN 0 AND 1),
    -- [{"code": "...", "confidence": 0.91}, ...]
    top3            jsonb         NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(top3) = 'array'),
    detected_crop   varchar(40),
    model_version   varchar(40)   NOT NULL,
    classes_version integer       NOT NULL,
    inference_ms    integer CHECK (inference_ms >= 0),
    region_id       bigint REFERENCES regions (id),
    district_id     bigint REFERENCES districts (id),
    location        geometry(Point, 4326),
    created_at      timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT diagnoses_detected_crop_only_on_mismatch
        CHECK ((status = 'crop_mismatch') = (detected_crop IS NOT NULL))
);

CREATE INDEX diagnoses_user_id_created_at_idx ON diagnoses (user_id, created_at DESC);
CREATE INDEX diagnoses_top1_code_created_at_idx ON diagnoses (top1_code, created_at);
CREATE INDEX diagnoses_district_id_created_at_idx ON diagnoses (district_id, created_at);
CREATE INDEX diagnoses_location_idx ON diagnoses USING gist (location);
