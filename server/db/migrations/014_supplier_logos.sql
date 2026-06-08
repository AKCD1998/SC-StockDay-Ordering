CREATE TABLE IF NOT EXISTS supplier_logos (
  supplier_key TEXT PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  logo_data_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_logos_supplier_name
  ON supplier_logos (supplier_name);
