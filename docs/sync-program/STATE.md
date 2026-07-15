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

## CP3.1 — set-based product upsert — DEPLOYED 2026-07-15

**Live in production.** Merged `claude/set-based-product-upsert` into
PaaSRTSM-project `main` (merge commit `bd64f60`), pushed, deployed via
`render deploys create srv-d6c0sd0gjchc73fvup5g --wait --confirm`
(`dep-d9bf9i0k1i2s738cdr0g`, status `live`, finished 2026-07-15 02:49:43
UTC). `/admin/health` returns 200 post-deploy.

**Decision context**: user chose to deploy this now (small, already
mock-verified, low risk) rather than bundle it with delta sync (not started
— bigger, deserves its own design doc like CP4 got, shouldn't share a
deploy with unrelated tested-vs-untested work). Plan: observe today's
remaining 08:20/19:20-equivalent peak window(s) with set-based live but
CP4 (queue+worker) NOT yet built, to isolate set-based's standalone effect
before CP4 adds another variable tomorrow.

**Still not reconciled with CP3.2** (snapshot-runaway) — still inserts one
`product_stock_snapshots` row per product per sync, just via one bulk
INSERT instead of N per-record inserts.

Original branch note, kept for history: pushed to PaaSRTSM-project origin
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

## 2026-07-15 08:20 in-window results — CP1 mitigation alone is NOT sufficient

First real peak-window observation after every mitigation so far was live
(batch=100, sales_detail chunk=150, single-writer product master on 004,
transfers chunk=30 committed but **not yet rolled out to any branch**).
Dashboard at end of window: 001 ✅, 005 ✅, 003 ❌, 004 ❌, 000 pending
(out of scope).

- **001**: eventually succeeded — `Sync succeeded` at 08:42:50, i.e. **22m44s**
  wall time (started 08:20:06). Slow but no failure — attributable to its
  pre-existing 180s per-request timeout override giving it enough headroom
  to outlast peak contention on every individual request, not to the
  mitigation reducing total load.
- **003**: FAILED. Got through products (removed, single-writer working),
  all 12 sales_detail chunks — then `Request timed out after 60000ms` on
  `POST /api/sync/ada/transfers` (163 headers / 1715 lines, one unbatched
  request). This is the exact bug fixed in commit `72e4e1b` the same
  morning — **not yet pulled to branch 003's machine**, so this failure was
  already expected/diagnosed, not a new mystery.
- **004**: FAILED. `Request timed out after 60000ms` on `POST
  /api/sync/products` itself — **the single remaining product-master
  writer, with no other branch competing for that dataset anymore, still
  couldn't get a products batch through inside its default 60s timeout.**
  This is the critical data point: it rules out "branches duplicating
  work" and "one transaction too big" as the *remaining* dominant cause —
  the database's raw capacity (0.1 CPU, confirmed via Render dashboard, see
  EVIDENCE.md) can't keep up with the combined genuine per-branch load of
  4-5 branches syncing in the same ~20-minute window, independent of
  request size.

**Conclusion, stated plainly per the user's explicit ask**: batch/chunk
mitigation + single-writer + (not-yet-deployed) set-based upsert are real,
measured improvements (001: -55% wall time off-peak; 003/001 got much
further into their sync before failing than before any of this work) but
**do not fully solve peak-window contention, and won't at higher branch
counts either — schedule staggering was explicitly rejected by the user as
a "just moves the problem" fix, not a real solve.** Next real step: CP4
async ingestion (queue + worker), design written 2026-07-15 — see
`CP4_ASYNC_INGESTION_DESIGN.md`. Not yet implemented; open questions listed
in that doc block starting implementation (worker hosting, no staging DB).
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

## Single-writer product-master rollout (2026-07-14, post-CP3-planning decision)

Decision + verification recorded in DECISIONS.md. Rollout status:

- **004**: CONFIRMED correct, no change needed. `.env` line 13:
  `ADAPOS_SYNC_DATASETS=products,sales,branch_stock,transfers,transfer_lines,pending_receipts,approved_receipts`
  — `products` present as expected for the designated single writer.
  (Note: this branch's session initially received the wrong prompt — the
  "remove products" one meant for 001/003/005 — and correctly caught the
  contradiction against DECISIONS.md before making any change, then asked
  for confirmation instead of guessing. No `.env` was touched.)
- **001**: DONE. `.env` diff confirmed (`products` removed from
  `ADAPOS_SYNC_DATASETS`), `git status` clean, off-peak manual test
  2026-07-14 16:05:54-16:10:37 ICT: 16,291 records sent (sales, sales_detail
  13/13 chunks, transfers, branch_stock — no products line at all), exit 0,
  282.5s. **Notably faster than the pre-change off-peak run (625.8s ->
  282.5s, 55% reduction)** even outside peak hours — confirms products was a
  major cost on its own, not just a peak-contention symptom.
- **003**: DONE. `.env` diff confirmed, `git status` clean, off-peak manual
  test: 16,079 records sent (sales, sales_detail 13/13 chunks — last chunk
  20 headers = 1,820 - 12×150, checks out — transfers, branch_stock, no
  products line), exit 0, 4m33s (273.2s, in line with 001's post-change
  time).
- **005**: DONE. `.env` diff confirmed (`products` removed, `branch_stock`
  and `branch_stock_history` both correctly left untouched), `git status`
  clean, off-peak manual test 16:17 ICT: 18,044 records sent (sales,
  sales_detail, branch_stock, branch_stock_history, transfers — no products
  line anywhere in the output, not even in the read-phase row counts), exit
  0, no "Sync failed", no 413. Duplicate-Scheduled-Task issue from CP0
  (legacy 08:15/19:20 tasks alongside the current Morning/Evening pair) is
  a separate, still-open item — not part of this rollout.

**ROLLOUT COMPLETE.** All 4 active branches now match the intended
single-writer state: 004 sends `products`, 001/003/005 do not. 000 stays out
of scope (MA-001) — if that install is ever revived, it needs `products`
removed too, to keep the design correct.

Confirmed effect on off-peak wall time (products was the single most
expensive dataset to sync, independent of the peak-contention issue):
- 001: 625.8s -> 282.5s (-55%)
- 003: -> 273.2s (4m33s)
- 005: -> included in an 18,044-record run with no products at all

Still outstanding: observe one real in-window (08:20/19:20) run on each
branch now that both the batch/chunk mitigation AND single-writer are both
live, to see whether peak-window failures are gone entirely or just reduced.

## 2026-07-15 ~10:00 ICT — remote off-peak verification for 003 and 004 (post set-based-upsert deploy)

New capability established this session: this session's own machine
(scproductdev) can reach each branch's local SQL Server directly over the
same Tailscale network used for file access (already proven earlier when
comparing product catalogs across branches — see DECISIONS.md). This means
a sync run can be executed **from here**, using this session's own local
(most current) code checkout and a temporary `.env` pointing at the
branch's SQL Server via its Tailscale IP, without remoting into the
branch's actual PC at all — explicitly requested by the user to avoid
disrupting storefront staff. The temporary `.env` is deleted immediately
after each run (contains real DB credentials, never committed, never left
on disk).

**003**: ran with this session's local code (already has the transfers
chunking fix, `72e4e1b` — this run effectively validates that fix without
ever needing branch 003's own machine to `git pull`). Full success: sales
2,086, sales_detail 1,744 headers/3,453 lines across 12/12 chunks,
**transfers 163 headers/1,715 lines across 6/6 chunks** (30-doc chunks,
last chunk 13 headers = 163 - 5×30, checks out), branch_stock 6,591 —
15,752 total records, no `Sync failed`.

**004**: ran with this session's local code + the newly-deployed set-based
upsert live on the backend. Full success including **products**: 6,595
sent at 100/batch (now backed by `upsertProductBatch()` server-side, not
the old per-record loop), sales 1,647, sales_detail 634/1,344 across 5/5
chunks, transfers 162/1,538 across 6/6 chunks, branch_stock 6,595 — 18,515
total records, no `Sync failed`.

**Caveat, stated plainly**: this run happened around 10:00 ICT — **outside**
the 08:00-08:40/19:15-19:30 peak-contention windows this whole program
exists because of. It confirms both branches' code is now fully correct
(transfers chunking for 003, everything + set-based upsert for 004) and
that the remote-execution-from-here technique works — it does **not** yet
confirm set-based upsert's effect during real peak contention, since no
peak window has occurred since it deployed. That data point still needs an
in-window observation (next natural one: today ~19:20 ICT, or tomorrow
08:20).

One credential/config gotcha hit and fixed during this: a `.env` value
containing `#` (the SQL password) must be quoted (`PASSWORD="value#part"`),
otherwise dotenv treats everything after `#` as a comment and silently
truncates the value — caused one login failure on the first 004 attempt,
confirmed via a raw `mssql` connection test isolating the bug to `.env`
parsing rather than the credential or network path itself.

## 2026-07-15 ~11:20 ICT — self-update fleet bootstrap begins

Rolling `2adff19`/`ec65f888` (self-update mechanism + everything since) out
to every branch — the one-time manual pull each branch needs before it can
self-update going forward. New standing rule adopted after the branch-000
X:/possrv path mix-up earlier today: **every rollout prompt now requires
verifying `hostname` + `.env`'s `ADAPOS_SYNC_BRANCH_CODE` before touching
anything**, not just trusting a known-good path/drive-letter from earlier
in the session.

- **005 (POSSRV)**: DONE. Gate check passed (hostname=POSSRV, branch
  code=005, clean tree, HEAD `ef33ee2` from 2026-07-07 — not suspiciously
  old, so the "check for stale-like-000" condition didn't trigger). Pulled
  fast-forward `ef33ee2` → `e0fb718` (41 files, +10,200/-328 lines, 8 days
  of work). No sync test run (already validated earlier today).
- **001/003/004**: not yet done — each is a genuinely separate machine this
  session cannot reach directly (only via a session with real access
  running on that specific machine, same pattern used all day). Prompts
  prepared with per-branch paths; awaiting execution.

## Recommended next step

CP0 is close enough to complete that starting CP1 work which doesn't depend
on MA-001/MA-004 is reasonable now (user already authorized this). Priority
suggestion given the CPU-saturation finding: start with a **local, no-deploy
design** for the `/api/sync/ada/sales` chunking (CP1.4) and the products
set-based rewrite (CP3.1) in parallel, since both reduce DB CPU load
directly — more impactful right now than the Task Scheduler/fleet-version
cleanup (CP1.1/1.2), which are still needed but don't address the CPU
ceiling by themselves.
