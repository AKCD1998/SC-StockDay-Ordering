-- Add moving-average unit cost per branch to branch_stock_snapshots.
-- NULL means the branch has not synced yet (distinct from 0 which means synced but no cost history).
-- ON CONFLICT uses COALESCE so a branch sync never overwrites another branch's cost.
ALTER TABLE branch_stock_snapshots
  ADD COLUMN IF NOT EXISTS cost_avg_branch_000 NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS cost_avg_branch_001 NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS cost_avg_branch_002 NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS cost_avg_branch_003 NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS cost_avg_branch_004 NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS cost_avg_branch_005 NUMERIC(18,4);
