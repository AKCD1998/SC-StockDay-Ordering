# Roadmap — Scaling to 100-1000 Branches + Fleet Auto-Update

Two related but distinct future-facing problems, both raised in
`docs/SESSION_2026-07-14_SYNC_RESILIENCE_INVESTIGATION.md`:

1. **Can the sync architecture handle 100-1000 branches syncing at once
   without the database falling over?** (today: 4-5 branches already
   saturated a 0.1-CPU Postgres instance)
2. **Can a fleet-wide change (config or code) be pushed to every branch
   machine at once, instead of a human/session coordinating each machine
   individually?** (today: every fix in the 2026-07-14 session required a
   separate prompt-and-verify round trip per branch)

Neither is urgent at the current fleet size (5 branches). Both are cheap to
prepare for now and expensive to retrofit under pressure later — that's the
case for reading this before the fleet grows, not after.

---

## Part 1 — Scaling sync to hundreds/thousands of branches

### The core insight from 2026-07-14

Database load did not scale with *data volume* — it scaled with *branch
count*, because every branch was sending the same full product catalog
independently. Verified empirically: 4 branches' local catalogs were 99.8%
identical (see session log §13). At 1,000 branches, that's not "4x the
data," it's "1,000x the same data" — 999 of every 1,000 product syncs is
pure waste.

**This means: adding CPU/RAM to the database does not fix the scaling
problem, it only moves the ceiling.** Cost grows roughly linearly with
branch count either way; fixing the duplicate-work problem is a one-time
engineering cost that changes the growth curve itself, from linear to flat
(for the product-master piece) or linear-in-actual-changes instead of
linear-in-branch-count (for everything else, via delta sync).

### Status of each lever (what's done, what's not)

| # | Lever | Status | Effect |
|---|---|---|---|
| 1 | Single-writer product master | **DONE** (2026-07-14) | Product-master load is now O(1) in branch count, not O(N) |
| 2 | Set-based upsert (fewer queries/batch) | **DRAFTED, not deployed** (`claude/set-based-product-upsert`) | Makes each branch's *remaining* syncs (stock, sales) cheaper per-request; doesn't reduce total volume |
| 3 | Batch/chunk size mitigation | **DONE** (deployed, all branches) | Bounds transaction size so no single request can outrun a timeout; doesn't reduce total volume |
| 4 | Delta sync (send only what changed) | **NOT STARTED** — see dataset-by-dataset priority below | Turns O(N × full-dataset-size) into O(N × changes-since-last-sync) for the datasets that actually need it |
| 5 | Queue + worker (async ingestion, = CP4) | **BUILT 2026-07-19, tested against real Postgres, NOT deployed** (`PaaSRTSM-project` commit `109f292`) | Decouples "how fast can N branches send requests" from "how fast can the DB process them" — the lever that actually removes the *simultaneity* constraint. See `CP4_ASYNC_INGESTION_DESIGN.md` and `CP4_BASELINE_2026-07-19.md` |
| 6 | Infra scaling (bigger DB, PgBouncer, read replicas, partitioning) | **NOT STARTED**, data-backed option available any time | Buys headroom; should follow 1-5, not substitute for them |

**Decided 2026-07-19**: simultaneous scheduling (all branches at 08:20/19:20)
is a hard product requirement, not something to solve by staggering — see
`DECISIONS.md`. This is *why* lever 5 (CP4) and lever 4 (delta sync) both
matter: CP4 removes the "must all arrive at the same instant" bottleneck,
delta sync removes the "same data re-sent in full, every branch, every day"
bottleneck. They solve different problems (timing vs. volume) and neither
substitutes for the other at high branch counts.

### Recommended order for the next phase (when branch count starts growing meaningfully — say, past 15-20)

**Step A — Delta sync, but only for the datasets that actually need it.**
Not every synced dataset carries the same cost, and "just delta-sync
everything" would be over-building. Priority, from a 2026-07-19 review of
what each dataset actually sends today:

1. **`branch_stock` — highest priority, do this first.** Every branch sends
   its *entire* current stock snapshot (6,500+ products' worth of rows)
   every single sync, with **zero existing mitigation** — no date window, no
   lookback, nothing. This is the single biggest, least-optimized dataset in
   the whole pipeline and the one that scales worst as branch count grows.
   - **Why it's the hard case, technically**: the source table today,
     `TCNMPdt` (AdaAcc's product master), stores stock as a **denormalized
     current-value column** (`FCPdtQtyRet`/`FCPdtQtyNow`) that gets
     overwritten in place on every movement — it carries **no per-row
     timestamp**, confirmed both by AdaAcc's own documented schema
     (`docs/adasoft/project_adapos_edmx_parse.md`,
     `project_adapos_session10_sql_adasmart.md`) and by a comment already in
     `apps/adapos-sync/src/transform.js:223` ("`TCNMPdt.FCPdtQtyRet` itself
     has no per-row timestamp to reuse"). A plain "changed since X" query
     against this table is not possible as-is.
   - **The way in**: AdaAcc has a separate, confirmed-active stock movement
     ledger table, `TCNTPdtStkCard` ("stock card"), which *does* carry a
     real date per row (`FDStkDate`), a document reference (`FTStkDocNo`),
     a movement type (`FTStkType`: 0=POS sale, 1=stock-in, 2=stock-out/
     adjustment, 5=physical count), and a quantity delta (`FCStkQty`). Row
     counts confirmed real and populated per branch (2026-05-18 snapshot):
     001 ≈ 14,900, 003 ≈ 13,700, 004 ≈ 12,800, 005 ≈ 600, 000 ≈ 594,600
     (branch 000 is disproportionately large — worth understanding why
     before assuming its delta volume scales like the others).
   - **What's NOT yet solved, and needs answering before implementation**:
     how to turn "here are the movements since the watermark" back into
     "here is each product's correct current quantity" on the backend side
     — i.e. whether the backend applies deltas cumulatively to its own
     stored quantity (risk: any missed/duplicate movement silently drifts
     the number over time) or whether some periodic full-reconciliation
     pass against `TCNMPdt`'s snapshot is still needed alongside the delta
     stream to self-correct drift. This needs its own design pass, not a
     one-line answer.

2. **`sales_detail`, `sales` (summary), `transfers`/`transfer_lines` —
   lower priority, already partially mitigated.** These already query
   AdaAcc with a bounded time window every sync (`sales_detail`: 7-day
   rolling lookback; `sales`/`transfers`: 30-day `PERIOD_DAYS` window) —
   not a true delta (still re-sends the whole window's data every time,
   not just new rows within it), but it already caps the *worst case* per
   sync regardless of how long the branch has been operating, which
   `branch_stock` does not. Real delta sync here (send only genuinely new
   transactions since the last successful sync) is a legitimate future
   improvement but has much smaller expected payoff than `branch_stock` —
   revisit only after `branch_stock` is done and if it's still needed.

3. **`products` — do not delta-sync, already solved differently.** Single-
   writer (lever 1, done 2026-07-14) already made this O(1) in branch count
   — only branch 004 sends it. Delta sync would still shrink that one
   branch's payload further, but it's not multiplied by branch count, so
   it's not a scaling risk the way `branch_stock` is.

4. **`pending_receipts`, `approved_receipts` — not worth it.** Naturally
   low daily row counts (receiving events don't happen at anywhere near
   `branch_stock`'s row count or frequency) — not a meaningful contributor
   to total sync volume today or at higher branch counts.

Estimated effort for `branch_stock` delta sync specifically: moderate-to-
large — agent-side watermark tracking + a new `TCNTPdtStkCard` query,
*plus* the unresolved drift-correction design question above, which is the
part likely to take longest to get right.

**Step B — Async ingestion (queue + worker).**
Today, `POST /api/sync/*` does the DB work synchronously inside the HTTP
request — the client holds a connection open until the transaction commits,
and the client's timeout is directly coupled to the database's speed. At
1,000 branches hitting the same 5-minute window, that coupling is what
actually crashes things, independent of how much total work there is.

Target shape:
```
Agent -> POST /api/sync/v2/batches -> validate, persist to a staging/queue
          table, respond 202 immediately (<1s, never times out)
                    |
                    v
       Background worker(s) claim jobs (SELECT ... FOR UPDATE SKIP LOCKED),
       process at a controlled concurrency, write results/status
```
This means 1,000 branches syncing "at once" just means a queue with 1,000
items in it — nothing times out, nothing crashes, the worker just works
through the backlog at whatever pace the database can sustainably handle.
Keep `/api/sync/*` (v1) live in parallel until v2 is proven (retry,
duplicate, out-of-order, worker-crash-recovery all need test coverage before
cutover — this was already specified in the master plan adopted 2026-07-14,
see that plan's Phase 4 for the fuller spec if reviving this work).

**Step C — Infra scaling, informed by A and B.**
Only after A and B land does it make sense to ask "how much hardware do we
actually need at N branches" — at that point it's a real capacity-planning
question with real numbers (queue drain rate, worker throughput), not a
guess. Render supports horizontal scaling (up to 100 instances/service) and
managed PgBouncer connection pooling; both are viable at that point. Doing
this step first (just buying a bigger DB now) is the trap — it works until
it doesn't, and the "doesn't" gets more expensive the longer duplicate work
goes unfixed.

### Load-testing discipline (don't skip this)

Before claiming "this handles N branches," actually test it — the master
plan adopted 2026-07-14 specified a load-test ladder (5 → 20 → 50 → 100 →
200 → 500 → 1,000 synthetic branches against a staging environment, stop at
the first SLO violation, record the resource "knee"). No staging database
exists yet (open item, see MANUAL-ACTIONS.md) — that's a prerequisite for
this step, not optional.

---

## Part 2 — Fleet-wide update mechanism ("push an update to every branch at once")

### Why this was painful on 2026-07-14

This session had **no remote code-execution access** to any branch
machine — only SMB file read/write via Tailscale-mapped drives (SSH and
WinRM were both tried early on and failed — no trust relationship, no
domain join). Every fix required: write a detailed prompt, have a *separate*
session running physically on that branch machine execute it (since that
session has real command access this one doesn't), read back and verify the
reported output, repeat per branch. For 4 branches and ~6 distinct changes
across the day, that's a lot of round trips for what should eventually be
one action.

### Two different things people mean by "push an update" — solve them separately

**2a. Config changes** (which datasets to sync, batch sizes, timeouts,
which branch is the product-master writer) — these change often and should
never require touching a machine.

**2b. Code changes** (a bug fix in `apps/adapos-sync/src/*.js`) — these
change less often, carry more risk (a bad deploy can break sync fleet-wide
at once, which is exactly what canary/staged rollout exists to prevent), and
genuinely need the new code to exist on disk on each machine before it can
run.

Conflating these two leads to either over-building (treating a batch-size
tweak like a risky deploy) or under-building (treating a real code change
like a config toggle with no rollback path). Solve 2a first — it's most of
today's pain and is much lower-risk to build.

### 2a — Remote config (recommended next step, low effort/risk)

Move the settings that change often out of each machine's local `.env` and
into something the backend serves. Concretely:

```
GET /api/sync/agent-config?branchCode=004
->  {
      "datasets": ["products","sales","branch_stock", ...],
      "productBatchSize": 100,
      "salesDetailChunkDocs": 150,
      "agentVersion": "2026-07-14.1"   // see 2b
    }
```

Agent behavior: fetch this at the start of `runOnce()`, merge over local
`.env` defaults (local `.env` still wins for anything backend-agnostic like
SQL credentials — this is about *sync behavior* config, not secrets).
Backend behavior: this can start as a literal config file/table the backend
reads, edited via a normal PR + deploy — the win isn't "no deploy needed,"
it's "one edit updates every branch's *next scheduled run*, automatically,
with no per-machine coordination step and no waiting for a human to be at
each keyboard."

This directly would have eliminated the entire "roll out to 001, then 003,
then 004, then 005" coordination overhead from the single-writer change on
2026-07-14 — that whole rollout becomes one row edit + a note in
`docs/sync-program/DECISIONS.md`, effective on each branch's next 08:20/
19:20 run.

Rollback is a config edit, not a deploy. Canary is "set 004's config
differently from everyone else's" — already exactly the single-writer
pattern, just server-driven instead of `.env`-driven.

**Effort**: small — one new read-only backend endpoint, a config source
(even a JSON file checked into the backend repo is fine to start), and a
~15-line change to `apps/adapos-sync/src/config.js` to fetch-and-merge
before the rest of `runOnce()` runs.

### 2b — Agent self-update — **IMPLEMENTED 2026-07-15** (simplified version, ahead of 2a)

Built sooner than originally sequenced here, because the pain of manual
per-branch coordination became acute mid-session (every fix that day needed
a hand-written prompt for a separate session with real exec access on that
specific branch machine, verify-then-pull, report back — repeated per
branch, per fix). `apps/adapos-sync/open-adapos-and-sync.ps1` (the wrapper
every branch's Scheduled Task already calls) now checks `git status` +
compares local `HEAD` to `origin/main` **before every sync run** and
`git pull --ff-only` if behind — see commit `2adff19`. This is simpler than
the "version manifest" design below (no new backend endpoint, just direct
git comparison, since every branch install is already a git checkout) but
covers the same need.

**What this does and doesn't solve**:
- Solves: every fix from now on needs exactly one commit to `main` — no
  more per-branch prompts. Each branch picks it up on its own next
  scheduled run (worst case ~12h lag, next 08:20 or 19:20).
- Does NOT solve: getting *this* capability onto every branch in the first
  place still needs one more round of the old manual-pull process (chicken-
  and-egg — a machine needs the self-update code before it can self-update).
  That's a one-time cost, not a recurring one.
- Fails safe exactly as designed below: dirty tree, wrong branch, or a pull
  failure just skips the update and runs with existing code — never blocks
  the actual sync.
- No canary/staged-rollout mechanism yet — a bad commit to `main` reaches
  every branch on their next run, all at once. Acceptable at 5 branches;
  revisit (add a version-pin/staged-rollout mechanism) before this matters
  at higher branch counts — see the version-manifest design immediately
  below, which is the natural next step if a canary gate becomes necessary.

Original design (superseded in the details above, kept for the version-
manifest/staged-rollout idea which the simpler implementation above doesn't
yet have):

For actual code changes, the "push it like a phone app" mental model maps
to: **the agent checks a version manifest and updates itself before
running**, not a literal central push. Central push (a controller reaching
out to every machine on demand) needs the remote-execution trust
relationship this session explicitly doesn't have and that's real
infrastructure to set up (domain join or WinRM TrustedHosts, PSRemoting
credentials, etc.) — self-update via the machine's *own* existing scheduled
task is far lower-risk and needs none of that.

Target shape, layered on top of 2a's manifest response:

```
Scheduled Task fires (08:20/19:20, as today)
  -> RUN-ADAPOS-SYNC.bat
       -> check agent-config's "agentVersion" field against local version
       -> if stale: git pull (or download a packaged release zip),
          npm install if needed, log the update, THEN proceed to sync
       -> run sync as normal
```

This is deliberately *pull-based on a schedule the machine already has*, not
push-based — no new trust relationship, no new attack surface, and it fails
safe (if the update check fails, e.g. no network, just run with whatever
code is already on disk and log a warning — never block the actual sync on
an update check).

**Staged rollout matters here in a way it didn't for config**: a code update
gone wrong can break sync on every branch simultaneously. Don't ship
"agentVersion: latest" to all branches at once — canary one low-traffic
branch (004 is already the natural candidate, being the product-master and
lowest-traffic storefront) for at least one full day/window cycle before
bumping the version fleet-wide. Keep a rollback path (previous version's
code, or the git commit to revert `agentVersion` to) documented before
shipping the first self-update-capable release.

**Effort**: moderate — needs the version-manifest piece from 2a, a defined
packaging/distribution mechanism for agent code (a packaged zip download is
simpler and more Windows-laptop-friendly than requiring `git` to be
correctly configured on every machine — several branches this session
touched had stale or uncommitted local state, which a plain `git pull`
strategy would keep running into), and real testing of the failure modes
(update check fails, update download fails mid-way, new code fails to
start) before trusting it fleet-wide.

### What NOT to build (yet)

- A literal remote-command-execution system (SSH fleet, WinRM, Ansible-style
  push) — solves a problem 2a/2b already solve more safely, and the trust
  setup itself (domain join, credential distribution to every branch
  laptop) is a bigger security surface than either of the above.
- A general-purpose MDM/fleet-management platform — massive overkill for
  branch POS laptops running one sync agent each. The two mechanisms above
  cover the actual need (config push, code self-update) without building a
  platform.

---

## Suggested trigger points to revisit this doc

- Branch count crosses ~15-20: start Part 1 Step A (delta sync).
- A third distinct fleet-wide config change is needed within a short span
  (pattern: "I have to write another 4 branch-coordination prompts"): build
  Part 2 §2a now, it will have paid for itself already.
- Any plan to onboard branches in bulk (not one at a time): both Step B
  (queue/worker) and §2a/2b should exist first — onboarding N branches at
  once via 2026-07-14's manual coordination pattern does not scale past a
  handful.
