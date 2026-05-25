-- Per-branch, per-product stock quantities sourced from TCNTPdtInWha × TCNMBranch.
-- Primary key is (product_code, branch_code) — each sync is a full replace via upsert.
CREATE TABLE IF NOT EXISTS product_branch_stock (
  product_code  TEXT           NOT NULL,
  branch_code   TEXT           NOT NULL,
  qty           NUMERIC(14,4)  NOT NULL DEFAULT 0,
  synced_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_code, branch_code)
);

CREATE INDEX IF NOT EXISTS idx_pbs_branch  ON product_branch_stock (branch_code);
CREATE INDEX IF NOT EXISTS idx_pbs_product ON product_branch_stock (product_code);
