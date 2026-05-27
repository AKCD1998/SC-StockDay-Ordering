-- OCR document intake: one row per scanned file
CREATE TABLE IF NOT EXISTS ocr_documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  supplier_name TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  branch_code TEXT REFERENCES branches(branch_code),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'review', 'confirmed', 'error')),
  ocr_engine TEXT,
  error_message TEXT,
  processing_started_at TIMESTAMPTZ,
  processing_finished_at TIMESTAMPTZ,
  submitted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Parsed line items before human confirmation
CREATE TABLE IF NOT EXISTS ocr_document_lines (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,
  line_index INTEGER NOT NULL,
  raw_text TEXT,
  parsed_product_name TEXT,
  parsed_barcode TEXT,
  parsed_qty NUMERIC(14, 4),
  parsed_unit TEXT,
  parsed_cost NUMERIC(14, 4),
  parsed_lot TEXT,
  parsed_expiry DATE,
  matched_product_code TEXT REFERENCES products(product_code),
  matched_product_name TEXT,
  match_method TEXT CHECK (match_method IN ('exact_barcode', 'exact_code', 'fuzzy_name', 'unmatched', NULL)),
  match_confidence NUMERIC(5, 2),
  match_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('pending', 'confirmed', 'corrected', 'rejected')),
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Confirmed receiving records (audit truth, never written to AdaPOS directly)
CREATE TABLE IF NOT EXISTS invoice_receipts (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES ocr_documents(id),
  branch_code TEXT REFERENCES branches(branch_code),
  supplier_code TEXT,
  supplier_name TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  confirmed_by TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  adapos_export_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (adapos_export_status IN ('pending', 'exported', 'skipped')),
  adapos_exported_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_receipt_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES invoice_receipts(id) ON DELETE CASCADE,
  product_code TEXT REFERENCES products(product_code),
  product_name TEXT NOT NULL,
  barcode TEXT,
  qty NUMERIC(14, 4) NOT NULL,
  unit TEXT NOT NULL,
  cost NUMERIC(14, 4),
  lot_number TEXT,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracks manual corrections to improve future matching
CREATE TABLE IF NOT EXISTS match_corrections (
  id TEXT PRIMARY KEY,
  document_line_id TEXT REFERENCES ocr_document_lines(id) ON DELETE SET NULL,
  raw_product_name TEXT,
  raw_barcode TEXT,
  suggested_product_code TEXT,
  corrected_product_code TEXT NOT NULL REFERENCES products(product_code),
  corrected_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_documents_status ON ocr_documents(status);
CREATE INDEX IF NOT EXISTS idx_ocr_documents_created_at ON ocr_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_document_lines_document_id ON ocr_document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_invoice_receipts_branch_code ON invoice_receipts(branch_code);
CREATE INDEX IF NOT EXISTS idx_invoice_receipts_invoice_date ON invoice_receipts(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_match_corrections_raw_name ON match_corrections(raw_product_name);
