-- Saved product groups for the movement-trace Summary tab.
-- Users can name a set of product codes and reuse it as a filter.
CREATE TABLE IF NOT EXISTS product_movement_groups (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  description   TEXT,
  product_codes TEXT[]      NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
