-- 013_loyalty.sql
-- Loyalty members, claims, line items, and point ledger for the SCCRMonPOS cashier flow.

CREATE TABLE IF NOT EXISTS members (
  id              TEXT PRIMARY KEY,
  member_code     TEXT UNIQUE NOT NULL,
  display_name    TEXT NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  phone           TEXT,
  email           TEXT,
  sex             TEXT,
  dob             DATE,
  remark          TEXT NOT NULL DEFAULT '',
  thai_id         TEXT,
  current_points  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE members ADD COLUMN IF NOT EXISTS sex TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS remark TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_members_phone       ON members (phone);
CREATE INDEX IF NOT EXISTS idx_members_email       ON members (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_members_member_code ON members (member_code);

CREATE TABLE IF NOT EXISTS loyalty_claims (
  id                 TEXT PRIMARY KEY,
  receipt_no         TEXT NOT NULL,
  branch_code        TEXT NOT NULL,
  cashier_staff_code TEXT,
  sold_at            TIMESTAMPTZ,
  total_amount       NUMERIC(14, 2) NOT NULL,
  preview_points     INTEGER,
  awarded_points     INTEGER NOT NULL DEFAULT 0,
  member_id          TEXT NOT NULL REFERENCES members(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loyalty_claims_branch_receipt_unique UNIQUE (branch_code, receipt_no)
);

CREATE TABLE IF NOT EXISTS loyalty_claim_items (
  id           TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL REFERENCES loyalty_claims(id) ON DELETE CASCADE,
  product_code TEXT,
  product_name TEXT,
  qty          NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit_price   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_point_ledger (
  id           TEXT PRIMARY KEY,
  member_id    TEXT NOT NULL REFERENCES members(id),
  claim_id     TEXT REFERENCES loyalty_claims(id),
  points_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  event_type   TEXT NOT NULL DEFAULT 'earn',
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Demo seed members for branch005 testing.
-- phone 0627966956 matches the probe already sent from SCCRMonPOS.
INSERT INTO members (id, member_code, display_name, first_name, last_name, phone, email, current_points)
VALUES
  ('mem_demo_001', 'M000001', 'สมชาย ใจดี',   'สมชาย',  'ใจดี',  '0831234567', 'somchai@example.com',  0),
  ('mem_demo_002', 'M000002', 'สมหญิง รักดี',  'สมหญิง', 'รักดี', '0627966956', 'somying@example.com', 50),
  ('mem_demo_003', 'M000003', 'วิทยา มีสุข',   'วิทยา',  'มีสุข', '0899876543',  NULL,                 120)
ON CONFLICT (id) DO NOTHING;
