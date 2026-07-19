# CP4 Baseline — 2026-07-19 (pre-CP4, v1 sync only)

Captured before CP4 (queue + worker, see `CP4_ASYNC_INGESTION_DESIGN.md`) is
wired into any agent. Purpose: a real, same-day comparison point for
tomorrow's numbers once CP4 is live for at least one branch — "did this
actually help" needs a baseline, not a memory of what "usually" happens.

Today's 08:20 window was otherwise a normal day (per the user: "การ sync ก็
ไม่มีปัญหาอะไรด้วย") aside from the already-documented, separately-tracked
branch 003 stray pre-schedule failures (see the dated entry lower in
`STATE.md` — a different machine on branch 003's network, not the real sync,
not counted here).

## Run-level durations (`ingest.sync_runs`, real 08:20 scheduled runs only)

| branch | sync_run_id | started (ICT) | duration | records_read | records_sent |
|---|---|---|---|---|---|
| 000 | 1749 | 08:20:21 | 760.5s (12m41s) | 16,480 | 16,151 |
| 001 | 1751 | 08:20:27 | 797.5s (13m18s) | 16,411 | 16,411 |
| 003 | 1748 | 08:20:05 | 755.5s (12m36s) | 15,487 | 15,487 |
| 004 | 1750 | 08:20:09 | 806.6s (13m27s) | 18,369 | 18,369 |
| 005 | 1747 | 08:15:07 | 163.5s (2m44s) | 11,306 | 17,895 |

000/001/003/004 all landed in the same ~13-minute range, all starting within
~20 seconds of each other (the shared 08:20 Task Scheduler trigger) — this
is the contended window CP4 targets. 005's run is a different shape (started
earlier, much shorter) — worth treating separately rather than averaging in,
possibly a different dataset scope or schedule for that branch.

**All 4 succeeded today** — no timeouts in this window. This baseline is
capturing normal-day cost, not a failure, which is exactly what's needed to
tell "CP4 made a working thing faster" apart from "CP4 fixed a thing that
was broken anyway."

## Per-dataset breakdown — incomplete, known gap

Only `sales-summary` shows up in `ingest.sync_run_datasets` for these runs
(5 chunk calls, ~3s each, 08:20:05-08:20:28). This is a known, already
-documented gap (`STATE.md`): the CP2 per-dataset logging middleware only
covers routes under `/api/sync` (this file's router) — `/api/sync/ada/*`
(transfers, sales_detail, approved_receipts, pending_receipts,
stock-snapshot) and `/api/branch-stock/sync` are on separate routers without
it. Those datasets almost certainly account for most of each run's ~13
minutes, but there's no structured per-dataset timing for them yet — only
the run-level total above.

## DB CPU during the window (Render metrics API, `basic_256mb` plan = 0.1 CPU cap)

Pulled `dpg-d6apu9i4d50c73c7sas0-a` CPU metric, 08:14-08:34 ICT (01:14-01:34
UTC):

```
08:20  0.008   <- just before the 4 runs' queries ramp up
08:21  0.076
08:22  0.098
08:23  0.100   <- at cap
08:24  0.097
08:25  0.095
08:26  0.100   <- at cap
08:27  0.078
08:28  0.100   <- at cap
08:29  0.100   <- at cap
08:30  0.093
08:31  0.100   <- at cap
08:32  0.089
08:33  0.100   <- at cap
08:34  0.090
```

**DB CPU is pinned at or near its 0.1-CPU cap for essentially the entire
08:21-08:34 window** — the same saturation pattern first found on
2026-07-14/15 is still present today, after CP3.1 (set-based product
upsert) shipped but before CP4. This is the direct, current-day evidence
that CP4's premise (DB compute-bound during the shared window, not just
lock contention or oversized requests) still holds.

## What "success" looks like tomorrow, concretely

Once CP4 is live for at least one branch (canary), compare against this
same 08:20 window:

- **Run duration** for the canary branch should drop sharply — its agent's
  job becomes "hand off batches" (should take seconds, not ~13 minutes),
  with `apply_status` catching up asynchronously afterward. `agent_status`
  (today's `status`) finishing fast is the visible win; `apply_status`
  reaching `applied` some time after is expected and fine, per the design
  doc's status model — the two are not supposed to look the same.
- **DB CPU during 08:20-08:34** should NOT be conclusively different yet
  with only one canary branch — the worker still runs the same queries
  against the same DB, just spread over a longer wall-clock window instead
  of a scheduled burst. A real CPU-shape change is a multi-branch,
  post-rollout comparison, not a canary-day one. Don't over-read a flat CPU
  chart on canary day as "didn't work."
- **The 3 branches still on v1** should look identical to this baseline
  (unaffected, as designed — v1 stays live unmodified).
