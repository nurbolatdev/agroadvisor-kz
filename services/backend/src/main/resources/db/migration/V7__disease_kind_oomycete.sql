-- Late blight (Phytophthora) is caused by an oomycete, which is neither a fungus nor
-- a bacterium: the treatment and the advice differ, so it gets its own kind.
ALTER TABLE diseases DROP CONSTRAINT diseases_kind_check;
ALTER TABLE diseases ADD CONSTRAINT diseases_kind_check
    CHECK (kind IN ('fungal', 'oomycete', 'bacterial', 'viral', 'pest', 'healthy', 'other'));
