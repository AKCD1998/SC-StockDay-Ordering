CREATE TABLE IF NOT EXISTS branch_stock_snapshots (
  product_code TEXT PRIMARY KEY,
  product_name_thai TEXT,
  product_name_eng TEXT,
  barcode TEXT,
  unit TEXT,
  qty_branch_000 NUMERIC NOT NULL DEFAULT 0,
  qty_branch_001 NUMERIC NOT NULL DEFAULT 0,
  qty_branch_002 NUMERIC NOT NULL DEFAULT 0,
  qty_branch_003 NUMERIC NOT NULL DEFAULT 0,
  qty_branch_004 NUMERIC NOT NULL DEFAULT 0,
  qty_branch_005 NUMERIC NOT NULL DEFAULT 0,
  qty_total_all_branches NUMERIC NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branch_stock_snapshots_search
  ON branch_stock_snapshots (product_code, product_name_thai, product_name_eng, barcode);
