-- Farmer fields. The area is stored in hectares; area_unit remembers what the farmer typed
-- (hectares or sotki) so the app can show it back in the same unit.
-- The point is kept as two numbers and the geometry is computed by the database, so they never
-- disagree and the entity does not need a spatial mapping.
-- region_id and district_id are set by the server and copied at write time, like in diagnoses.

CREATE TABLE fields (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        varchar(80)   NOT NULL CHECK (name = btrim(name) AND name <> ''),
    crop_code   varchar(40)   NOT NULL REFERENCES crops (code),
    area_ha     numeric(9, 4) NOT NULL CHECK (area_ha > 0 AND area_ha <= 10000),
    area_unit   varchar(5)    NOT NULL CHECK (area_unit IN ('ha', 'sotka')),
    latitude    numeric(8, 6) CHECK (latitude BETWEEN -90 AND 90),
    longitude   numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
    location    geometry(Point, 4326) GENERATED ALWAYS AS
                    (ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)) STORED,
    region_id   bigint REFERENCES regions (id),
    district_id bigint REFERENCES districts (id),
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT fields_coordinates_together CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX fields_owner_id_created_at_idx ON fields (owner_id, created_at);
CREATE INDEX fields_location_idx ON fields USING gist (location);

INSERT INTO feature (code, description) VALUES
    ('fields', 'Farmer fields: crop, area, location');

INSERT INTO plan_feature (plan_code, feature_code, daily_limit) VALUES
    ('FREE', 'fields', NULL);
