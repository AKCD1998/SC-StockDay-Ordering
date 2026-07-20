# Program State

## 2026-07-20 — MA-001 corrected: branch 000's real production path found, self-update deployed and proven under SYSTEM, task cutover + legacy quarantine complete

The 2026-07-15 resolution of MA-001 (below) identified
`C:\SC-StockDay-Ordering` as branch 000's production install. **That was
wrong.** It's a real, `main`-branch checkout with the right `.env` branch
code, but the host's actual Scheduled Task (`AdaPOS-Sync Daily 1920`)
targets a different path entirely and had been running there all along —
the other checkout just went stale after 2026-06-26. Full account of what
was wrong, how it was found (enumerate every Scheduled Task, don't filter by
expected name, cross-check log continuity), and what was done about it is in
EVIDENCE.md ("Branch 000 production path — corrected 2026-07-20") and
MANUAL-ACTIONS.md (MA-001, MA-006).

Summary of what changed on the real production host today, under an
explicit, session-scoped user authorization that also covered touching
Scheduled Tasks (normally out of scope for this program):
- Bootstrapped the correct production path from its actual state to `main`
  HEAD, then proved self-update itself works end-to-end under the
  production Scheduled Task's own SYSTEM account (CURRENT → Advance →
  CURRENT → Advance → CURRENT across two separate commits).
- Added deterministic self-update status/monitoring (status JSON, post-run
  checker, best-effort heartbeat events) — this is the fleet self-update
  gap flagged in the 2026-07-19 entry below, now implemented and tested (59
  passing tests against disposable fixtures), though only for branch 000's
  code so far; 001/003/004/005 still need the same rollout plus SYSTEM-log
  verification called for below.
- Replaced the single always-full-sync `AdaPOS-Sync Daily 1920` task with
  split Morning (full sync) / Evening (`-SkipIfSyncedToday`) tasks, via a
  reversible register-disabled → verify → enable-and-disable-old cutover.
  Old task kept disabled, not deleted.
- Quarantined the stale `C:\SC-StockDay-Ordering` checkout (moved, not
  deleted) and left a stub file at the old path.
- **Not done**: the central dashboard has no consumer for the new heartbeat
  events yet, so self-update health is still only visible per-branch in
  `logs/self-update-latest.json` and the sync log, not centrally. That is a
  handoff to a dev-machine session against the backend repo (separate CP4
  work is in progress there that branch-000 sessions must not touch).
  001/003/004/005 have not had any of today's changes applied.

## 2026-07-19 — self-update hardening prepared locally (not deployed; fleet verification pending)

Scope is self-update only; CP4 is being handled separately and is not part of
this work. Inspection confirmed the unresolved fleet gap recorded below:
`git rev-parse` itself can fail under the Scheduled Task's SYSTEM principal
with `dubious ownership`, before the launcher learns the repository root. The
existing fail-safe then allows sync to continue, but reports only "not inside
a git repo" and leaves self-update permanently inactive.

A local, uncommitted hardening change now:

- discovers the repository by walking upward from the checked-in launcher,
  without calling Git first;
- passes `-c safe.directory=<that exact repo>` to each Git command, scoped to
  that process only (no permanent/global Git trust change);
- resolves and validates `ADAPOS_SYNC_BRANCH_CODE` before any update attempt;
- logs `hostname`, branch code, and resolved repository path for audit;
- preserves the fail-safe rule: dirty tree, non-`main`, Git/network errors, or
  non-fast-forward state skip the update but never suppress the actual sync;
- extends `branch-task-diagnostic.ps1` with a read-only self-update readiness
  probe that does not fetch, pull, or change Git configuration.

PowerShell parsing and `git diff --check` pass locally. **This does not close
the fleet gap yet.** Before rollout, the change still needs a controlled local
test and commit. After rollout, each of 000/001/003/004/005 must be verified
from a Scheduled Task log (SYSTEM context), with `hostname` + `.env`
`ADAPOS_SYNC_BRANCH_CODE` checked before treating evidence as belonging to a
branch. Do not guess paths and do not change Task Scheduler as part of this
verification.

**Current checkpoint**: CP0 — Baseline, safety, capacity inventory
**Status**: IN PROGRESS (not complete — 6 open manual actions, see below)
**Last updated**: 2026-07-14, this session

## CP0 gate checklist (from PLAN.md / original spec)

- [x] Repo commit/branch/dirty state captured for both repos — **and** an
      unexpected finding recorded (PaaSRTSM-project was on a non-`main`
      branch mid-investigation; see DECISIONS.md)
- [x] Agent fleet inventory: version, dataset, batch, timeout, schedule, path
      — complete for 001/003/004/005, **now also complete for 000**
      (MA-001, corrected 2026-07-20 — see EVIDENCE.md)
- [x] Source of branch 000 identified — **RESOLVED 2026-07-20** (MA-001,
      corrected; the 2026-07-15 answer was wrong — see EVIDENCE.md)
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
- **001 (SC_001)**: DONE. Gate check passed (hostname=SC_001, branch
  code=001, tree clean apart from 2 harmless untracked manual-test log
  files from earlier today). Pulled fast-forward `2910867` (2026-07-14
  15:23) → `1f92974` (2026-07-15 11:38). Same session correctly checked for
  003/004/005 install paths on this machine, found none, and stopped
  rather than guess — exactly the identity-safety discipline this program
  adopted after the branch-000 X:/possrv mix-up. Those three are handled by
  separate sessions on their own separate machines, not a gap.
- **003 (POSSRV)**: DONE. Gate check passed (hostname=POSSRV, branch
  code=003, tree clean). Pulled fast-forward `4b52855` (2026-07-14 14:12)
  → `1f92974` (2026-07-15 11:38). No sync test run (already validated
  earlier today).

**BOOTSTRAP COMPLETE — all 5 branches (000/001/003/004/005) now on
current `main` and self-update-capable.** From here forward, a fix only
needs one commit to `main` — every branch picks it up automatically on its
own next scheduled sync run, no per-branch coordination prompts needed
(the entire point of this exercise, per the user's original ask). Every
branch's identity was verified via `hostname` + `.env`'s
`ADAPOS_SYNC_BRANCH_CODE` before any git operation, per the standing rule
adopted after the branch-000 X:/possrv path mix-up earlier — zero further
misdirected operations occurred across the remaining 4 branches once that
rule was in place.
- **004 (SERVER004)**: DONE. Gate check passed (hostname=SERVER004, branch
  code=004, clean tree, HEAD `143ee25` from 2026-07-14 16:02). Pulled
  fast-forward `143ee25` → `eb8de2e` (17 files, includes
  `ADAPOS_SYNC_TRANSFER_CHUNK_DOCS` newly added to `.env.example`). Real
  `.env` was missing that var — added `ADAPOS_SYNC_TRANSFER_CHUNK_DOCS=30`
  (same default already validated on 003 earlier today). No sync test run
  (already validated earlier today).

## 2026-07-15 ~15:10-16:30 ICT — READ-side outage: stock-day query saturation (new finding, adjacent to CP3.2)

Full backend outage (~40 min, every route 499ing, some requests 30+ min)
initially blamed on the day's focus-products/sales-targets UI commits —
disproven with evidence (all rollbacks verified byte-identical, and the two
"suspect" backend commits had never even deployed because auto-deploy is
off). Actual root cause, confirmed via pg_stat_activity + EXPLAIN:

- `queryStockDayBase()` (`apps/admin-api/src/routes/ordering.js`, behind
  `GET /api/admin/stock-day`) recomputed "latest stock per product" with an
  unfiltered `DISTINCT ON` over **all of `analytics.product_stock_snapshots`**
  — 5,043,579 rows / 1.17 GB, growing forever because CP3.2 (snapshot
  retention) was never implemented. Plan: Seq Scan 5M rows -> Sort (cost
  ~938k) on a 0.1-CPU DB.
- A few staff loading the Stock Day page concurrently queued enough copies
  (observed: 11 simultaneous, 25-45+ min each) to exhaust the app's pg Pool
  (default max 10, no explicit config in `apps/admin-api/src/db.js`) —
  which is why completely unrelated routes died too.

Fixes applied (all verified against production):
1. `pg_terminate_backend()` on stuck read-only SELECTs (thrice — recurrence
   confirmed the query itself was the problem, not a one-off).
2. `CREATE INDEX CONCURRENTLY idx_product_stock_snapshots_latest
   (product_code, snapshot_at DESC, stock_snapshot_id DESC)` — ~35 min
   build; final validation phase was itself blocked by the stuck queries
   (waiting-for-old-snapshots / virtualxid) until they were terminated.
   NOTE: index alone did NOT change the plan — Postgres can't skip-scan
   DISTINCT ON, so seq+sort remained cheaper than a full index walk.
3. Query rewrite (PaaSRTSM `4237abe`): DISTINCT ON CTE -> LATERAL 1-row
   probe per SKU using the new index. EXPLAIN cost 938k -> 12k (~78x);
   real run 6,811 rows in ~5-12s on the still-loaded DB vs never-completing.
   Spot-checked 5 products: latest-snapshot values identical to old
   semantics.
4. 60s response cache + in-flight promise coalescing on
   `/admin/stock-day` — N concurrent page loads now cost exactly 1 DB
   query per minute, which is the actual concurrency fix (the "burst"
   pattern can't recur by construction).

## 2026-07-15 later same day — pool timeouts + CP3.2 current-stock table (CLOSES the read-path half of CP3.2)

Two more commits, both deployed and verified against production (not just
build-passing):

**`04174ff`** — pool hardening in `apps/admin-api/src/db.js`: `max: 10`
(explicit), `connectionTimeoutMillis: 15s`, `statement_timeout: 300s`,
`idle_in_transaction_session_timeout: 60s`. Root cause of *why* the
2026-07-15 outage's stuck queries ran 25-45+ min: a client giving up
(browser 499) does not stop Postgres from finishing the query — nothing
existed to kill abandoned work. 300s chosen from `pg_stat_statements`
evidence: the slowest *legitimate* query observed maxed at ~298s, so this
only kills zombies no client is still waiting on. Verified live: a Pool
built with these exact options reports `SHOW statement_timeout` = `5min`,
`idle_in_transaction_session_timeout` = `1min` on the actual server.

**`4693f2d`** — `analytics.product_current_stock` (migration 057): one row
per product_code (confirmed via `information_schema` that
`product_stock_snapshots` has no branch dimension, so per-product is the
correct grain), kept in sync by `upsertProductBatch()` in `sync.js` inside
the same transaction as the history insert, guarded by
`WHERE ... snapshot_at <= EXCLUDED.snapshot_at` so a late-arriving batch
can't clobber newer data. Both `ordering.js` read paths
(`queryStockDayBase`, product search) now join this table directly instead
of computing "latest stock" per call.

Backfill note: the migration's backfill originally used `DISTINCT ON`
(matching the old query shape) — confirmed live that Postgres will **not**
use the new index for that pattern even though the index exists (still
full seq-scan+sort, ~60s+). Rewritten to the same per-SKU `LATERAL` probe
already used in the read-path fix; measured 30.4s via `EXPLAIN ANALYZE`
against production before shipping.

**Result, measured on production via `EXPLAIN ANALYZE` post-deploy**:
`queryStockDayBase`'s core query: **6.6 min avg (435 historical calls,
pg_stat_statements) → 6.57s (index+LATERAL fix, same day) → 8.7ms
(current-stock table)**. 6,597 rows backfilled, 5/5 spot-checked against
direct history lookups, all exact matches. The read path's cost is now
independent of `product_stock_snapshots` size entirely.

**This closes the read-path half of CP3.2.** What's still genuinely open:
- Pool isolation (separate pools per route) — discussed, likely
  unnecessary now that statement_timeout exists; only worth revisiting if
  a specific route needs stronger isolation later.
- A second slow-query risk was found during this investigation and
  deliberately NOT touched (separate scope): a `movement-analytics`
  query ("`WITH filtered_sales`") observed at up to 2h/call in
  `pg_stat_statements`, 3 calls total so far. Same shared-pool blast-radius
  risk as stock-day had — now contained by the new `statement_timeout`,
  but the query itself is still slow and worth its own fix.
- Backend Render service auto-deploy still OFF — every push needs a manual
  `render deploys create`. Worth confirming with the operator whether
  intentional.

## 2026-07-15 later still — CP3.2 CLOSED (retention pruning shipped)

**`48d5419`** — the other half of CP3.2. Operator decisions (asked
explicitly, not assumed): **365-day retention**, **piggybacked on existing
sync traffic** rather than a new Render Cron service (no new billed
infrastructure).

`pruneOldSnapshotsIfDue()` in `sync.js`, called after every
`/api/sync/products` commit, fire-and-forget on its own connection (never
affects the sync response either way):
- Self-throttles via an atomic claim UPSERT against
  `analytics.maintenance_runs` (migration 058) — at most one prune run per
  24h regardless of how many branches/batches call in that window. Verified
  live post-deploy: first claim succeeds, immediate second claim correctly
  returns 0 rows (blocked).
- Batch-bounded delete (20k rows/run cap), not one unbounded DELETE.
- Verified via `EXPLAIN` that the candidate-row subquery uses
  `idx_product_stock_snapshots_snapshot_at` (cost ~1.56) rather than
  scanning.

**Confirmed deliberately, not assumed**: `product_stock_snapshots` data
currently spans only ~58 days (earliest row 2026-05-18), so this deletes
**0 rows today** — this is future-proofing against continued growth
(1.85M inserts and counting per `pg_stat_statements`), not an immediate
destructive change. Nothing will actually get pruned until real rows cross
the 365-day mark, ~10 months out.

**CP3.2 (snapshot-runaway) is now fully closed** — both halves: reads no
longer depend on history-table size (current-stock table), and the
history table itself no longer grows without bound (retention pruning).

## 2026-07-15 ~18:15 ICT — CP4/CP5 sequencing decision (operator, not urgent)

Operator is a solo developer juggling multiple projects — deliberately
recorded here so this reasoning isn't lost between sessions and doesn't
need re-litigating later.

- **CP4** (async ingestion, queue+worker): stays gated on tonight's
  ~19:20 ICT sync window — the first real peak-window observation of
  set-based upsert (`bd64f60`) running alone, isolated from any other new
  variable. If 001/003/004/005 still fail the same "DB CPU saturated"
  way tonight, CP4 becomes necessary just to stabilize the **current 5
  branches** — independent of any branch-count expansion. Decide
  tomorrow based on actual results, not before.
- **CP5** (load-testing ladder, 5→1000 synthetic branches, to get a real
  answer to "how many branches can this handle"): explicitly **not
  urgent**. No near-term plan to add branches. Operator wants this
  tracked so it isn't forgotten, not started now. Reasonable trigger to
  revisit: when a concrete branch-count expansion is actually being
  planned, not on a calendar date.
- Read-side (admin-web dashboard) capacity is a separate, still-open
  question from either of the above — today's stock-day fix removed one
  known crash risk, but the system as a whole has never been load-tested
  for concurrent dashboard users, and the known-slow
  movement-analytics query (see prior entry) is still unaddressed. Not
  gated on CP4/CP5, would need its own pass if it ever becomes urgent.

## 2026-07-16 morning — CP4 gate pushed further out: 003/004 failures were never a DB signal

Full detail in `2026-07-16-branch-003-004-sync-outage.md`. Short version:
both branches' failures since 2026-07-15 turned out to be **local-machine
bugs with zero relation to backend/DB capacity** — branch 003's Scheduled
Tasks were completely deleted from Task Scheduler (re-registered, fix
confirmed, evening test pending tonight); branch 004 had a PowerShell
5.1 gotcha (`$ErrorActionPreference = "Stop"` promotes native-command
stderr into a terminating exception even through `2>$null`) combined with
a `git` "dubious ownership" error under the SYSTEM task principal,
silently crashing the whole sync script before any log line was written
— masked from Task Scheduler by a missing `exit /b` in
`RUN-ADAPOS-SYNC.bat` (fixed, pushed `aa86d8b`, verified via a real
`Start-ScheduledTask` trigger: full sync succeeded, 18,531 records).

**Practical effect on the CP4 decision**: every "peak-window failure"
observed for 003/004 over the last two days was confounded by these bugs,
not a genuine DB-capacity signal. 001/005 succeeded cleanly at 19:20 on
the 15th (real, clean data point) but the `products` dataset — the one
single-writer dataset that actually stresses the DB the most, sent only
by branch 004 — has **never once been observed succeeding or failing
under real peak-window conditions** since set-based upsert deployed;
every attempt so far hit one of these unrelated local bugs first.

**Also surfaced, not yet resolved**: the self-update fix only reached
branch 004 via a direct on-disk fix — it lives on `main` now, but
branch 003 (freshly re-registered, evening run at 19:20 tonight) is still
running the *pre-fix* self-update code and may hit the identical crash if
it shares 004's `safe.directory` gap, which would produce a false
negative for tonight's re-registration test. Manual `git pull
origin main --ff-only` on 003 before 19:20 recommended to decouple the
two tests. Unverified: whether 001/005/000 have the same `safe.directory`
gap — if so, self-update isn't actually delivering this fix fleet-wide as
designed, and every branch may need either a manual pull or a
`safe.directory` config fix.

**Revised CP4 gate**: do not decide based on tonight's 003 test alone,
even if clean — it doesn't include `products`. Earliest a genuinely clean,
complete signal (all 5 branches, all datasets, no local-machine
confounders) is realistic: **tomorrow 08:20 ICT (2026-07-17)**, contingent
on 003/004 both being confirmed bug-free by then. Decide CP4 after that
window, not before.

## 2026-07-16 mid-morning — movement-analytics fixed (commit `d130069`, deployed, verified)

While CP4 stays gated, worked the "known landmine" flagged in the earlier
2026-07-15 outage entry: `branch-product-sales`'s `filtered_sales` CTE,
seen at up to 2h/call (3 occurrences) in `pg_stat_statements`.

**Root cause**: same class of bug as the stock-day outage, different
mechanism. Postgres cannot estimate selectivity of the JSONB filter
expressions on `ada.sales_headers` (`COALESCE(NULLIF(raw_payload->>'...',
'')...)`), so it always guessed ~1-13 matching rows regardless of the real
count (493,912 with no date filter) and picked a Nested Loop join —
fine for the guess, catastrophic for reality. Confirmed with
`EXPLAIN ANALYZE` against production: unbounded case 90s, normal
(frontend's own 30-day default) case 6-7s.

**Fix, two parts, both measured against production before/after:**
1. New expression index (`idx_ada_sales_headers_doctype_paid_expr`) on the
   JSONB filter pattern so `ANALYZE` gives the planner real numbers.
   Unbounded case: 90s -> 42s, planner switches to Hash Join.
2. Server-side floor: `date_from` now defaults to 90 days ago if the
   client sends none — the frontend's 30-day default was never actually
   enforced server-side, so a cleared filter (or any future client bug)
   could still trigger the unbounded scan. Worst case now capped at ~14s
   (90-day floor) instead of 42-90s+, and stays bounded regardless of how
   much sales history accumulates going forward.

Normal case unaffected (6-7s before and after — no regression). Deployed,
`/admin/health` and the endpoint both verified responsive post-deploy.

## 2026-07-16 later still — proactive pg_stat_statements audit (commit `ab2e00a`, deployed, verified)

Requested a broad audit (via a Fable 5 session) rather than waiting to
trip over a third outage-class landmine. Result: **none found** — no
remaining query matches the "unbounded read + planner misestimate ->
nested-loop blowup" shape that caused the two real incidents. Three
smaller, real items were found and fixed anyway while the DB was calm:

- **A — stockRecommendations.js `loadRawSalesAggByBranch`** (30 calls,
  mean 40.4s, max 70.1s). Verified via `EXPLAIN ANALYZE` this is NOT a
  bad-plan bug — both Nested Loop and Hash Join cost 20-30s, because
  `sales_lines` carries no date column so a 90-day/5-branch rollup
  genuinely touches a large slice of real data regardless of join
  strategy. **The audit's own suggested fix (switch back to
  `analytics.product_sales_summary_periods`) was checked and found
  wrong before being applied** — queried the table directly:
  `period_days=90` has 1 row total, last updated 2026-05-20. Switching
  back would have silently reintroduced the exact bug the raw-query
  workaround already fixed once (2026-07-13, "คำแนะนำสต๊อก recommended
  nothing"). Applied a cache instead (branchCodes+anchorDate key,
  15min TTL) — same lever as the stock-day fix, no correctness risk.
- **C — branch-stock.js listing + count** (~4,565/4,592 calls, ~11,120
  total DB-seconds, #2 all-time consumer after the now-fixed stock-day
  query). Default page load was paying for an ILIKE/LATERAL-barcode
  join it never needed. Now skips straight to a bare `COUNT(*)` and
  drops the join/WHERE entirely when there's no search term. Measured
  466ms -> 272ms on the idle DB (modest in isolation; the larger value
  is removing join work that scales with concurrent load and table
  growth).
- **D — movement-analytics.js `/movement-transactions` and
  `/movement-documents`** — same unbounded-date shape `d130069` fixed
  for `branch-product-sales`, not yet responsible for an incident.
  Same server-side 90-day floor applied preventively.

**Not applied, flagged for a separate decision**: database role-level
`statement_timeout` (currently 0/unlimited at server and role level —
only the app pool has protection, via commit `04174ff`'s 300s). Would
extend protection to non-app connections (ad-hoc psql, future scripts,
the migration runner) but needs its own review since the migration
runner shares the same role/credentials and a future large index build
could legitimately need more than 300s.

All three fixes verified against production post-deploy (health +
each affected endpoint responds correctly). This closes the proactive
audit — no further landmine hunting queued unless something new turns
up in normal use.

## 2026-07-16 afternoon — CP2 (observability) shipped, all 4 parts

Operator decided to do CP2 now rather than after CP4, reasoning: can't
act on the pending 19:20/08:20 verification windows right now anyway,
and CP4 (bigger, riskier) deserves observability in place *before* it's
built, not after — otherwise a CP4 problem gets debugged the same
blind way today's 003/004 investigation was.

**The gap this closes**: a sync run only ever got recorded once, at the
very end, as a single free-text message. A run that crashed mid-way
(2026-07-16's self-update bug on branch 004) left zero rows anywhere in
any table — the only way to notice was absence of expected activity,
cross-checked by hand across three separate systems (Render logs, this
table, branch machine log files). `ingest.sync_runs.status` already
allowed `'running'` in its CHECK constraint from the start; the code
just never used it.

Four commits, backend -> agent -> backend -> frontend, each verified
against production before moving to the next:

1. **`79993ed`** (PaaSRTSM-project) — `POST /run-start` opens the run row
   immediately (`status='running'`); new `ingest.sync_run_datasets`
   table (migration 059) plus a middleware that logs any dataset POST
   carrying an `X-Sync-Run-Id` header; `POST /run-log` now UPDATEs that
   same row to its final status instead of always INSERTing a new one
   (falls back to old insert-once behavior if no runId is sent, so
   agents mid-self-update don't break). Verified end-to-end with a
   rolled-back test transaction before committing.
2. **`65ab33f`** (SC-StockDay-Ordering) — agent calls `/run-start`
   first (best-effort, never blocks the sync if it fails), then
   `client.js`'s `setSyncRunId()` makes every subsequent request carry
   the correlation header automatically — no per-call-site changes
   needed elsewhere. Ships to every branch automatically via
   self-update on its own next scheduled run.
3. **`0a46422`** (PaaSRTSM-project) — `/sync/nightly-log` now returns
   the rich per-cell object the frontend's `SyncLogMetaCard` component
   already expected but never received (it was built ahead of the
   backend — totalRuns/syncType/message were always showing "-"),
   plus the actual new capability: that day's latest run's per-dataset
   breakdown via a `json_agg` over `sync_run_datasets`. Verified
   282ms against production; `datasets` is null for every existing row
   today since no branch has run the new agent code yet — expected.
4. **`5273771`** (SC-StockDay-Ordering) — `SyncLogMetaCard` renders the
   per-dataset list when present (✅/❌ per dataset, records sent or
   error message); renders nothing extra for older runs that predate
   this.

**Known, accepted gaps** (documented in commit messages, not silently
dropped):
- A PowerShell-wrapper-level crash before Node even starts (like the
  self-update bug) predates `/run-start` and still won't be visible
  this way — that specific failure mode is already separately fixed.
- `/api/branch-stock/sync` lives in a different backend router
  (`branch-stock.js`) without the new logging middleware yet, so that
  one dataset's outcome doesn't show up in the per-dataset breakdown
  until that router gets the same treatment.

**Not yet observed with real data** — every branch is still running
pre-CP2 agent code as of this writing. First real test: whichever
branch runs next (003's re-registered evening task fires 19:20 ICT
tonight, others on their normal schedule) will be the first to show a
populated `datasets` array in the dashboard. Worth checking after
tonight's window alongside the already-planned 003 verification.

## Recommended next step

CP0 is close enough to complete that starting CP1 work which doesn't depend
on MA-001/MA-004 is reasonable now (user already authorized this). Priority
suggestion given the CPU-saturation finding: start with a **local, no-deploy
design** for the `/api/sync/ada/sales` chunking (CP1.4) and the products
set-based rewrite (CP3.1) in parallel, since both reduce DB CPU load
directly — more impactful right now than the Task Scheduler/fleet-version
cleanup (CP1.1/1.2), which are still needed but don't address the CPU
ceiling by themselves.

---

## 2026-07-19 — Branch 003 stray pre-schedule sync failures traced to client IP `182.53.106.138` — KNOWN, UNFIXED, NOT BLOCKING

**Status: open, low priority, fix deferred until next on-site visit to branch 003.**

### What was observed
Three `adapos_branch_003` sync_runs failed today at 08:03, 08:08, 08:12 ICT
with `400 — "branchCode must be one of 000, 001, 002, 003, 004, 005."`,
followed by a normal successful run at the real 08:20 schedule.

### Verified NOT the cause
Ran the new read-only `branch-task-diagnostic.ps1` directly on POSSRV
(branch 003's real POS machine). Its Task Scheduler operational log shows
**exactly one** AdaPOS-related trigger today (`08:20:01`, completed with
return code 0), and exactly one log file (`sync-20260719-082002.log`).
POSSRV itself is clean — the three failed attempts did not come from it.

### Where the failed requests actually came from
Pulled raw Render platform request logs (`clientIP` field, which the app
itself does not log — see gap below) for the failure window. Both `400`
responses to `/api/branch-stock/sync` came from `182.53.106.138` — the
**same IP** that later completes the real, successful 08:20 run. Since
POSSRV's own Task Scheduler proves it only fired once, this means a
**second device on branch 003's local network** (same public IP via NAT)
is independently POSTing malformed sync data tagged as branch 003.

### Root cause (per user, high confidence, unverified on-site)
Branch 003 (and other branches) used to run a **branch notebook** that
connected to the POS terminal and relayed data to the web server, to avoid
remoting into the POS machine directly. This was abandoned for stability
reasons (port changes etc. required checking both machines) in favor of
running the sync agent directly on the POS terminal, which is the current
model everywhere. The old notebook was apparently never decommissioned at
branch 003, and — because it stopped receiving code updates once the team
moved on ("เราก็อัปเดตโค้ดมาเรื่อยๆ โดยไม่สนโน้ตบุคสาขาเลย") — is still
running an old Scheduled Task with stale code/config that produces this
malformed `branchCode` request before POSSRV's real scheduled run fires.

### Fix (deferred, not yet done)
Needs physical/remote access to the old branch-003 notebook specifically
(not POSSRV) to find and disable its AdaPOS-related Scheduled Task. Explicit
decision: **do not block CP4 or other work on this** — revisit next time
someone is on-site at branch 003 (or can remote into that specific old
notebook, if it's still identifiable/reachable).

### Side finding: no IP/user-agent logging in the backend
This whole trace only worked because Render's platform-level logs happen to
capture `clientIP`. `apps/admin-api/src/routes/sync.js` does not log this
itself. Not acted on — noted in case a future investigation needs it and
Render's log retention has since expired.
