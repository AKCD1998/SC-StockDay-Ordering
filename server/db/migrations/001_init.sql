CREATE TABLE IF NOT EXISTS staff_accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'branch_staff')),
  branch_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  branch_code TEXT PRIMARY KEY,
  branch_name TEXT NOT NULL,
  is_hq BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  product_code TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  barcode_1 TEXT,
  barcode_2 TEXT,
  barcode_3 TEXT,
  supplier_code TEXT,
  supplier_name TEXT,
  unit_small TEXT,
  factor_small NUMERIC(14, 4) DEFAULT 1,
  unit_medium TEXT,
  factor_medium NUMERIC(14, 4),
  unit_large TEXT,
  factor_large NUMERIC(14, 4),
  stock_current NUMERIC(14, 4) DEFAULT 0,
  stock_retail NUMERIC(14, 4) DEFAULT 0,
  stock_warehouse NUMERIC(14, 4) DEFAULT 0,
  min_stock NUMERIC(14, 4) DEFAULT 0,
  max_stock NUMERIC(14, 4) DEFAULT 0,
  lead_time_days NUMERIC(14, 2) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_stock_snapshots (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL REFERENCES products(product_code),
  snapshot_at TIMESTAMPTZ NOT NULL,
  stock_current NUMERIC(14, 4) NOT NULL DEFAULT 0,
  stock_retail NUMERIC(14, 4) NOT NULL DEFAULT 0,
  stock_warehouse NUMERIC(14, 4) NOT NULL DEFAULT 0,
  source_name TEXT NOT NULL DEFAULT 'adapos_sync',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_sales_summary (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL REFERENCES products(product_code),
  branch_code TEXT REFERENCES branches(branch_code),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_days INTEGER NOT NULL,
  sold_qty_base NUMERIC(14, 4) NOT NULL DEFAULT 0,
  avg_daily_usage NUMERIC(14, 4) NOT NULL DEFAULT 0,
  source_name TEXT NOT NULL DEFAULT 'adapos_sync',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_purchase_summary (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL REFERENCES products(product_code),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_days INTEGER NOT NULL,
  purchased_qty_base NUMERIC(14, 4) NOT NULL DEFAULT 0,
  source_name TEXT NOT NULL DEFAULT 'adapos_sync',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branch_order_requests (
  id TEXT PRIMARY KEY,
  branch_code TEXT NOT NULL REFERENCES branches(branch_code),
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'submitted',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branch_order_request_items (
  id TEXT PRIMARY KEY,
  order_request_id TEXT NOT NULL REFERENCES branch_order_requests(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL REFERENCES products(product_code),
  requested_qty NUMERIC(14, 4) NOT NULL,
  requested_unit TEXT NOT NULL,
  line_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  sync_type TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  records_read INTEGER NOT NULL DEFAULT 0,
  records_sent INTEGER NOT NULL DEFAULT 0,
  message TEXT
);

CREATE TABLE IF NOT EXISTS sync_errors (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT REFERENCES sync_runs(id) ON DELETE SET NULL,
  sync_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
