ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE TABLE IF NOT EXISTS product_category (
  product_code TEXT PRIMARY KEY REFERENCES products(product_code) ON DELETE CASCADE,
  clean_category TEXT,
  shelf_no INTEGER,
  pharmacist_zone BOOLEAN NOT NULL DEFAULT FALSE,
  is_cold_chain BOOLEAN NOT NULL DEFAULT FALSE,
  requires_signoff BOOLEAN NOT NULL DEFAULT FALSE,
  category_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  placement_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'rule'
    CHECK (source IN ('exact', 'rule', 'similarity', 'llm', 'human')),
  review_status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('proposed', 'confirmed', 'needs_review', 'reverify')),
  rationale TEXT,
  needs_reverification BOOLEAN NOT NULL DEFAULT FALSE,
  matched_from_product_code TEXT,
  matched_from_barcode TEXT,
  raw_label_source TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_category_review_status
  ON product_category (review_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS taxonomy_map (
  taxonomy_id BIGSERIAL PRIMARY KEY,
  source_name TEXT NOT NULL DEFAULT 'historical_excel',
  source_sheet TEXT,
  source_row_number INTEGER,
  product_code TEXT,
  barcode TEXT,
  raw_label TEXT NOT NULL,
  clean_category TEXT,
  shelf_no INTEGER,
  pharmacist_zone BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'reverify', 'ignored')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_map_product_code
  ON taxonomy_map (product_code);

CREATE INDEX IF NOT EXISTS idx_taxonomy_map_barcode
  ON taxonomy_map (barcode);

CREATE INDEX IF NOT EXISTS idx_taxonomy_map_status
  ON taxonomy_map (status);

CREATE TABLE IF NOT EXISTS typo_aliases (
  raw_variant TEXT PRIMARY KEY,
  canonical_category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_shelf_rules (
  clean_category TEXT PRIMARY KEY,
  allowed_shelves INTEGER[] NOT NULL DEFAULT '{}',
  allowed_unprefixed BOOLEAN NOT NULL DEFAULT FALSE,
  is_cold_chain_possible BOOLEAN NOT NULL DEFAULT FALSE,
  is_controlled BOOLEAN NOT NULL DEFAULT FALSE,
  always_human_confirm BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branch_shelf (
  product_code TEXT NOT NULL REFERENCES products(product_code) ON DELETE CASCADE,
  branch_code TEXT NOT NULL REFERENCES branches(branch_code) ON DELETE CASCADE,
  shelf_no INTEGER,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_code, branch_code)
);

INSERT INTO typo_aliases (raw_variant, canonical_category)
VALUES
  ('ตุ้เย็น', 'ตู้เย็น'),
  ('ยาฆ่าเชิ้อ', 'ยาฆ่าเชื้อ'),
  ('น้ำตามเทียม', 'น้ำตาเทียม'),
  ('อุปรณ์', 'อุปกรณ์'),
  ('ยาใช้ภาบนอก', 'ยาใช้ภายนอก')
ON CONFLICT (raw_variant) DO NOTHING;

INSERT INTO category_shelf_rules (
  clean_category,
  allowed_shelves,
  allowed_unprefixed,
  is_cold_chain_possible,
  is_controlled,
  always_human_confirm
)
VALUES
  ('ยาฉีด', ARRAY[9, 10], FALSE, TRUE, FALSE, TRUE),
  ('ยาครีม', ARRAY[5], FALSE, FALSE, FALSE, TRUE),
  ('ยาฆ่าเชื้อ', ARRAY[2], FALSE, FALSE, FALSE, TRUE),
  ('ยาฆ่าเชื้อรา', ARRAY[2], FALSE, FALSE, FALSE, TRUE),
  ('น้ำตาเทียม', ARRAY[7], FALSE, FALSE, FALSE, TRUE),
  ('น้ำเกลือ', ARRAY[6, 10], TRUE, TRUE, FALSE, TRUE),
  ('วิตามิน', ARRAY[3, 4], TRUE, FALSE, FALSE, FALSE),
  ('สำลี', ARRAY[]::INTEGER[], TRUE, FALSE, FALSE, FALSE),
  ('แชมพู', ARRAY[]::INTEGER[], TRUE, FALSE, FALSE, FALSE),
  ('ขนม', ARRAY[]::INTEGER[], TRUE, FALSE, FALSE, FALSE),
  ('อุปกรณ์', ARRAY[]::INTEGER[], TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (clean_category) DO NOTHING;
