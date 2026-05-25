-- Migration 003: AdaAcc pending purchase receipts staging tables
-- These hold purchase receipt documents that exist in AdaAcc but have not yet
-- been approved into stock (FTXihStaPrcDoc IS NULL).
-- The entire set for a branch is replaced on each sync run.

CREATE TABLE IF NOT EXISTS ada_pending_receipt_headers (
  doc_no          TEXT PRIMARY KEY,
  branch_code     TEXT NOT NULL,
  doc_type        TEXT,
  doc_date        DATE,
  doc_time        TEXT,
  supplier_code   TEXT,
  supplier_name   TEXT,
  ref_ext         TEXT,
  ref_ext_date    DATE,
  warehouse_code  TEXT,
  total           NUMERIC(14,4) NOT NULL DEFAULT 0,
  vat             NUMERIC(14,4) NOT NULL DEFAULT 0,
  grand           NUMERIC(14,4) NOT NULL DEFAULT 0,
  usr_code        TEXT,
  created_by      TEXT,
  created_at_ada  TIMESTAMPTZ,
  sta_doc         TEXT,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ada_pending_receipt_lines (
  doc_no         TEXT    NOT NULL REFERENCES ada_pending_receipt_headers(doc_no) ON DELETE CASCADE,
  seq_no         INTEGER NOT NULL,
  product_code   TEXT,
  product_name   TEXT,
  barcode        TEXT,
  unit_code      TEXT,
  unit_name      TEXT,
  factor         NUMERIC(14,4) NOT NULL DEFAULT 1,
  qty            NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_base       NUMERIC(14,4) NOT NULL DEFAULT 0,
  stock_factor   NUMERIC(14,4) NOT NULL DEFAULT 1,
  set_price      NUMERIC(14,4) NOT NULL DEFAULT 0,
  net            NUMERIC(14,4) NOT NULL DEFAULT 0,
  vat            NUMERIC(14,4) NOT NULL DEFAULT 0,
  cost_in        NUMERIC(14,4) NOT NULL DEFAULT 0,
  lot_no         TEXT,
  expired_date   DATE,
  warehouse_code TEXT,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (doc_no, seq_no)
);

CREATE INDEX IF NOT EXISTS idx_ada_prh_branch_date
  ON ada_pending_receipt_headers (branch_code, doc_date DESC);

CREATE INDEX IF NOT EXISTS idx_ada_prl_product
  ON ada_pending_receipt_lines (product_code);
