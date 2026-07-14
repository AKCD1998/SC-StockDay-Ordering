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

## CP1 rollout progress (2026-07-14, post-CP0)

- **003**: RESOLVED (pending one more scheduled-window confirmation).
  Pulled `4b52855` (products batch=100 + sales_detail chunk=150), `.env`
  updated with both new vars, manual off-peak test run: products 6,591 sent
  (100/batch), sales_detail 1,820 headers / 3,629 lines across 13/13 chunks
  accepted, 22,670 total records, exit 0, 10m04s wall time, no "Sync failed."
  Local uncommitted duplicate-fix diff on that machine was verified
  non-identical-but-subsumed by `e71e32f` (see conversation) and discarded
  before pulling — no work lost.
- **004**: NOT YET STARTED — still on stale code (pre-`e71e32f`), still
  batching products at 500 with no `ADAPOS_SYNC_PRODUCT_BATCH_SIZE`. Highest
  remaining containment priority.
- **001**: fixes present (batch=100, but pre-existing 180s timeout override
  predates and is unrelated to the fix) but still failing on products as of
  2026-07-14 08:20 — attributed to DB CPU saturation (see EVIDENCE.md Render
  section), not a code gap on this branch. Needs re-observation after 003+004
  are both off the old batch-500 pattern, since that should reduce peak DB
  load app-wide.
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
