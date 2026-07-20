# Evidence Log — CP0 Baseline (2026-07-14)

All entries below are from direct tool calls this session (git, psql against
production, mapped network drives). No estimates presented as measurements.

## Repo state

**SC-StockDay-Ordering** (agent + frontend):
- Branch: `main`, tracking `origin/main`, clean working tree
- HEAD: `46a48d66ee0e6d87bd7987da784c4b707d05764b` (2026-07-13 15:10:06 +0700)

**PaaSRTSM-project** (production backend):
- Branch: `fix/stock-recommendation-anchor-date-stability`, clean, up to date with its origin
- **This is NOT `main`.** A concurrent agent/session had this shared working
  directory checked out to a different branch at the moment CP0 ran.
- `origin/main` HEAD: `3325d85c8ccc0ca6edca949bf3febfec634eb581`
  (2026-07-13 14:00:41 +0700, "feat(stock-recommendations): implement
  value-weighted average days cover calculation") — this is newer than the
  `6c3e1f9` HEAD referenced earlier in this same investigation session,
  confirming main moved via a different push while this session was working.
- Other local branches present: `codex/branch-005-transfer-ingestion` (exists
  locally + on origin — unexplored; may be a Codex-authored branch already
  touching branch 005 sync/transfer code. Needs review before CP1 touches
  anything transfer/branch-005-related, to avoid duplicate work.)
- **Risk noted, not yet acted on**: this directory is shared with at least one
  other concurrent agent. Do not `git checkout` branches in this working copy
  without re-checking `git status`/`git branch` immediately before, per prior
  session's documented collision incidents.

## Sync-fix commits already on `origin/main` (SC-StockDay-Ordering) relevant to this program

- `ef33ee2` — split morning(08:20)/evening(19:20) scheduled-task pattern
- `c6caf4e` (PaaSRTSM-project) — stable product-record ordering to reduce deadlocks (confirmed deployed to production via ancestry check + live 401 vs 404 probe on `/api/focus-products`)
- `6d10f10` — client.js: guard response-body read under the same request timeout (`requestWithTimeout`)
- `e71e32f` — `ADAPOS_SYNC_PRODUCT_BATCH_SIZE` (default 100), products batched separately from other datasets

## Agent fleet inventory (as observed via mapped network drives, 2026-07-13/14)

| Branch | Host | Install path | Scheduled tasks | `.env` host | Product batch | Request timeout | Code freshness |
|---|---|---|---|---|---|---|---|
| 001 | `SC_001\SQLEXPRESS` | `U:\RxAuu\SC-StockDay-Ordering\apps\adapos-sync` | Morning 08:20 + Evening 19:20 (re-registered 2026-07-14, previously single legacy 19:30-only task) | named instance, correct | 100 (has fix) | 180000ms (pre-existing override, predates the 100-batch fix) | current (has `productBatchSize` log line) |
| 003 | `POSSRV\SQLEXPRESS` | `R:\Users\Administrator\Desktop\RxAuu\SC-StockDay-Ordering\apps\adapos-sync` | Morning 08:20 + Evening 19:20 | named instance, correct | 100 (has fix) | 60000ms default | current |
| 004 | `127.0.0.1` (was raw LAN IP `192.168.1.102`, fixed 2026-07-13) | `Q:\Users\Administrator\Desktop\RxAuu\apps\adapos-sync` | Morning 08:20 + Evening 19:20 | loopback, correct | **500 (stale — no `productBatchSize` fix pulled)** | 60000ms default | **stale**: `config.js` last modified 2026-07-08, predates the batch-size fix entirely; `.env` was hand-edited directly on the machine but the source tree was never `git pull`-ed |
| 005 | `POSSRV\SQLEXPRESS` | `D:\SCstockDay\apps\adapos-sync` (mapped as `X:`/`Z:`) | **Duplicate**: legacy `SCstockDay-ADAPOS-SYNC-0815` (08:15) + legacy `SCstockDay-ADAPOS-SYNC-1920` (19:20) + current `AdaPOS Sync (Branch 005) - Morning/Evening` (08:20/19:20) — up to 2 full runs per window | named instance, correct | 500 (stale, same as 004) | **no application-level timeout set** — request waits indefinitely (confirmed: 08:20 run on 2026-07-14 took 17m51s to complete, succeeded because nothing bounded it, not because it "won" any lock race) | stale, same vintage as 004 |
| 000 | **unknown** | Checked V:/W:/Y: (mapped as HQ000User/HQ000D/HQ000C). No `adapos-sync`, `RxAuu`, or `SCstockDay` folder found under `Y:\Users\Administrator\Desktop` or `W:\` root (W: contains only AdaAcc/Adasoft/BENZ/EXPRESS/PayrollData/X-Database — looks like the AdaPos data drive, no sync-agent install visible). `Y:\Windows\System32\Tasks` returned empty on every query attempted — this looks like an access/permission limit on that share, not proof no tasks exist, since even baseline OS tasks should be listable. **Inconclusive, not resolved** — see MA-001. | unknown | unknown | unknown | unknown | unknown |

Correction carried forward from user: the earlier statement that 005 "won the
lock race by starting first" is retracted — 005 has no client-side timeout at
all, so its 2026-07-14 success only proves it didn't hit a hard timeout, not
that it avoided lock contention.

## 2026-07-14 08:20 failure evidence (same-morning correlated failures across 001/003/004)

- 001: `SQL Server: connected OK`, read 22,569 records, `Posting 6591 products (100/batch)...` → `Request timed out after 180000ms` on `POST /api/sync/products`. **Zero products accepted this run.**
- 003: read 22,363 records, products (6,591) and sales-summary (2,079) accepted, then `Request timed out after 60000ms` on `POST /api/sync/ada/sales` (1,745 headers + 3,468 lines, single unbatched request). **8,670 records accepted before failure.**
- 004: read 18,459 records, `Posting 6591 products...` (no batch-size fix present) → `Request timed out after 60000ms` on `POST /api/sync/products`. **Zero products accepted this run.**
- 005: two full runs (08:15:02 and 08:20:01), both succeeded, both ~17m51s wall time (08:20 run: `Done. 24364 records sent` at 08:37:52).

## Production database baseline (queried directly via psql, read-only, 2026-07-14)

Connection used: `ADAPOS_POSTGRESQL_URL` found in branch `.env` files
(`sc_drug_db` on Render-managed Postgres). This is the live production
database backing `paasrtsm-project.onrender.com`.

- PostgreSQL 18.3 (Render-managed)
- `max_connections = 103`, current connections at check time: 13 (off-peak; **not** a peak-window sample — CP0 does not yet have an 08:20-window connection-count sample, see MANUAL-ACTIONS)

**Largest tables:**

| Table | Size | Live rows | Dead rows | Last autovacuum |
|---|---|---|---|---|
| `analytics.product_stock_snapshots` | 1159 MB | 4,988,268 | 5,844 | 2026-07-09 |
| `ada.sales_lines` | 900 MB | 953,250 | 23,991 | 2026-07-12 |
| `ada.sales_headers` | 374 MB | 492,181 | 12,270 | 2026-07-12 |
| `analytics.product_sales_summary_periods` | 183 MB | 893,984 | 25,170 | 2026-07-12 |
| `public.sku_embeddings` | 107 MB | 0 (reported) | 0 | never |
| `ada.product_category_embeddings` | 104 MB | 0 (reported) | 0 | never |
| `ada.stock_snapshots` | 80 MB | 117,569 | 0 | 2026-07-14 |
| `ordering.stock_recommendation_snapshots` | 34 MB | 42,467 | 0 | 2026-07-13 |
| `ada.branch_stock_snapshots` | 23 MB | 6,592 | 0 | 2026-07-14 |
| `public.skus` | 22 MB | 9,342 | 0 | 2026-07-14 |

**`pg_stat_statements` top offenders by total execution time (all-time since last stats reset, unknown reset date — see MANUAL-ACTIONS):**

| Query (truncated) | Calls | Total time | Mean time |
|---|---|---|---|
| `WITH latest_stock AS (SELECT DISTINCT ON (ps.product_code)...` | 401 | 150,014.9s (~41.7h cumulative) | 374,101.9ms (**6.24 min avg**) |
| `WITH filtered_sales AS (...)` (stock-recommendation related) | 3 | 13,584.5s | **4,528,171.5ms (~75.5 min avg)** |
| `WITH filtered_sales AS (...)` (variant) | 159 | 12,226.5s | 76,896.0ms (~1.3 min avg) |
| `UPDATE public.items SET generic_name = ...` | 1,809,179 | 9,077.2s | 5.0ms |
| `INSERT INTO analytics.product_stock_snapshots (...)` | 1,809,224 | 6,666.3s | 3.7ms |
| branch-stock read query | 4,171 | 6,083.2s | 1,458.4ms |
| `INSERT INTO analytics.product_sales_summary_periods (...)` | 407,369 | 3,933.0s | 9.7ms |
| `SELECT COUNT(*) FROM ada.branch_stock_snapshots ...` | 4,182 | 3,856.9s | 922.3ms |

`UPDATE public.items` and `INSERT INTO product_stock_snapshots` call counts
(1,809,179 / 1,809,224) match each other almost exactly, confirming these are
the same per-record product-upsert loop (`upsertProductRecord` in
`apps/admin-api/src/routes/sync.js`) firing one query per product, no batching
at the SQL level even after the client-side `ADAPOS_SYNC_PRODUCT_BATCH_SIZE`
fix (that fix reduces *request* size, not per-record query count within a request).

The `WITH filtered_sales` query at ~75.5 min mean execution time (3 calls) is
**not currently in this program's scope** (looks stock-recommendation-related,
not sync) but is flagged here because it competes for the same DB resources
during any sync window and was not previously known to this investigation.

## Confirmed code-level findings (read, not yet changed)

- `apps/admin-api/src/routes/sync.js:283-309` + `116-269` (`upsertProductRecord`) — 5-8 sequential queries per product, single transaction per batch, matches DB evidence above.
- `apps/admin-api/src/routes/sync-ada.js:2061` (`POST /ada/sales`) — same pattern, but **unbatched at the client**: agent sends the entire day's headers+lines (up to several thousand records) in one request, one transaction, no chunking at all. This is a distinct, unfixed instance of the same architectural problem as products.
- `apps/admin-api/src/routes/branch-stock.js:334,711-730` (`upsertBranchStockSnapshot`, `mergeBranchStockRecord`) — confirmed read-modify-write pattern: reads the existing wide row, merges only the posting branch's qty/cost columns into a JS object copy of the *entire* row, then writes all six branch columns back. Two branches' concurrent upserts for the same `product_code` can race: the later write overwrites the earlier branch's column with a stale value it read before the earlier write landed. Not yet reproduced under load; risk confirmed by code reading only.
- `apps/admin-api/src/routes/ordering.js` (`GET /sync/nightly-log`) — daily status uses `bool_or(status='success')` per day, i.e. "any success that day" rather than "latest run status." Confirmed by reading the SQL directly. This is why 2026-07-13 showed green for 003/004 despite an evening failure being possible.
- No `render.yaml` found anywhere in either repo — Render deploy trigger (auto vs manual, which branch is tracked, root directory setting) is **not visible from either repo** and requires Render dashboard access (see MANUAL-ACTIONS).

## Render dashboard baseline (via Render MCP, read-only, reported 2026-07-14 — resolves most of MA-002)

**Backend (`PaaSRTSM-project`, `srv-d6c0sd0gjchc73fvup5g`)**:
- Plan: `starter`, 1 instance, 0.5 CPU / 512 MiB limit, region `virginia`
- Auto-Deploy: **On**, tracks `main`, trigger=`commit`
- Build: `npm install`, pre-deploy: `npm run db:migrate`, start: `npm run admin-api:start`, health check `/admin/health`, port 3001
- Current live deploy: commit `0873c284` (commit time 2026-07-13 07:53:13 UTC, deployed 08:10:52→08:12:32 UTC, trigger=**manual**). Confirms auto-deploy has genuinely been landing commits — an earlier commit (`3325d85`) also deployed successfully earlier the same day and is now superseded/deactivated. **This resolves the "is the fix actually deployed" uncertainty from earlier in this investigation: yes, the deploy pipeline works and is not stuck.**
- 24h backend metrics: CPU peak 7.07% of limit, memory peak 32.52% of limit — **backend compute is not the bottleneck at any point**
- **08:00-08:40 ICT (01:00-01:40 UTC) window**: CPU avg 4.77%/max 6.96% of limit, memory max 23.72% of limit — still nowhere near saturated
- **HTTP 200 latency in that window: avg 29.0s, max 61.27s** — matches the client-side timeouts observed in agent logs almost exactly (60s/180s configured timeouts, real responses regularly exceeding that)
- One HTTP `499` (client closed connection before server responded) at 01:40 UTC — consistent with an agent giving up mid-request while the server was still working

**Postgres (`sc-drug-db`, `dpg-d6apu9i4d50c73c7sas0-a`)**:
- Plan: **`basic_256mb`** — 0.1 CPU / 256 MiB memory limit, PostgreSQL 18, region `virginia`
- Storage: 15 GB provisioned, disk autoscaling **off**, ~3.25 GB used (21.6%) — storage is not the constraint
- HA: **false**, no read replicas, `connectionPool = none` (no managed PgBouncer)
- `max_connections=103` confirmed to match this session's earlier direct SQL read; Render MCP did not expose this as a plan-document field separately
- 24h DB metrics: CPU peak **100%** of the 0.1-CPU limit, memory peak 93.25% of the 256MB limit, active connections max 9
- **08:00-08:40 ICT window: CPU avg 81.72% of limit, touching 100%; memory max 78.20% of limit; active connections max only 4**

**This is the single most important finding in CP0.** During the exact window every branch's sync failed, the database was CPU-saturated on a **0.1-CPU-limit instance** while only 2-4 active connections were open — this is not primarily a "many concurrent sessions piled up" picture (that would show connection count near the observed max of 9, and it didn't reach that even at saturation). It's more consistent with **a small number of genuinely expensive queries (the N+1 per-record upsert loops, the 6.24-min-avg stock query) fully consuming a very small CPU allocation.** The lock-contention theory (MA-003) may still be a contributing factor, but the DB being undersized relative to its query workload is now a confirmed, independent, and probably larger factor. Both can be true: expensive queries cause long-held locks *and* burn CPU the whole time they hold them.

**Frontend (`SC-StockDay-Ordering`, static site, `srv-d87t9sjeo5us738ldfu0`)**: root dir `apps/admin-web`, auto-deploy On, tracks `main`, current live deploy matches commit `46a48d6` (this session's last known SC-StockDay-Ordering HEAD) — confirms the frontend is not lagging behind the repo.

**Still unresolved (narrower MA-002 follow-up, see updated MANUAL-ACTIONS.md)**: autoscaling min/max config, PITR retention days, Disk I/O metrics (neither Render MCP nor CLI expose these). ~~Workspace billing/plan tier~~ resolved 2026-07-15 (Professional, see MANUAL-ACTIONS.md).

## Render CLI access confirmed working (2026-07-15)

`render` CLI v2.21.0 is installed (`C:\Users\scgro\AppData\Local\Programs\RenderCLI`) and has a valid, non-expired login token in `~/.render/cli.yaml` (workspace `tea-d58i7hchg0os73bqofb0`, matches the MCP-based checks from 2026-07-14 exactly). **Gotcha**: a stale/dummy `RENDER_API_KEY=S123123c` environment variable in the shell profile overrides the valid config file and causes every command to fail with `401 unauthorized` — must `unset RENDER_API_KEY` before each `render` invocation (env vars don't persist across separate Bash tool calls in this session). Worth permanently removing that env var from the user's system/user environment variables rather than working around it every time — flagged, not yet done (low priority, not blocking).

Used this to independently re-verify (all matched exactly): backend (`srv-d6c0sd0gjchc73fvup5g`) live deploy = current `origin/main` HEAD on PaaSRTSM-project, no commits pending. Frontend (`srv-d87t9sjeo5us738ldfu0`) live deploy commit `a9acfe5` is an ancestor relationship away from being stale — checked directly and confirmed the 3 commits ahead of it on SC-StockDay-Ordering `main` touch only `apps/adapos-sync` and `docs/`, none touch `apps/admin-web`, so there is genuinely nothing pending to deploy for the frontend (the earlier concern that the notification badge feature, `e8b5efb`, might not be live was a false alarm — it's an ancestor of the deployed commit, already live). No Background Worker or Key Value instances exist yet in the workspace (confirmed via both MCP and CLI, consistently). Six other Postgres instances exist in the same workspace, all belonging to unrelated projects (`scDigitalPJKform`, `scglam-db`, `scGlam-receptionDb`, `SCUserAccountInfo`, `rx1011-postgres`, `scai-rag-pdf-storage`) and all `basic_256mb` — none suitable to reuse as a staging DB for this program's concurrency testing.

## What CP0 could NOT gather from this session (see MANUAL-ACTIONS.md)

- Render web-service CPU/RAM, instance type, autoscaling config, plan tier
- Render Postgres instance type, storage size/limit, connection limit vs `max_connections` seen above, PITR/HA/read-replica status
- Whether Render workspace plan supports Background Workers / Key Value (Pro-tier features)
- ~~Branch 000's install path, agent version, schedule, or `.env`~~ — resolved
  2026-07-20, and **the 2026-07-15 resolution below was itself wrong**: see
  "Branch 000 production path — corrected 2026-07-20" below
- ~~`pg_stat_statements` reset history~~ — resolved: `stats_reset = 2026-06-19 12:54:29 UTC`, so all totals above cover **~25 days** (2026-06-19 → 2026-07-14). The 401 calls / 150,014.9s total on the `latest_stock` query average out to ~16 calls/day at ~6.24 min each.
- Live `pg_locks`/`pg_stat_activity` snapshot *during* an 08:20 contention window (all queries above were run mid-afternoon, off-peak)

## Branch 000 production path — corrected 2026-07-20

**The 2026-07-15 resolution of MA-001 was wrong.** It identified
`C:\SC-StockDay-Ordering` (local path on the "server" / branch-000 host) as
the production install because that path exists, is a valid clone on `main`,
and its `.env` reports `ADAPOS_SYNC_BRANCH_CODE=000`. All true — but that
checkout is **not what the machine's production Scheduled Task actually
runs.** It was last synced 2026-06-26 and never touched again; the "first
successful sync since the 2026-06-26 stall" claimed on 2026-07-15 was a real
sync, but of a checkout the live task had already stopped using, not a
recovery of the production path.

**Actual production path, confirmed 2026-07-20 by enumerating every
Scheduled Task on the host (not filtering by name) and cross-checking each
candidate's log directory for continuity**:
`C:\Users\Administrator\Desktop\Stockdays\SC-StockDay-Ordering\apps\adapos-sync`,
run by the task `AdaPOS-Sync Daily 1920` (SYSTEM, triggers 08:20 and 19:20
daily) — this path has an unbroken daily log history through 2026-07-20,
including 2026-07-15, contradicting the "6-week-old, uncommitted stall" story
built around the other path. The dashboard staying green after 2026-06-26 was
because of this real, working task — not evidence the other checkout was
fine.

**Resolution actions, 2026-07-20** (all under a Claude session with real
console access on the host, elevated Administrator, no full sync run at any
point):
- Bootstrapped the production path to `main`@`8e74e934` (fast-forward,
  working tree already clean), then proved the self-update mechanism itself
  works under the production task's own SYSTEM account: CURRENT (no-op),
  Advance B→C (`8e74e93`→`361085c`), CURRENT again, then Advance C→D
  (`361085c`→`912d984`, this maintenance work) and CURRENT again — all five
  runs via `verify-self-update.ps1`, all `SELF-UPDATE ACCEPTANCE PASSED`.
- Replaced the single `AdaPOS-Sync Daily 1920` task (both triggers ran an
  unconditional full sync) with `AdaPOS Sync (Branch 000) - Morning` (08:20,
  full sync) and `AdaPOS Sync (Branch 000) - Evening` (19:20,
  `-SkipIfSyncedToday`) via a disabled-then-verified-then-enabled cutover
  (see MANUAL-ACTIONS.md MA-006). The old task is kept, disabled, as an
  immediate rollback path — not deleted.
- Quarantined the stale `C:\SC-StockDay-Ordering` checkout to
  `C:\_ADAPOS_LEGACY\SC-StockDay-Ordering-LEGACY-20260720` (moved, not
  deleted) and left a `DO-NOT-USE.txt` stub at the old path pointing at both
  the quarantine location and the real production path.
- Added self-update status monitoring (deterministic
  `logs/self-update-latest.json`, a post-run checker with a stable exit-code
  contract, and best-effort `POST /api/sync/heartbeat` events) so a future
  FAILED or silently-hung self-update on any branch is externally observable
  instead of only visible in a log file no one is tailing. See
  MANUAL-ACTIONS.md MA-001 for the full before/after and STATE.md for
  today's entry. **The central dashboard does not render this yet** — the
  heartbeat events are being sent, but there is no backend/dashboard
  consumer deployed for them. Do not treat this as "central self-update
  monitoring is live" until that consumer ships (tracked as a handoff to a
  dev-machine session against the backend repo, which has separate CP4 work
  in progress that branch-000 sessions must not touch).

**Standing question this raises, not yet answered**: whether any of
001/003/004/005's own "confirmed" install paths were verified the same
name-filtered way branch 000's was on 2026-07-15 (by finding *a* checkout
that matches, rather than by enumerating every Scheduled Task and checking
which one the host actually runs). Worth a narrow re-check before treating
any of them as settled, using the same method used here: enumerate all
tasks, don't filter by expected name, cross-check log continuity.
