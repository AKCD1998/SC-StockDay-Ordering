# Manual Actions Required

Items here block CP0 from being marked complete per the program's own gate
("no critical unknown left un-flagged"). None of these can be done by Claude
under the authorization rules — each needs the operator (user) or someone
with physical/dashboard access.

---

## Action ID: MA-001 — Identify branch 000's agent installation — REOPENED 2026-07-15, cleanup done

**Original resolution (2026-07-14)**: found at `Y:\SC-StockDay-Ordering\apps\adapos-sync`
via a mapped network drive. Turned out to be a **red herring path** — that
share actually pointed to a different machine entirely (later determined to
be branch 005/possrv's D: drive, coincidentally also readable as a drive
letter from this session). Real install confirmed 2026-07-15: **local path
`C:\SC-StockDay-Ordering` on the "server" host** (`.env` confirms
`ADAPOS_SYNC_BRANCH_CODE=000`), accessed this time via a session with real
console access on that machine, not a network share — resolves the
drive-letter ambiguity that caused the original misidentification.

**2026-07-15 cleanup, done via a session with real access on that machine**:
- Found 4 uncommitted local modifications: `.env.example` (root),
  `apps/adapos-sync/.env.example`, `apps/adapos-sync/RUN-ADAPOS-SYNC.bat`,
  `apps/adapos-sync/src/index.js`. All confirmed safe to discard — either
  superseded by newer code already on `main`, or (the `.env.example` files)
  actively risky: contained a real-looking token
  (`sAin6bHxBjepr0tZ6984PEZV61ty5AsA`) pasted into a template file meant to
  be safely committable.
  - Checked whether that token is still live: it's present as a
    **commented-out, inactive** line in the real `.env`
    (`apps/adapos-sync/.env:13`) — the active token is different
    (`sc-branch-sync-2026-...`). Lower urgency to rotate since it's not
    currently in use, but still worth rotating/removing at some point since
    it sat in a git-trackable file.
  - All 4 files discarded (`git checkout --`), tree confirmed clean
    afterward (only harmless untracked `.log` files remained).
- `git pull origin main`: fast-forward `ee58bfd9` → `ec65f888` (175 files,
  +53k/-2.9k lines — 6 weeks of work, everything from this whole program).
- Added the 3 new env vars (`ADAPOS_SYNC_PRODUCT_BATCH_SIZE=100`,
  `ADAPOS_SYNC_SALES_DETAIL_CHUNK_DOCS=150`,
  `ADAPOS_SYNC_TRANSFER_CHUNK_DOCS=30`) — all were missing.
- **No sync run performed yet** — deliberately deferred per the user's own
  instruction ("ทำให้มันคลีนก่อน") to separate "get the code right" from
  "prove it actually syncs."

**Still open / not yet answered**: whether branch 000's Scheduled Task is
even healthy — the original finding that its last log (2026-06-26) cut off
mid-sync with no completion/failure line was never explained, and hasn't
been re-checked since the code cleanup. Code being current doesn't by
itself mean scheduled syncs will resume; that needs its own verification
(check Task Scheduler status/history, then an off-peak manual test run
matching the pattern used for 001/003/004/005 earlier this session).

<details><summary>Original request (kept for reference, no longer active)</summary>



**Checkpoint**: CP0
**Target**: whatever machine actually runs the branch-000 (HQ) sync agent
**Why**: no mapped network drive for a branch-000 host was available to this
session (V:/W: mapped drives exist but map to `Default`/`Public` profile
paths with no `RxAuu`/`SCstockDay`/adapos-sync folder found in a first pass —
this was not exhaustively searched). Production shows successful branch-000
runs (16,208 records per the prior report) but the source install, its agent
version, schedule, and `.env` are unverified. This blocks CP1's canary
sequencing (000 is explicitly held back from any product-master-authority
role until its source is confirmed) and blocks the fleet-version inventory
from being complete.
**Requested**: confirm which physical machine / hostname runs the branch 000
task, and either grant this session a mapped drive to it or export
`Get-ScheduledTask` XML + `.env` (redact secrets) + last 5 log files from
`apps/adapos-sync/logs/`.

</details>

## Action ID: MA-002 — Render dashboard: web-service and Postgres resource baseline

**Status: MOSTLY RESOLVED** (2026-07-14, via a separate session's Render MCP,
read-only — see EVIDENCE.md "Render dashboard baseline" for full numbers).

**Key result**: Postgres plan is `basic_256mb` (0.1 CPU / 256 MiB), and it
hit CPU **100%** during the 2026-07-14 08:00-08:40 ICT failure window while
active connections stayed at 2-4 (never near the observed max of 9). Backend
web service (0.5 CPU / 512 MiB, `starter` plan) stayed under 7% CPU the whole
time. **The database is undersized for its query workload; this is now a
confirmed factor, independent of and probably larger than lock contention
alone.** Auto-deploy is confirmed On, tracking `main`, and has been landing
commits correctly (resolves earlier uncertainty about whether fixes were
actually reaching production).

**Still open** (narrower scope than originally written):
- ~~Workspace billing/plan tier~~ **RESOLVED 2026-07-15**: user confirmed via
  Render dashboard billing page — **Professional plan** (~$78.60 projected
  July 2026, note: Render is updating pricing 2026-08-01). Confirmed neither
  the CLI nor MCP can read this field regardless of auth — it's dashboard-
  only. Professional comfortably supports Background Workers / Key Value for
  CP4, no plan upgrade needed.
- Autoscaling min/max configuration (only current instance count, 1, was
  visible; no explicit "autoscaling: off" confirmation)
- PITR retention days (SQL shows `archive_mode=on`, `wal_level=replica`, but
  that doesn't confirm Render's PITR feature specifically or its retention
  window)
- Disk I/O metrics (not exposed by the Render MCP metrics endpoint used)
**Requested**: five-minute look at the Render dashboard's Settings/Billing
page for the above four items only — everything else in the original request
has an answer now.

## Action ID: MA-003 — `pg_locks`/`pg_stat_activity` snapshot during a live 08:20 contention window

**Checkpoint**: CP0 / CP1 (feeds the lock-contention theory used to justify staggering)
**Target**: production Postgres, during tomorrow's (or next) 08:20 sync window
**Why**: the lock-contention explanation for 001/003/004's 2026-07-14 08:20
failures is a high-confidence *inference* from `pg_stat_statements` totals and
timing correlation, not a direct observation. The program's own baseline rule
says not to claim a session blocked another without telemetry.
**Requested**: run this once, live, during the 08:20-08:30 window (read-only,
safe to run from this session if given the go-ahead — flagging as manual only
because it needs to be timed to a live event the operator should be aware is
happening):
```sql
SELECT blocked.pid AS blocked_pid, blocked.query AS blocked_query,
       blocking.pid AS blocking_pid, blocking.query AS blocking_query,
       now() - blocked.query_start AS blocked_duration
FROM pg_stat_activity blocked
JOIN pg_locks bl ON bl.pid = blocked.pid AND NOT bl.granted
JOIN pg_locks kl ON kl.locktype = bl.locktype
  AND kl.database IS NOT DISTINCT FROM bl.database
  AND kl.relation IS NOT DISTINCT FROM bl.relation
  AND kl.granted
JOIN pg_stat_activity blocking ON blocking.pid = kl.pid
WHERE blocked.pid <> blocking.pid;
```
**Success threshold**: any rows returned during the window = contention
confirmed. Zero rows across the whole window = the lock-contention theory
needs to be dropped in favor of "just slow/serial queries" as the primary
cause, and CP1's staggering fix should be re-justified on throughput grounds
alone rather than lock-avoidance grounds.

## Action ID: MA-004 — Confirm `codex/branch-005-transfer-ingestion` branch's status

**Checkpoint**: CP0 (blocks CP1 if it overlaps branch-005 scheduled-task or transfer-sync work)
**Target**: PaaSRTSM-project repo, branch `codex/branch-005-transfer-ingestion`
**Why**: found to exist (locally and on origin) during CP0's repo-state check.
Unexplored. If it's active work-in-progress touching branch 005's sync
pipeline, CP1's plan to touch 005's Scheduled Tasks and agent release needs
to account for it to avoid duplicate/conflicting work.
**Requested**: confirm whether this branch is: (a) abandoned, (b) active
Codex work this program should wait for, or (c) safe to ignore. A one-line
answer is enough to unblock.

## Action ID: MA-005 — Rotate/scope down `ADAPOS_POSTGRESQL_URL` credential

**Checkpoint**: CP0 (flagged, not blocking)
**Target**: `apps/adapos-sync/.env` on branches 001 and 005 (at minimum —
other branches not yet checked for the same variable)
**Why**: a live production Postgres connection string with a real password is
sitting in plaintext on branch laptops that don't need direct DB access (the
sync agent only talks HTTP to the backend). This session used it once,
read-only, to verify a third party's metrics — see DECISIONS.md. That it was
usable at all from a random branch laptop is the finding.
**Requested**: confirm whether this variable is still needed anywhere
(possibly a leftover from an early prototype before the HTTP-based agent
existed); if not, remove it from every branch `.env` and rotate the
`sc_drug_db_user` password.

## Action ID: MA-006 — Task Scheduler XML export before any CP1 Scheduled Task change

**Checkpoint**: CP1 (pre-requisite per the program's own rule: "Export Task
XML before every change")
**Target**: every branch machine whose Scheduled Tasks CP1 will touch (005
duplicate-task cleanup first, per canary order)
**Why**: authorization rules forbid this session from touching Scheduled
Tasks directly. Recording this now so CP1 doesn't start without it queued.
**Requested**: when ready to start CP1, export (`Export-ScheduledTask`) every
AdaPOS-related task on 001/003/004/005/000 before any disable/delete, save
alongside this program's docs folder or hand back to this session to store.

---

## Status

| Action ID | Status | Blocks |
|---|---|---|
| MA-001 | REOPENED — cleanup done, code current | scheduled-task health + first test run still unverified |
| MA-002 | MOSTLY RESOLVED (4 narrow sub-items open) | CP5 capacity claims only now — deploy mechanism question fully resolved |
| MA-003 | OPEN | CP1's stated justification (not the fix itself) |
| MA-004 | OPEN | CP1 branch-005 task work |
| MA-005 | OPEN | none (security hygiene, not a program blocker) |
| MA-006 | OPEN | CP1 start |
