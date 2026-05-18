INSERT INTO branches (branch_code, branch_name, is_hq)
VALUES
  ('000', 'สำนักงานใหญ่', TRUE),
  ('001', 'สาขา 1', FALSE),
  ('002', 'สาขา 2', FALSE)
ON CONFLICT (branch_code) DO NOTHING;
