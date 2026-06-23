-- Master (HQ-level) retail/wholesale prices sourced from TCNMPdt.
-- No branch_code column — these are the fallback for every branch.
-- channel: 'retail' | 'wholesale'
-- unit_size: 'S' | 'M' | 'L'  (maps to unit_small/medium/large in products)
-- price_level: 1..3  (retail tier 1/2/3, NOT qty-based tiers)
CREATE TABLE IF NOT EXISTS product_price_defaults (
  product_code  TEXT          NOT NULL,
  channel       TEXT          NOT NULL CHECK (channel IN ('retail','wholesale')),
  unit_size     TEXT          NOT NULL CHECK (unit_size IN ('S','M','L')),
  price_level   SMALLINT      NOT NULL CHECK (price_level BETWEEN 1 AND 9),
  price_amount  NUMERIC(18,4) NOT NULL,
  unit_name     TEXT,
  factor        INTEGER,
  snapshot_id   TEXT,
  synced_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_code, channel, unit_size, price_level)
);

CREATE INDEX IF NOT EXISTS idx_price_defaults_product_code
  ON product_price_defaults (product_code);

-- Branch-level price overrides sourced from TCNTPdtBchPrice.
-- Snapshot semantics: when isFinal=true the server purges rows for this
-- branch whose snapshot_id differs from the incoming snapshotId, so a
-- full-branch sync acts as an authoritative replace without a separate delete step.
-- NULL price_amount is never stored here — a zero override is valid, but
-- an absent field means "use master", which is handled by not writing a row.
CREATE TABLE IF NOT EXISTS product_branch_price_overrides (
  product_code  TEXT          NOT NULL,
  branch_code   TEXT          NOT NULL,
  channel       TEXT          NOT NULL CHECK (channel IN ('retail','wholesale')),
  unit_size     TEXT          NOT NULL CHECK (unit_size IN ('S','M','L')),
  price_level   SMALLINT      NOT NULL CHECK (price_level BETWEEN 1 AND 9),
  price_amount  NUMERIC(18,4) NOT NULL,
  unit_name     TEXT,
  factor        INTEGER,
  snapshot_id   TEXT,
  synced_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_code, branch_code, channel, unit_size, price_level)
);

CREATE INDEX IF NOT EXISTS idx_price_overrides_branch_code
  ON product_branch_price_overrides (branch_code);
CREATE INDEX IF NOT EXISTS idx_price_overrides_branch_product
  ON product_branch_price_overrides (branch_code, product_code);
CREATE INDEX IF NOT EXISTS idx_price_overrides_snapshot
  ON product_branch_price_overrides (branch_code, snapshot_id);

-- Pre-resolved effective price per (product, branch, channel, unit_size, price_level).
-- Written by refreshEffectiveBranchPrices after each ingest; the PDA scan
-- endpoint reads only this table — no runtime join required.
-- source: 'override' means a branch row won; 'master' means fallback to defaults.
CREATE TABLE IF NOT EXISTS product_effective_branch_prices (
  product_code    TEXT          NOT NULL,
  branch_code     TEXT          NOT NULL,
  channel         TEXT          NOT NULL,
  unit_size       TEXT          NOT NULL,
  price_level     SMALLINT      NOT NULL,
  price_amount    NUMERIC(18,4) NOT NULL,
  source          TEXT          NOT NULL CHECK (source IN ('override','master')),
  unit_name       TEXT,
  factor          INTEGER,
  price_synced_at TIMESTAMPTZ,
  refreshed_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_code, branch_code, channel, unit_size, price_level)
);

-- Primary read path for PDA barcode scan: branch + product lookup.
CREATE INDEX IF NOT EXISTS idx_effective_prices_branch_product
  ON product_effective_branch_prices (branch_code, product_code);

-- Secondary index for channel-scoped queries (wholesale vs retail).
CREATE INDEX IF NOT EXISTS idx_effective_prices_branch_channel
  ON product_effective_branch_prices (branch_code, channel);
