# Incident — 2026-07-24 morning sync: all branches hourglass, pg-pool timeout, Render restart

**Status: root cause understood with high confidence from production logs,
branch logs, and production DB read-only verification. Two fixes are prepared
locally (not committed/deployed): release the `/sales` DB connection before the
CRM mirror call, and render old interrupted runs as `stale` instead of a
permanent hourglass. Manual reruns recovered all five branches (`000`, `001`,
`003`, `004`, and `005`).**

## Timeline (from facts already reported; times ICT)

| Time | Event |
|---|---|
| ~08:20 | All branches' Morning sync tasks fire simultaneously (by design — see `DECISIONS.md`: simultaneous scheduling is a hard product requirement, not something to stagger away). |
| 08:23:39 | Render logs: `Error: timeout exceeded when trying to connect` at `pg-pool/index.js` — the API's pool (`max: 10`, `connectionTimeoutMillis: 15_000`, see `apps/admin-api/src/db.js`) could not hand out a free connection within 15s. |
| 08:23:41 | Render restarts the API instance (health check failure following the pool errors). |
| ~08:23–08:4x | Browser shows CORS/fetch/HTTP 500 errors. During an instance restart there is no live process to answer `OPTIONS`/`GET`/`POST` requests at all, so `fetch()` reports a generic network/CORS-shaped error regardless of the CORS middleware's own logic (`apps/admin-api/src/server.js`) — this is a symptom of the restart, not a separate CORS bug. |
| ~08:2x | Branch 005 (v1 sync): `branch_stock` batch 2/66 fails with HTTP 502 (hitting the API mid-restart or mid-pool-exhaustion), agent reports `Sync failed: terminated`. |
| later | Branch 005 reruns manually: `Done. 17944 records sent to API.` — succeeds once the DB is no longer saturated. |
| later | Branch 001 reruns manually: `Done. 23158 records sent to API.` — same pattern. |
| later | Branch 003 reruns manually: production DB run `1823`, `Done` equivalent (`records_sent=22098`), `09:06:27` -> `09:09:40`. |
| later | Branch 004 reruns manually from `C:\Users\Administrator\Desktop\RxAuu`: initial run `1820` had failed with `CP4: RESULT=FAILED ... Request failed: 502`; rerun `1826` succeeded (`status='success'`, `handoff_status='success'`, `apply_status='applied'`, 67/67 batches, `records_sent=25271`). |
| later | Branch 000 reruns manually from `C:\Users\Administrator\Desktop\Stockdays\SC-StockDay-Ordering`: production DB run `1827`, `Done. 16390 records sent to API.` and `Sync succeeded` at `11:57:03`. |
| — | Several `ingest.sync_runs` rows left with `status='running'` and no `finished_at` — orphaned by the restart. |

## Impacted branches

- **001** — v1 (synchronous) sync. Initial 08:20 run `1822` was interrupted and
  left `running`; manual rerun `1824` succeeded (`09:37:43` -> `09:41:14`,
  `records_sent=23158`).
- **003** — v1 sync. Initial 08:20 run `1819` was interrupted and left
  `running`; manual rerun `1823` succeeded (`09:06:27` -> `09:09:40`,
  `records_sent=22098`).
- **005** — v1 sync. Initial 08:20 run `1818` was interrupted and local branch
  log showed `HTTP 502` / `Sync failed: terminated`; manual rerun `1825`
  succeeded (`10:11:23` -> `10:14:04`, `records_sent=17944`).
- **004** — CP4 async branch. Initial run `1820` failed during branch-stock
  staging/apply after products chunks were posted and was left `running`.
  Manual rerun `1826` succeeded (`11:44:32` -> `11:48:34`,
  `handoff_status='success'`, `apply_status='applied'`, 67/67 batches,
  `records_sent=25271`). Actual SERVER004 repo path:
  `C:\Users\Administrator\Desktop\RxAuu`.
- **000** — v1 sync. Initial 08:20 run `1821` was interrupted and left
  `running`; manual rerun from
  `C:\Users\Administrator\Desktop\Stockdays\SC-StockDay-Ordering` created
  production DB run `1827`, which succeeded (`11:53:39` -> `11:57:02`,
  `records_sent=16390`).

## Root cause

This is the same fundamental issue as the 2026-07-15 outage documented in
`STATE.md` — Postgres CPU saturation during the simultaneous 08:20 burst —
compounding through two mechanisms already known from that investigation, plus
one newly identified during this session's code review.

### 1. DB CPU saturation during the simultaneous morning burst (primary, known pattern)

Production Postgres is `basic_256mb` — **0.1 vCPU**, confirmed in `EVIDENCE.md`
to have hit 100% of that limit during the 2026-07-14/15 peak windows while
connection *count* stayed low (max ~4 of 103 `max_connections`). Today's error
(`timeout exceeded when trying to connect` from `pg-pool`) is consistent with
the same shape: the app's pool (`max: 10`) had connections checked out running
real queries that were slow because the CPU was saturated by the *other* 9
connections' queries, not because 10 was too small a pool for the connection
*count* — `connectionTimeoutMillis: 15_000` then fired once a caller waited
too long for one of those 10 to free up.

Of the 5 branches, only branch 004 is on CP4 (async ingestion — queue+worker,
decouples the agent's HTTP request from the DB write). **000, 001, 003, and
005 are still on v1 synchronous sync**, per the explicit rollout
gate in `STATE.md`: *"CP4 is production-active on branch 004... do not expand
CP4 to another branch without an explicit rollout decision."* Every v1 request
holds a pool connection open for the duration of its own query — at 4-5
branches hitting `/api/sync/ada/*` and `/api/sync/*` simultaneously at 08:20,
this is the exact contention pattern the CP4 design doc was written to solve,
and it has only been rolled out to one of five branches so far.

### 2. A newly identified contributor: CRM mirror call held the pool connection open (fixed this session)

`apps/admin-api/src/routes/sync-ada.js`'s `POST /sales` handler committed its
transaction, then — **before releasing the pool connection** — made a
synchronous outbound `fetch()` to the CRM mirror service
(`apps/admin-api/src/integrations/currentScCrm.js`) and only called
`client.release()` in a `finally` block *after* that network call returned.
The mirror call is already known to sometimes hit `413` (payload too large,
per `STATE.md`'s "CRM mirror 413 still open" note) and is unbounded — no
timeout is set on the `fetch()` call. During a simultaneous multi-branch
burst, every extra second a `/sales` request's connection sat idle waiting on
an external HTTP call (rather than being returned to the pool immediately
after its own DB work finished) is a second the already-scarce pool has one
fewer slot for the other branches' concurrent requests. This doesn't create
new DB load, but it directly shrinks the effective size of the 10-connection
pool exactly during the window where every connection matters most — a
multiplier on root cause #1, not a separate root cause.

**Fixed this session** (not yet deployed): moved `client.release()` to
immediately after `COMMIT`, before the CRM mirror try/catch. Verified with
tests that the connection is released before the mirror call runs (see
`apps/admin-api/src/routes/sync-ada.test.js`, new file — this route file had
zero prior test coverage). The CRM mirror's own 413/latency behavior itself
is unchanged and still worth fixing (see "Remaining risk" below) — this fix
only stops it from holding a scarce pool slot hostage while it does its
thing.

### 3. Dashboard status derivation masked the interruption (fixed this session)

`GET /api/sync/nightly-log` and `GET /api/sync/hourly-log`
(`apps/admin-api/src/routes/ordering.js`) derive each day/hour's grid cell
from `bool_or(status = 'running')` with no time bound — a run stuck at
`status='running'` forever (because the restart happened before the agent
could call `/run-log` to close it out, or in CP4's case, because of a stale
`total_batches` — see below) looks *identical* in the query to a run that
started 30 seconds ago and is still genuinely in progress. There was no way
for the grid to distinguish "actively syncing right now" from "died an hour
ago, nobody knows." This is exactly the "hourglass forever" symptom reported
for branch 004's cell, and would have looked the same for 001/003/005 in the
window between the restart and their manual reruns.

(Separately, note that once a later run *does* succeed the same day, the
rollup's `bool_or(status='success')` takes priority in the `CASE`, so the
grid cell flips to ✅ and the earlier stuck `running` row becomes invisible in
the daily rollup entirely, even though the row itself is still sitting in the
table with no `finished_at`. This is why the stuck rows had to be found by
querying `ingest.sync_runs` directly rather than noticed through the UI. This
part is unchanged by today's fix — it's a data-hygiene/observability gap, not
a user-facing bug, and lower priority than the "still stuck right now"
symptom.)

**Fixed this session** (not yet deployed): both queries now classify a
`status='running'` row as `'stale'` instead of `'running'` once it has been
running for more than `STALE_RUN_MINUTES` (60, chosen because the worst
real peak-window run observed to date — 2026-07-15, branch 001 — took
22m44s; CP4's async apply phase adds more wall time on top of that, so 60
minutes is comfortably above anything this program has ever seen succeed).
`'stale'` is a new grid status, rendered in `admin-web` as a distinct ⚠️ icon
(`apps/admin-web/src/App.jsx`, `apps/admin-web/src/styles.css`) instead of
the perpetual ⏳ hourglass, with a legend entry explaining what it means.
Verified against a real, throwaway local PostgreSQL 18 instance (this
session had no access to the production DB, so used the same local-scratch-
cluster technique already established in `CP4_ASYNC_INGESTION_DESIGN.md`)
with fixture rows shaped exactly like this incident: a branch with only a
90-minute-old stuck run correctly shows `'stale'`; a branch with a
genuinely-5-minutes-old running run correctly still shows `'running'`; a
branch with both a stuck run and a later success still correctly shows
`'success'` (this part of the behavior was intentionally not changed).

### Branch 004 note: failed first run, recovered by rerun

Branch `004`'s first run (`1820`) did not reach CP4 handoff/apply: it was left
`running`, `handoff_status='running'`, `apply_status='waiting'`, with no
`ingest.sync_batches` rows and only products chunks recorded. Local SERVER004
log later confirmed the terminal signal: `CP4: RESULT=FAILED runId=1820
dataset=branch_stock`, caused by `Request failed: 502`.

Manual rerun from the actual repo path
`C:\Users\Administrator\Desktop\RxAuu` created run `1826`, which production DB
confirmed as `status='success'`, `handoff_status='success'`,
`apply_status='applied'`, `total_batches=67`, `applied_batches=67`,
`failed_batches=0`.

## What was data loss vs. what was stale UI

- **No confirmed data loss for branches recovered by rerun.** Branches `000`,
  `001`, `003`, `004`, and `005` all have successful local or production DB
  recovery evidence for 2026-07-24 after manual reruns. Source data remains in
  each branch AdaAcc database, so reruns are the correct recovery path for
  interrupted v1 syncs.
- **The stuck `ingest.sync_runs` rows themselves are stale bookkeeping, not
  lost source data** — the underlying AdaAcc data on each branch's own SQL
  Server is untouched by a failed sync; a rerun re-reads it fresh. The risk
  from a stuck row is purely that nobody notices a branch actually needs a
  rerun, not that data was silently dropped.
- **Partial initial rows are visible and now understood.** The interrupted
  08:20 runs left partial `sync_run_datasets` rows: for example `001`, `003`,
  and `005` recorded `sales-summary` chunks before their later successful
  reruns, while `004` recorded only `products` chunks. For `001`, `003`,
  `004`, and `005`, later success rows supersede those partial attempts.
  Branch `000` was later confirmed successful from its local sync log.

## Manual recovery already done

- Branch 005: manual rerun, `Done. 17944 records sent to API.`
- Branch 001: manual rerun, `Done. 23158 records sent to API.`
- Branch 003: production DB run `1823` succeeded with `records_sent=22098`.
- Branch 004: manual rerun from `C:\Users\Administrator\Desktop\RxAuu`,
  production DB run `1826` succeeded with `records_sent=25271`, 67/67 CP4
  batches applied.
- Branch 000: manual rerun from
  `C:\Users\Administrator\Desktop\Stockdays\SC-StockDay-Ordering`, latest log
  `sync-20260724-115332.log`, production DB run `1827`,
  `records_sent=16390`, `Sync succeeded` at `11:57:03`.
- No manual DB repair (e.g., clearing stuck `running` rows) is reported to have
happened — the stuck rows are presumably still sitting in `ingest.sync_runs`
as of this writing.

## Production DB verification performed

Production DB was queried read-only from the local `PaaSRTSM-project`
environment after the manual reruns. Result for 2026-07-24:

- `000`: interrupted run `1821`, later success run `1827`
  (`records_sent=16390`).
- `001`: interrupted run `1822`, later success run `1824`
  (`records_sent=23158`).
- `003`: interrupted run `1819`, later success run `1823`
  (`records_sent=22098`).
- `004`: interrupted run `1820`, later success run `1826`
  (`records_sent=25271`, `handoff_status='success'`, `apply_status='applied'`,
  67/67 batches applied).
- `005`: interrupted run `1818`, later success run `1825`
  (`records_sent=17944`).

## Evidence gaps — exactly what's still missing

1. **`pg_stat_activity`/CPU graph for the 08:15–08:40 window**, to confirm
   this was the same CPU-saturation shape as 2026-07-15 rather than something
   new (e.g., a specific slow query introduced by the 07-21
   `fix/cp4-branch-stock-safe-apply` merge, the most recent backend change
   before today with no LINE-package-feature commits in between).
2. **Whether the worker (Background Worker service, separate Render service
   per `CP4_ASYNC_INGESTION_DESIGN.md`) also logged pool-timeout errors at
   the same time** — its pool is independent (`createDbPool()` called fresh
   in `worker.js`'s own process) but points at the same saturated Postgres
   instance, so it's a reasonable place to double-check CPU-bound (not
   connection-count-bound) saturation.

Neither blocks the two fixes prepared this session (they're
narrowly-scoped, low-risk, and independently justified by code reading +
local Postgres verification), but they are useful before making broader
capacity decisions.

## Remaining risk / recommended next steps (not done this session)

Roughly in priority order:

1. **Expand CP4 beyond 004 only after reviewing today's 004 failure mode** (deferred by an explicit prior operator
   decision, per `STATE.md` — *"do not expand CP4 to another branch without
   an explicit rollout decision"*). This is the structural fix for root
   cause #1, but today's first branch `004` run still failed before a manual
   rerun recovered it. Before expanding CP4, review why run `1820` only posted
   `products` chunks and failed branch-stock staging with HTTP 502, even
   though rerun `1826` applied cleanly.
2. **CRM mirror 413 + no-timeout risk** — still open. The pool-hold fix
   shipped today stops it from starving the connection pool, but the mirror
   call itself still has no `fetch()` timeout (could hang indefinitely on a
   slow CRM backend) and still 413s on large payloads (silently swallowed,
   logged only). Two independent follow-ups: (a) add a bounded timeout to
   `currentScCrm.js`'s `fetch()` call so a hung CRM backend can't tie up an
   agent-facing request indefinitely even post-release; (b) chunk large
   mirror payloads or move the mirror call off the request path entirely
   (fire-and-forget via a queue) so 413s stop recurring instead of just
   being logged.
3. **Clean up today's orphaned `running` rows** — once the DB queries above
   confirm which rows are truly abandoned (not still-legitimately-running),
   either a manual `UPDATE` or a small reaper (mirroring
   `worker.js`'s existing `reapStuckBatches()` pattern, but for
   `ingest.sync_runs` rows past `STALE_RUN_MINUTES`) would close this
   automatically going forward instead of leaving stale rows to accumulate
   silently forever.
4. **Root-cause query-level investigation** — `EXPLAIN ANALYZE` on
   whatever query the 08:23:39 pool-timeout errors correspond to, once
   `pg_stat_statements`/DB access is available, to confirm this is still the
   same "aggregate CPU cost of N branches' worth of full syncs" shape as
   2026-07-15, not a new regression introduced by recent backend changes
   (the 07-21 CP4 branch-stock safe-apply merge is the only backend change
   between the last confirmed-stable point and today).
5. **Confirm whether the July 15 `statement_timeout`/pool-hardening settings
   (`04174ff`) are still adequate** at today's actual peak-window load, now
   that CP4 is live on one branch and total daily sync volume has grown
   since that commit.

## What changed in this repo this session (not committed/deployed)

**PaaSRTSM-project:**
- `apps/admin-api/src/routes/sync-ada.js` — release the pool connection
  immediately after `COMMIT` in `POST /sales`, before the CRM mirror call
  (previously held open for the mirror's full round-trip).
- `apps/admin-api/src/routes/sync-ada.test.js` — **new file**, 3 tests
  covering the release-timing fix (this route file had no prior test
  coverage at all).
- `apps/admin-api/src/routes/ordering.js` — `nightly-log` and `hourly-log`
  now classify a `status='running'` row as `'stale'` once it's older than
  `STALE_RUN_MINUTES` (60) with no success/failure yet, instead of showing
  `'running'` forever.

**SC-StockDay-Ordering:**
- `apps/admin-web/src/App.jsx` — renders the new `'stale'` status with a
  distinct ⚠️ icon/label and a legend entry, instead of falling through to
  the generic "no data" (`—`) fallback.
- `apps/admin-web/src/styles.css` — `.sl-stale` color (light + dark theme).

All backend tests pass (49/49, including the 3 new ones). `admin-web` builds
clean (`npm run build -w apps/admin-web`). The `nightly-log`/`hourly-log` SQL
change was verified against a real, throwaway local PostgreSQL 18 cluster
with fixture rows shaped like today's incident (see root cause #3 above) —
not against production, and not via an automated test (no existing test
harness runs real SQL against a live Postgres for this route file; adding
one was out of scope for this session).
