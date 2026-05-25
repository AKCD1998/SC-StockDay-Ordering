-- Transfer headers: one row per AdaAcc TCNTPdtTnfHD document.
-- Natural PK is doc_no (FTPthDocNo) — unique within AdaAcc.
-- No FK to branches: branch_frm is typically '000' (company) which may not
-- be in the branches table, and branch_to can be any registered branch.
CREATE TABLE IF NOT EXISTS transfer_headers (
  doc_no        TEXT        NOT NULL PRIMARY KEY,
  branch_frm    TEXT        NOT NULL,
  branch_to     TEXT        NOT NULL,
  doc_type      TEXT,
  doc_date      DATE        NOT NULL,
  tnf_date      DATE,
  wh_frm        TEXT,
  wh_to         TEXT,
  transfer_type TEXT,
  total         NUMERIC(14, 4) NOT NULL DEFAULT 0,
  vat           NUMERIC(14, 4) NOT NULL DEFAULT 0,
  grand         NUMERIC(14, 4) NOT NULL DEFAULT 0,
  dept_code     TEXT,
  usr_code      TEXT,
  source_name   TEXT        NOT NULL DEFAULT 'adapos_sync',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transfer lines: one row per product line within a document.
-- Natural PK is (doc_no, seq_no) — matches FTPthDocNo + FNPtdSeqNo.
-- No FK to products: inactive products can still be transferred and
-- must be preserved as raw source data per design rule 4.
CREATE TABLE IF NOT EXISTS transfer_lines (
  doc_no        TEXT           NOT NULL,
  seq_no        INTEGER        NOT NULL,
  product_code  TEXT,
  unit_code     TEXT,
  unit_name     TEXT,
  factor        NUMERIC(14, 4),
  qty           NUMERIC(14, 4) NOT NULL DEFAULT 0,
  qty_base      NUMERIC(14, 4) NOT NULL DEFAULT 0,
  cost          NUMERIC(14, 4) NOT NULL DEFAULT 0,
  cost_in       NUMERIC(14, 4) NOT NULL DEFAULT 0,
  net           NUMERIC(14, 4) NOT NULL DEFAULT 0,
  vat           NUMERIC(14, 4) NOT NULL DEFAULT 0,
  branch_frm    TEXT,
  branch_to     TEXT,
  wh_frm        TEXT,
  wh_to         TEXT,
  doc_date      DATE,
  source_name   TEXT           NOT NULL DEFAULT 'adapos_sync',
  synced_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (doc_no, seq_no)
);
