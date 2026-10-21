# Database ER diagram

PostgreSQL 16 + PostGIS. The schema is owned by Flyway migrations in [`services/backend/src/main/resources/db/migration`](../../services/backend/src/main/resources/db/migration); this page describes migrations `V1`–`V5`.

Conventions:

- Translated texts are `jsonb` objects `{"ru": …, "kk": …, "en": …}`; for names all three languages are required by a check constraint.
- Users, diagnoses and documents use `uuid` keys (they appear in URLs and the API); reference data uses readable codes (`tomato`, `tomato__late_blight`, `farmer`, `FREE`).
- Coordinates are `geometry(…, 4326)` with GiST indexes.
- Photos and documents are stored in S3 storage (SeaweedFS); tables keep only object keys.

## Current schema

```mermaid
erDiagram
    regions ||--o{ districts : contains
    regions |o--o{ users : "lives in"
    districts |o--o{ users : "lives in"
    users ||--o{ user_roles : has
    roles ||--o{ user_roles : "granted as"
    users ||--o| agrochemist_profiles : "may be"
    agrochemist_profiles ||--o{ agrochemist_documents : uploads
    agrochemist_profiles ||--o{ agrochemist_crops : "works with"
    agrochemist_profiles ||--o{ agrochemist_districts : "works in"
    crops ||--o{ agrochemist_crops : ""
    districts ||--o{ agrochemist_districts : ""
    crops |o--o{ diseases : has
    diseases ||--o{ treatments : "treated by"
    plan ||--o{ plan_feature : includes
    feature ||--o{ plan_feature : "included in"
    users ||--o{ diagnoses : requests
    crops ||--o{ diagnoses : "chosen crop"
    districts |o--o{ diagnoses : "made in"

    regions {
        bigint id PK
        varchar code UK
        jsonb names
    }
    districts {
        bigint id PK
        bigint region_id FK
        varchar code UK
        jsonb names
        geometry boundary "MultiPolygon, nullable"
    }
    users {
        uuid id PK
        varchar phone UK "E.164, phone or email required"
        varchar email UK "unique ignoring case"
        varchar password_hash
        varchar full_name
        char language "ru, kk, en"
        varchar status "active, blocked"
        bigint region_id FK
        bigint district_id FK
    }
    roles {
        varchar code PK "farmer, agrochemist, admin"
        jsonb names
    }
    user_roles {
        uuid user_id PK, FK
        varchar role_code PK, FK
    }
    agrochemist_profiles {
        uuid user_id PK, FK
        varchar specialization
        smallint experience_years
        numeric rating "0-5"
        varchar verification_status "pending, approved, rejected, documents_requested"
        boolean verified "generated: status = approved"
        uuid reviewed_by FK
        text rejection_reason
    }
    agrochemist_documents {
        uuid id PK
        uuid user_id FK
        varchar kind "diploma, certificate"
        varchar object_key "S3 key"
        varchar title
        varchar issuer
        smallint year
    }
    agrochemist_crops {
        uuid user_id PK, FK
        varchar crop_code PK, FK
    }
    agrochemist_districts {
        uuid user_id PK, FK
        bigint district_id PK, FK
    }
    crops {
        varchar code PK "as in classes.yaml"
        jsonb names
        int sort_order
    }
    diseases {
        varchar code PK "AI class code"
        varchar crop_code FK "null only for unknown"
        varchar kind "fungal, bacterial, viral, pest, healthy, other"
        varchar severity "low, medium, high"
        varchar latin_name
        jsonb names
        jsonb symptoms
        jsonb conditions
        jsonb prevention
    }
    treatments {
        bigint id PK
        varchar disease_code FK
        varchar type "chemical, biological"
        varchar product
        varchar active_ingredient
        jsonb dosage
        jsonb method
        int sort_order
    }
    plan {
        varchar code PK "FREE"
        jsonb names
    }
    feature {
        varchar code PK
        text description
    }
    plan_feature {
        varchar plan_code PK, FK
        varchar feature_code PK, FK
        int daily_limit "null = unlimited"
    }
    diagnoses {
        uuid id PK
        uuid user_id FK
        varchar crop_code FK
        varchar photo_key "S3 key"
        varchar status "ok, low_confidence, unknown, crop_mismatch"
        varchar top1_code "no FK on purpose"
        numeric top1_confidence
        jsonb top3
        varchar detected_crop "only for crop_mismatch"
        varchar model_version
        int classes_version
        int inference_ms
        bigint region_id FK
        bigint district_id FK
        geometry location "Point, nullable"
    }
```

Seed data in migrations: roles `farmer`, `agrochemist`, `admin`; plan `FREE` with features `diagnosis`, `community`, `consultations`, `disease_map`, `weather`, `calculator`, `shops`, `catalog` — all unlimited. Regions, districts, crops, diseases and treatments are filled by separate data migrations.

### Notes

- **`diagnoses.top1_code` has no foreign key.** A new model may return a class that is not in the catalog yet; the diagnosis is saved and shown as "description coming soon" (rule 5 in [`docs/ai/classes.md`](../ai/classes.md)).
- **`agrochemist_profiles.verified`** is computed from `verification_status`, so the two never disagree. Farmers see only verified agrochemists.
- **Feature access.** Code checks whether the user's plan includes a feature instead of checking roles, so paid plans can be added later as data. Today everyone is on `FREE` and nothing is limited; the per-minute diagnosis rate limit lives in Redis, not in the database.

## Planned tables

Added by later migrations when the corresponding features are built; existing migrations are never edited.

```mermaid
erDiagram
    users ||--o{ fields : owns
    crops ||--o{ fields : grows
    fields |o--o{ diagnoses : "optional field_id"
    diagnoses ||--o{ diagnosis_reviews : "confirmed by"
    users ||--o{ user_subscription : has
    plan ||--o{ user_subscription : ""
    users ||--o{ consultations : "farmer / agrochemist"
    consultations ||--o{ messages : contains
    users ||--o{ post : writes
    post ||--o{ post_image : has
    post ||--o{ answer : has
    answer ||--o{ vote : receives
    users ||--o{ crop_subscription : follows
    users ||--o{ report : files
    users ||--o{ calculation : saves

    fields {
        uuid id PK
        uuid owner_id FK
        varchar crop_code FK
        varchar name
        numeric area_ha
        geometry geom "Point"
    }
    diagnosis_reviews {
        uuid id PK
        uuid diagnosis_id FK
        uuid reviewer_id FK
        varchar confirmed_code
        text comment
    }
    user_subscription {
        uuid id PK
        uuid user_id FK
        varchar plan_code FK
        timestamptz starts_at
        timestamptz ends_at
    }
```

Also planned: `consultations`, `messages`, `agro_shops`, community tables (`post`, `post_image`, `answer`, `vote`, `crop_subscription`, `report`, plus `users.reputation`), `calculation`, `disease_alert`.
