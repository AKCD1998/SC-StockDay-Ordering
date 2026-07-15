# CP4 Design — Async Ingestion (Queue + Worker)

Status: **DESIGN ONLY — no code written yet.** This is the doc to review/
argue with before any implementation starts, per the deploy-gate discipline
used throughout this program (design → review → implement → verify locally
→ deploy, never skip a step).

## Why this is needed (evidence, not assumption)

2026-07-15 08:20 window, *after* every prior mitigation was live (batch
size 100, sales_detail + transfers chunking, single-writer product master):
branch 004 — the **sole** remaining sender of `products`, no other branch
competing for that dataset anymore — still timed out at 60s posting
products. This means the bottleneck is no longer primarily "branches
duplicating work" or "one transaction too big" — it's that **the database
(0.1 CPU) cannot keep up with the combined genuine, non-duplicate load of
4-5 branches all syncing in the same 20-minute window**, no matter how small
each individual request is made. Shrinking requests further has diminishing
returns; the actual constraint is wall-clock DB capacity during a fixed
window.

Staggering schedules would reduce *how much* of that window is contended,
but doesn't fix the underlying issue: at higher branch counts, even a
staggered schedule runs out of window to spread across. The fix that scales
independently of branch count is decoupling "when a branch is ready to send
data" from "when the database actually processes it."

## The core design question the user raised (this is the spec, not an aside)

> ถ้า agent ทุกตัวมี backend รับทราบแล้วว่ามีข้อมูลส่งมาเป็นคิวๆ แล้วทางแอดมิน
> จะรู้ได้ไงว่า อันนี้มันติ๊กถูกจากการรับคิวมา แล้วข้อมูลอัปเดตหรือยัง หรือยัง
> อยู่ในคิว เรากลัวว่ารับคิวมาแล้ว แต่ระหว่างรอคิวเกิดอะไรซักอย่างทำให้ไม่
> สำเร็จ เราจะ detect ได้ว่าข้อมูลตอนนี้ไม่ใช่ข้อมูลล่าสุด

This is the single most important constraint on the whole design:
**"the agent's HTTP request succeeded" must never be conflated with "the
data is live in the database."** A dashboard/admin view that shows green as
soon as a branch's agent gets a `202 Accepted` — before a worker has
actually committed anything — is worse than today's synchronous system,
because today a green checkmark genuinely means the data landed. Async
ingestion must not regress that guarantee; it must make it *more* visible,
not less, since there's now a real window (queue wait + processing time)
where "accepted" and "applied" are different states.

## Status model — three levels, not one

Today, one field (`ingest.sync_runs.status`) tries to represent "did the
agent's HTTP calls succeed." That's not enough once ingestion is
asynchronous — it conflates three genuinely different things that can each
independently succeed or fail:

```
1. AGENT  — did the branch's sync agent read from AdaAcc and hand off
            every batch to the backend without a network/timeout error?
2. QUEUE  — did every handed-off batch get durably persisted (so it
            survives a backend restart) before the agent moved on?
3. APPLY  — did a worker actually process every batch and commit it to
            the live tables (skus, branch_stock_current, sales_*, ...)?
```

Today, (1) and (2) and (3) all happen inside one HTTP request/transaction,
so they're indistinguishable — that's *why* it was safe to have one status
field before. Once (3) is decoupled from (1)/(2), they need to be tracked
and shown separately, and the branch/day dashboard's green checkmark must
be gated on **(3), never on (1) or (2) alone.**

### Schema

```sql
-- One row per sync run (branch's whole scheduled sync attempt).
-- Mostly what ingest.sync_runs already is — extended with an "apply" view.
CREATE TABLE ingest.sync_runs (
  sync_run_id    bigserial PRIMARY KEY,
  branch_code    text NOT NULL,
  sync_type      text NOT NULL,      -- 'adapos_branch_003' etc, unchanged
  started_at     timestamptz NOT NULL,
  finished_at    timestamptz,        -- when the AGENT finished handing off (not when applied)
  agent_status   text NOT NULL CHECK (agent_status IN ('running','success','failed')),
  -- NEW: derived, not agent-reported. Computed from child batches (see below).
  apply_status   text NOT NULL DEFAULT 'pending'
                   CHECK (apply_status IN ('pending','partial','applied','failed')),
  total_batches  int,                -- how many batches this run expects, set once agent finishes
  applied_batches int NOT NULL DEFAULT 0,
  failed_batches  int NOT NULL DEFAULT 0,
  message        text
);

-- One row per chunk/batch the agent posted (products batch, sales_detail
-- chunk, transfer chunk, ...) — the actual unit of queued work.
CREATE TABLE ingest.sync_batches (
  batch_id       bigserial PRIMARY KEY,
  sync_run_id    bigint NOT NULL REFERENCES ingest.sync_runs(sync_run_id),
  dataset        text NOT NULL,      -- 'products' | 'sales_detail' | 'transfers' | ...
  batch_seq      int NOT NULL,       -- 1-based, for ordering/display
  idempotency_key text NOT NULL UNIQUE, -- see "Idempotency" below
  payload        jsonb NOT NULL,
  record_count   int NOT NULL,
  status         text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','processing','applied','failed','dead_letter')),
  attempts       int NOT NULL DEFAULT 0,
  max_attempts    int NOT NULL DEFAULT 5,
  last_error     text,
  queued_at      timestamptz NOT NULL DEFAULT now(),
  claimed_at     timestamptz,        -- worker picked it up
  applied_at     timestamptz,        -- worker committed it
  next_attempt_at timestamptz NOT NULL DEFAULT now() -- for backoff scheduling
);

CREATE INDEX idx_sync_batches_claimable
  ON ingest.sync_batches (next_attempt_at)
  WHERE status IN ('queued', 'failed') ; -- 'failed' here = retryable, not dead_letter
```

`apply_status` on the run is **derived**, updated by the worker every time
it finishes a batch belonging to that run (increment `applied_batches` or
`failed_batches`, then recompute: `applied` if `applied_batches =
total_batches`, `partial` if some applied and some still pending/failed,
`failed` if `failed_batches > 0` and no more retries left on those batches,
`pending` otherwise). This is the field the dashboard's ✅/❌ must read —
**never `agent_status` alone.**

### Idempotency key

`idempotency_key` = `hash(sync_run_id, dataset, batch_seq)` (deterministic,
not random) — if an agent retries posting the same batch (network blip,
agent process restarted mid-run), the backend can `ON CONFLICT
(idempotency_key) DO NOTHING` on insert into `sync_batches`, so a retried
POST never creates a duplicate queued job. This is what makes "agent safely
retries on any network error" a supported behavior instead of a
data-duplication risk.

## Endpoints

```
POST /api/sync/v2/batches
  Body: { branchCode, syncRunId, dataset, batchSeq, isLastBatch, records }
  - Validates branch token + payload shape (fast, no DB writes beyond the
    insert below — this must stay well under 1s even under DB load, so it
    should NOT touch any of the heavily-contended tables directly)
  - INSERT INTO ingest.sync_batches (...) ON CONFLICT (idempotency_key) DO NOTHING
  - If isLastBatch: UPDATE sync_runs SET total_batches = <running count>,
    agent_status = 'success', finished_at = now()
  - Returns 202 { batchId, status: 'queued' }

GET /api/sync/v2/runs/:syncRunId
  Returns the full status: agent_status, apply_status, total/applied/failed
  batch counts, and (if apply_status != 'applied') the oldest still-pending
  batch's queued_at, so a caller can see "how stale is this."

GET /api/sync/v2/runs/:syncRunId/batches
  Per-batch detail — dataset, status, attempts, last_error. This is what a
  human debugging "why isn't branch 003 done yet" actually needs to see.
```

`v1` (`POST /api/sync/products`, `/api/sync/ada/sales`, etc.) **stays live
unmodified** during the transition — v2 is additive, not a replacement, per
the program's standing rule (see PLAN.md).

## Worker

```
LOOP forever:
  claimed = UPDATE ingest.sync_batches
            SET status = 'processing', claimed_at = now(), attempts = attempts + 1
            WHERE batch_id = (
              SELECT batch_id FROM ingest.sync_batches
              WHERE status IN ('queued','failed') AND next_attempt_at <= now()
              ORDER BY queued_at
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            RETURNING *;
  IF nothing claimed: sleep briefly, loop.

  TRY:
    apply the batch (reuses the existing per-dataset upsert logic —
    upsertProductBatch(), the sales_detail/transfers per-record loop, etc.
    — this is exactly where the set-based-upsert work already drafted
    plugs in, unchanged)
    UPDATE sync_batches SET status='applied', applied_at=now()
    UPDATE sync_runs SET applied_batches = applied_batches + 1 WHERE sync_run_id = ...
    recompute and update sync_runs.apply_status
  CATCH:
    IF attempts >= max_attempts:
      UPDATE sync_batches SET status='dead_letter', last_error = ...
      UPDATE sync_runs SET failed_batches = failed_batches + 1 ...
      -- ALERT: dead-lettered batches need a human, they will not self-heal
    ELSE:
      UPDATE sync_batches SET status='failed', last_error=..., 
        next_attempt_at = now() + backoff(attempts)  -- exponential + jitter
```

`FOR UPDATE SKIP LOCKED` is what makes multiple worker instances safe to run
concurrently without them fighting over the same row — this is also the
scaling knob: more worker instances (or higher per-instance concurrency) =
faster queue drain, tunable independently of how many branches are sending
data, and independently of the agent side entirely.

## Dashboard changes (answers the user's actual question directly)

Current `GET /api/sync/nightly-log` logic (`bool_or(status='success')` per
day) needs to become apply-status-aware. Proposed states, in priority order
(worst wins if multiple batches disagree):

| Dashboard symbol | Condition |
|---|---|
| ✅ สำเร็จ | `apply_status = 'applied'` for that branch/day — **every batch confirmed committed**, not just accepted |
| 🕓 กำลังประมวลผล (NEW) | `apply_status IN ('pending','partial')` **and** oldest pending batch's age < some threshold (e.g. 15 min) — queue is working through it normally |
| ⚠️ ค้างในคิวนานผิดปกติ (NEW) | same as above but oldest pending batch's age > threshold — something's stuck (worker down, poison batch blocking behind it, DB still saturated) — **this is the state that answers "ระหว่างรอคิวเกิดอะไรซักอย่าง" directly**: it's visible, not silent |
| ❌ ล้มเหลว | `apply_status = 'failed'` — at least one batch dead-lettered, needs a human |
| 🌙 รอคืนนี้ | unchanged — no run today yet |

The **staleness threshold** is the direct technical answer to "how do we
detect that something went wrong after the queue accepted it": every batch
has `queued_at`; a lightweight periodic check (or computed on read, no
separate job needed) of `now() - queued_at` for anything still `queued` or
`processing` catches a stuck worker, a poison-pill batch, or a queue that's
simply falling behind — long before a human would otherwise notice.

`GET /api/sync/v2/runs/:syncRunId/batches` (per-batch detail) should be
reachable from the dashboard's existing "ประวัติ Sync" drill-down, so
"⚠️ ค้างในคิวนานผิดปกติ" isn't a dead end — clicking it shows exactly which
dataset/batch is stuck and its last error, same debugging experience this
whole session already relied on reading raw logs for, just structured and
queryable instead of scattered across per-branch log files.

## Failure modes this design handles explicitly (per the master plan's own rules)

- **Duplicate submission** (agent retries after a network blip): idempotency
  key makes the second insert a no-op.
- **Out-of-order arrival**: batches are keyed by `(sync_run_id, dataset,
  batch_seq)`, not by arrival order — a worker can apply batch 3 before
  batch 1 finishes without corrupting anything, since each batch is
  independently idempotent at the DB level (the existing `ON CONFLICT DO
  UPDATE` upserts already are).
- **Worker crash mid-batch**: the batch stays `processing` with a
  `claimed_at` timestamp — a reaper (part of the worker loop, or a separate
  cheap periodic check) resets any `processing` batch whose `claimed_at` is
  older than a generous timeout back to `queued`/`failed` so another worker
  picks it up. Never silently lost.
- **Poison batch** (a batch that will never succeed, e.g. malformed data):
  `max_attempts` + `dead_letter` status stops it from blocking the queue
  forever or burning worker cycles infinitely — surfaces as ❌ requiring a
  human, doesn't silently rot.
- **Client (agent) never learns the final outcome**: doesn't need to — the
  agent's job ends at "handed off successfully" (`agent_status`), and the
  *next* scheduled run's self-healing lookback windows (already how
  `sales_detail`/`approved_receipts` work today) naturally catch up on
  anything that ends up `dead_letter`, once a human fixes the root cause and
  requeues or waits for fresh data next window. Real-time confirmation is a
  dashboard/admin concern, not an agent concern.

## What this deliberately does NOT solve (separate work)

- **Total DB load** — a worker still eventually runs the same
  queries against the same tables; this doesn't reduce *what* work exists,
  only removes the "agent times out because DB is busy" failure mode. Pair
  with the set-based upsert (already drafted) and eventually delta sync
  (see `SCALE_TO_1000_BRANCHES_ROADMAP.md`) to reduce the actual query cost/
  volume the worker has to churn through.
- **DB capacity itself** — if the worker's sustainable throughput is still
  lower than the fleet's total daily data volume, the queue will grow
  without bound over time, not just during a peak window. This design makes
  that condition *visible* (queue depth, oldest-batch age) rather than
  fixing it — infra scaling or the other roadmap levers are still the fix
  for genuine sustained-throughput shortfall, not this.

## Open questions before implementation starts

1. ~~Where does the worker run?~~ **RESOLVED 2026-07-15**: workspace
   confirmed on Render's Professional plan (via user checking the
   dashboard billing page directly — CLI/API cannot expose this field, see
   MA-002). Professional comfortably covers a Background Worker service —
   this is not a Pro-only feature gate, just needs a paid workspace, which
   this already is. A dedicated Render Background Worker service (separate
   from the web service, same repo/deploy) is the plan: build the queue
   consumer as its own entry point (e.g. `apps/admin-api/src/worker.js`),
   deployed as its own Render service pointing at the same repo/Postgres.
2. Polling loop vs. `LISTEN/NOTIFY` for the worker to wake promptly on new
   batches (polling is simpler and fine to start with given batch counts
   observed so far — low hundreds/day — but worth deciding explicitly
   rather than defaulting silently).
3. No staging database exists yet to test any of this against real
   concurrency before touching production (existing open item in
   MANUAL-ACTIONS.md) — this is a harder blocker for CP4 than it was for
   the smaller fixes so far, since correctness here depends on genuine
   concurrent-worker behavior that can't be verified with a mocked client
   the way `upsertProductBatch()` was.
