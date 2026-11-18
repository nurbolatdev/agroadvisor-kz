-- Agro shops for the map (screen 18) and the reports of farmers about them.
-- The point is kept as two numbers and the geometry is computed by the database (like fields), so the
-- nearby search uses the GiST index and the entity needs no spatial mapping.
-- region_id and district_id are optional; the admin API (B12) sets them when it writes a shop.
-- Shops are added and changed by an admin (the admin API comes with B12); a farmer only reads them and
-- sends a request: a new shop, wrong information, or a shop that is closed. There is no phone button in
-- the app, the phone is only shown as text.

CREATE TABLE shops (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(120)  NOT NULL CHECK (name = btrim(name) AND name <> ''),
    address     varchar(255)  NOT NULL CHECK (address = btrim(address) AND address <> ''),
    phone       varchar(40),
    hours       varchar(120),
    -- what the shop sells: seeds, fertilizers, protection, machinery, ...; free codes, not a table
    categories  text[]        NOT NULL DEFAULT '{}',
    latitude    numeric(8, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude   numeric(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    location    geometry(Point, 4326) GENERATED ALWAYS AS
                    (ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)) STORED,
    region_id   bigint REFERENCES regions (id),
    district_id bigint REFERENCES districts (id),
    -- a hidden shop is not shown to farmers
    status      varchar(10)   NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX shops_location_idx ON shops USING gist (location);
CREATE INDEX shops_region_id_idx ON shops (region_id) WHERE status = 'active';

-- A farmer's report. new_shop has no shop_id and carries the details; wrong_info and closed point at a shop.
CREATE TABLE shop_requests (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id  uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       varchar(15)   NOT NULL CHECK (type IN ('new_shop', 'wrong_info', 'closed')),
    shop_id    uuid REFERENCES shops (id) ON DELETE CASCADE,
    -- what the farmer wrote: name, address, a point, what is wrong
    comment    varchar(1000) NOT NULL CHECK (comment = btrim(comment) AND comment <> ''),
    latitude   numeric(8, 6) CHECK (latitude BETWEEN -90 AND 90),
    longitude  numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
    status     varchar(10)   NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done', 'rejected')),
    created_at timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT shop_requests_shop_by_type CHECK ((type = 'new_shop') = (shop_id IS NULL)),
    CONSTRAINT shop_requests_coordinates_together CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX shop_requests_author_id_created_at_idx ON shop_requests (author_id, created_at);
CREATE INDEX shop_requests_status_created_at_idx ON shop_requests (status, created_at);
