-- Approved purchase receipt headers (FTXihStaPrcDoc = '1', today's docs)
-- UPSERT strategy: headers upserted on conflict; lines deleted + reinserted per doc.
CREATE TABLE IF NOT EXISTS ada_approved_receipt_headers (
  doc_no          TEXT        NOT NULL PRIMARY KEY,
  branch_code     TEXT        NOT NULL,
  doc_type        TEXT,
  doc_date        TIMESTAMPTZ,
  doc_time        TEXT,
  supplier_code   TEXT,
  supplier_name   TEXT,
  ref_ext         TEXT,
  ref_ext_date    TIMESTAMPTZ,
  warehouse_code  TEXT,
  total           NUMERIC(18,4) NOT NULL DEFAULT 0,
  vat             NUMERIC(18,4) NOT NULL DEFAULT 0,
  grand           NUMERIC(18,4) NOT NULL DEFAULT 0,
  usr_code        TEXT,
  created_by      TEXT,
  created_at_ada  TIMESTAMPTZ,
  sta_doc         TEXT,
  sta_prc_doc     TEXT,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ada_approved_receipt_lines (
  doc_no          TEXT        NOT NULL,
  seq_no          INTEGER     NOT NULL,
  product_code    TEXT,
  product_name    TEXT,
  barcode         TEXT,
  unit_code       TEXT,
  unit_name       TEXT,
  factor          NUMERIC(18,4) NOT NULL DEFAULT 1,
  qty             NUMERIC(18,4) NOT NULL DEFAULT 0,
  qty_base        NUMERIC(18,4) NOT NULL DEFAULT 0,
  stock_factor    NUMERIC(18,4) NOT NULL DEFAULT 1,
  set_price       NUMERIC(18,4) NOT NULL DEFAULT 0,
  net             NUMERIC(18,4) NOT NULL DEFAULT 0,
  vat             NUMERIC(18,4) NOT NULL DEFAULT 0,
  cost_in         NUMERIC(18,4) NOT NULL DEFAULT 0,
  lot_no          TEXT,
  expired_date    TIMESTAMPTZ,
  warehouse_code  TEXT,
  PRIMARY KEY (doc_no, seq_no),
  FOREIGN KEY (doc_no) REFERENCES ada_approved_receipt_headers(doc_no) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ada_arh_branch_date
  ON ada_approved_receipt_headers (branch_code, doc_date DESC);

CREATE INDEX IF NOT EXISTS idx_ada_arl_product
  ON ada_approved_receipt_lines (product_code);
