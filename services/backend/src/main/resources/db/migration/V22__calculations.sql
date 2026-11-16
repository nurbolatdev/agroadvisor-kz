-- Saved seasons of the farm economics calculator. The formulas run on the device, so the server only
-- stores what the farmer entered (area, yield, price, costs) and what the app calculated from it
-- (results). costs and results are small JSON objects: name -> number. Their keys belong to the app and
-- may change without a migration; the server checks only size and shape.
-- area_ha is hectares; area_unit remembers what the farmer typed (ha or sotka) for display, like fields.
-- The planned name in the ER model is `calculation`; the table is plural like fields and diagnoses.

CREATE TABLE calculations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    crop_code  varchar(40)   NOT NULL REFERENCES crops (code),
    season     smallint      NOT NULL CHECK (season BETWEEN 2000 AND 2100),
    area_ha    numeric(9, 4) NOT NULL CHECK (area_ha > 0 AND area_ha <= 10000),
    area_unit  varchar(5)    NOT NULL CHECK (area_unit IN ('ha', 'sotka')),
    yield_c_ha numeric(8, 2) NOT NULL CHECK (yield_c_ha > 0 AND yield_c_ha <= 10000),
    price_t    numeric(12, 2) NOT NULL CHECK (price_t >= 0),
    costs      jsonb         NOT NULL CHECK (jsonb_typeof(costs) = 'object'),
    results    jsonb         NOT NULL CHECK (jsonb_typeof(results) = 'object'),
    created_at timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX calculations_owner_id_created_at_idx ON calculations (owner_id, created_at DESC);

-- The feature code `calculator` and its FREE plan row already exist (V4).
