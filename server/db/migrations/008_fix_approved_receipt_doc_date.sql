-- Change doc_date and ref_ext_date from TIMESTAMPTZ to DATE for timezone safety.
-- On a UTC server, Bangkok midnight timestamps stored as UTC would shift one day
-- backward when cast to DATE. Converting via Asia/Bangkok before truncating is safe.
ALTER TABLE ada_approved_receipt_headers
  ALTER COLUMN doc_date TYPE DATE
  USING (doc_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::DATE;

ALTER TABLE ada_approved_receipt_headers
  ALTER COLUMN ref_ext_date TYPE DATE
  USING (ref_ext_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::DATE;

DROP INDEX IF EXISTS idx_ada_arh_branch_date;
CREATE INDEX idx_ada_arh_branch_date
  ON ada_approved_receipt_headers (branch_code, doc_date DESC);
