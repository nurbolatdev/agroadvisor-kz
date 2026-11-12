-- A person checks a diagnosis: the verdict, the class that is right and a comment. The outbreak map counts
-- only confirmed diagnoses, "AI quality" compares the model with these verdicts, and they become training data.
-- Who may review (a verified agrochemist or an administrator) is decided by the service, not by the table.

CREATE TABLE diagnosis_reviews (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    diagnosis_id uuid         NOT NULL REFERENCES diagnoses (id) ON DELETE CASCADE,
    -- NO ACTION on purpose, as agrochemist_profiles.reviewed_by: a reviewer is blocked, not deleted (audit trail)
    reviewer_id  uuid         NOT NULL REFERENCES users (id),
    verdict      varchar(20)  NOT NULL CHECK (verdict IN ('confirmed', 'corrected', 'unclear')),
    -- The class that is right, empty exactly when the verdict is 'unclear'. The service keeps the rule the table
    -- cannot check (it compares with another table): for 'confirmed' it is the model's top1_code of the diagnosis,
    -- for 'corrected' another class. It is stored for 'confirmed' too, so a verdict stays readable on its own.
    -- No foreign key, like diagnoses.top1_code: the class may not be in the catalog yet (docs/ai/classes.md).
    correct_code varchar(80)  CHECK (correct_code <> '' AND correct_code = btrim(correct_code)),
    comment      text         CHECK (char_length(comment) <= 2000),
    created_at   timestamptz  NOT NULL DEFAULT now(),
    -- A reviewer who changes their mind updates their own row; the service sets this time
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT diagnosis_reviews_code_unless_unclear CHECK ((verdict = 'unclear') = (correct_code IS NULL)),
    -- One opinion per person; two people may disagree, so a diagnosis can have several rows
    CONSTRAINT diagnosis_reviews_one_per_reviewer UNIQUE (diagnosis_id, reviewer_id)
);

CREATE INDEX diagnosis_reviews_reviewer_id_created_at_idx ON diagnosis_reviews (reviewer_id, created_at DESC);

-- The region is copied into a diagnosis when it finishes; the outbreak map and the regional statistics ask
-- "how many of a class in a region in a period".
CREATE INDEX diagnoses_region_id_created_at_idx ON diagnoses (region_id, created_at);
