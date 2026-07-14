# Program State

**Current checkpoint**: CP0 — Baseline, safety, capacity inventory
**Status**: IN PROGRESS (not complete — 6 open manual actions, see below)
**Last updated**: 2026-07-14, this session

## CP0 gate checklist (from PLAN.md / original spec)

- [x] Repo commit/branch/dirty state captured for both repos — **and** an
      unexpected finding recorded (PaaSRTSM-project was on a non-`main`
      branch mid-investigation; see DECISIONS.md)
- [x] Agent fleet inventory: version, dataset, batch, timeout, schedule, path
      — complete for 001/003/004/005, **incomplete for 000** (MA-001)
- [ ] Source of branch 000 identified — **BLOCKED on MA-001**
- [x] Production DB baseline: table sizes, dead tuples, autovacuum timestamps,
      connection count/limit, `pg_stat_statements` top offenders — captured,
      see EVIDENCE.md (note: connection-count sample is off-peak, not an
      08:20-window sample)
- [x] Render web-service CPU/RAM, instance type — **resolved via MA-002**:
      backend 0.5 CPU/512MiB `starter`, never above 7% CPU / 24% memory even
      during the failure window
- [x] Render Postgres instance type/storage/HA/read-replica status —
      **resolved via MA-002**: `basic_256mb` (0.1 CPU/256MiB), 15GB disk
      (21.6% used), HA off, no read replica, no PgBouncer. **CPU hit 100% of
      its 0.1-CPU limit during the 2026-07-14 08:00-08:40 failure window** —
      this is now the leading suspected root cause of the cross-branch
      failures, ahead of pure lock contention (MA-003 still needed to
      distinguish the two, but connection count staying low during
      saturation points toward compute-bound queries over lock queueing)
- [ ] PITR retention days, workspace billing tier, autoscaling min/max,
      Disk I/O — **narrow remainder of MA-002, still open**
- [ ] Product code/attribute comparison across branches to determine
      authoritative product-master source — **NOT STARTED**, needs branch
      SQL Server read access this session doesn't have directly (only sees
      agent log output, not raw query access to each branch's AdaAcc DB)
- [ ] Backup/recovery plan + PITR confirmation before any migration — **BLOCKED
      on MA-002**
- [x] State files created (this set)
- [ ] Secrets confirmed not printed to logs/docs — **partially**: this
      session did use a production DB password once (redacted from all
      written files; see DECISIONS.md MA-005 for the rotation follow-up)
- [ ] Product authority decision — **NOT MADE**, waiting on the comparison
      above

## Verdict

**CP0 is nearly complete.** MA-002 (Render/DB baseline) is now mostly
resolved with real numbers, not estimates. Two items remain fully open
(MA-001 branch 000, MA-004 the unexplained `codex/branch-005-transfer-ingestion`
branch) plus four narrow MA-002 sub-items that don't block capacity planning
in any material way (PITR days, billing tier, autoscaling config, disk I/O).

**Headline finding that changes CP1/CP3 priority**: the production Postgres
instance (`basic_256mb`, 0.1 CPU) hit 100% CPU during the exact window
001/003/004 failed, while active connections stayed low (max 4) and the
backend API had CPU/memory to spare. This reframes the fix priority:

- Staggering branch schedules (CP1.1) still helps — it spreads the same total
  work over time so no single 5-minute window needs more than 0.1 CPU-worth
  of query execution — but it's a mitigation, not a fix, since the *total*
  daily query cost doesn't shrink.
- The set-based upsert rewrite (CP3.1) and eliminating the per-record
  `analytics.product_stock_snapshots` insert loop (CP3.2) now matter more
  than originally weighted, because they directly cut CPU-seconds consumed
  per sync, not just lock-hold duration. Both were already planned; this
  raises their priority relative to CP1's containment-only fixes.
- A DB plan upgrade is now a **data-backed, legitimate option** the operator
  could choose to do at any point (it's a Render dashboard change, so it's a
  MANUAL ACTION regardless) — but per the program's own "make code efficient
  before scaling hardware" principle, doing the set-based rewrite first means
  any plan upgrade later goes further.

## CP3.1 progress (set-based product upsert) — WRITTEN, NOT DEPLOYED

Branch `claude/set-based-product-upsert` pushed to PaaSRTSM-project origin
(commit `f7034a1`, based on `origin/main` @ `0873c284`). Rewrites
`upsertProductRecord()` (5-8 queries/product, looped) into
`upsertProductBatch()` (4 set-based queries total per request, regardless of
batch size). Verified via a mocked-pg-client harness that exercises the real
route handler end-to-end (`verify-upsert-batch.js` in that branch) — sort
order, item_id/sku_id linking between steps, barcode primary-flag placement,
and record-count preservation all pass. **Not benchmarked against a real
Postgres** (no staging DB — see MANUAL-ACTIONS.md) and **not reconciled with
CP3.2** (snapshot-runaway) — it still inserts one `product_stock_snapshots`
row per product per sync, just via one bulk INSERT instead of N.

Built in an isolated `git worktree` specifically because the shared
PaaSRTSM-project working directory had a concurrent session's uncommitted
work on a different branch at the time (see DECISIONS.md) — the main
checkout was never touched.

**Deploy gate unchanged**: do not merge/deploy this until 001/003/004
mitigation rollout (below) is confirmed stable across a scheduled window,
so this change's effect can be measured in isolation from the mitigation's.

## CP1 rollout progress (2026-07-14, post-CP0)

- **003**: RESOLVED (pending one more scheduled-window confirmation).
  Pulled `4b52855` (products batch=100 + sales_detail chunk=150), `.env`
  updated with both new vars, manual off-peak test run: products 6,591 sent
  (100/batch), sales_detail 1,820 headers / 3,629 lines across 13/13 chunks
  accepted, 22,670 total records, exit 0, 10m04s wall time, no "Sync failed."
  Local uncommitted duplicate-fix diff on that machine was verified
  non-identical-but-subsumed by `e71e32f` (see conversation) and discarded
  before pulling — no work lost.
- **004**: RESOLVED for off-peak conditions. `git status` was clean before
  pull (no local uncommitted duplicate-fix this time), pulled straight to
  `2910867` (descendant, has both `e71e32f` and `4b52855`), package files
  unchanged so no `npm install` needed. Manual off-peak test (started
  2026-07-14 15:31:12 ICT, single run): products 6,591 sent (100/batch),
  sales_detail 690 headers / 1,442 lines across 5 chunks (150+150+150+150+90
  = 690, arithmetic checks out — chunking triggered via the existing `sales`
  dataset entry, not a literal `sales_detail` string in `ADAPOS_SYNC_DATASETS`,
  per `wantsSalesDetail` logic in `config.js`), 18,674 total records, exit 0,
  12m47s wall time, no "Sync failed."

**All three branches (001/003/004) now confirmed working off-peak with the
mitigation in place.** This is the CP1 containment goal achieved. Remaining
before calling CP1 fully done per its own gate: each branch needs to clear
one real *in-window* (08:20 or 19:20) scheduled run without failing — the
off-peak tests prove the code fix works, not yet that it's sufficient
mitigation for actual peak contention. Next 08:20/19:20 window should be
watched (dashboard or logs) rather than assumed.
- **001**: RESOLVED for off-peak conditions, root-cause theory confirmed.
  Pulled `4b52855` fresh (HEAD `2910867`+ range), manual off-peak test
  (2026-07-14 15:26:47-15:37:12 ICT, single run, no retries): products 6,591
  sent (100/batch), sales_detail 1,926 headers / 3,514 lines across 13/13
  chunks (last chunk 126 headers = 1,926 - 12×150, arithmetic checks out),
  22,882 total records, exit 0, 625.8s (~10m26s) wall time, no "Sync failed."
  **This is the key confirming data point**: 001 has the fixes and still
  failed at 08:20 that same day, but succeeds cleanly off-peak — this is
  direct evidence for the DB-CPU-saturation theory (EVIDENCE.md Render
  section), not a per-branch code gap. Still need to observe 001's *next
  in-window* (08:20 or 19:20) scheduled run now that 003 is also off
  batch-500, to see whether reduced peak-window load is enough on its own.
- **CP3 (set-based upsert rewrite)**: design/implementation authorized to
  proceed in parallel (local-code-only), but **not to be deployed** until
  001/003/004 rollout is confirmed stable across at least one more scheduled
  window — deploying both changes at once would make it impossible to tell
  which one actually fixed things.

## Recommended next step

CP0 is close enough to complete that starting CP1 work which doesn't depend
on MA-001/MA-004 is reasonable now (user already authorized this). Priority
suggestion given the CPU-saturation finding: start with a **local, no-deploy
design** for the `/api/sync/ada/sales` chunking (CP1.4) and the products
set-based rewrite (CP3.1) in parallel, since both reduce DB CPU load
directly — more impactful right now than the Task Scheduler/fleet-version
cleanup (CP1.1/1.2), which are still needed but don't address the CPU
ceiling by themselves.
