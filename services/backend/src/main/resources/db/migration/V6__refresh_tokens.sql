-- Refresh tokens. Only the SHA-256 hash of the opaque token is stored.
-- Tokens form a family (one login on one device): every refresh issues a new token in the
-- same family and marks the old one as used; presenting a used token revokes the family.

CREATE TABLE refresh_tokens (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    family_id  uuid        NOT NULL,
    token_hash char(64)    NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT refresh_tokens_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_id_idx ON refresh_tokens (family_id);
-- Cleanup of expired tokens
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
