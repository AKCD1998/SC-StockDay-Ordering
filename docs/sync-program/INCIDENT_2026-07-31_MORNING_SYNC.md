# Incident — 2026-07-31 morning sync: database saturation, API restart, duplicate branch-003 sender

**Status at the end of read-only observation (08:51 ICT): active sync incident;
the API had recovered, but no branch had a successful run for 31 July. No
deploy, restart, database write, environment change, branch-PC action, or code
change was performed during this investigation.**

This report is mandatory context for future work involving AdaPOS sync,
branch stock, CP4, reconciliation, stock recommendations, or the sync-status
dashboard. Read it together with:

- `STATE.md`
- `DECISIONS.md`
- `BRANCH_MACHINE_IDENTITY_REGISTRY.md`
- `INCIDENT_2026-07-24_MORNING_SYNC_HOURGLASS.md`
- `PRODUCTION_SYNC_INCIDENT_OBSERVATION_RUNBOOK.md`
- `../ARCHITECTURE.md`

All times below are Asia/Bangkok (ICT, UTC+7).

## Executive summary

The screenshot was not only a display problem. Production had three related
but distinct failures:

1. The 08:20 simultaneous sync burst saturated the Render Postgres instance.
   Database CPU was at least 90% of its 0.1-vCPU limit for 13 sampled minutes
   between 08:17 and 08:31, reaching 100% at 08:24, 08:26, 08:28, and
   08:30. Active connections reached 10 at 08:23–08:25 and 13 at 08:29.
2. At 08:25:44, a `/api/sync/ada/sales` request could not obtain a connection
   from the API's 10-connection pool within 15 seconds. The deployed route
   awaits `db.connect()` outside its `try/catch`; the rejected promise escaped
   the Express 4 handler, terminated Node, and Render restarted the web
   service at 08:25:46.
3. Branch `003` has a second sender, known since the 19 July investigation
   as a retired notebook on the same branch LAN. Heartbeats now identify that
   sender as `DESKTOP-8641S4P`, separate from the official `POSSRV` sender.
   Since at least 19 July it has uploaded most non-stock datasets, then failed
   branch stock because it does not supply a valid top-level `branchCode`.
   Its extra full runs and retries added substantial database work immediately
   before and during the normal 08:20 fleet burst.

Branch `004` did use hybrid-v2 mode, but it timed out while posting the
ordinary `products` dataset, before it staged any CP4 branch-stock batch. The
CP4 worker stayed alive and emitted one heartbeat per minute; it had zero
batches to process. Therefore this incident is not evidence that the worker
apply logic failed. It is evidence that CP4 currently protects only the
branch-stock handoff/apply phase and cannot help when an earlier synchronous
dataset saturates or times out.

The recent local reconciliation/retirement/fencing work was not deployed and
cannot be the runtime cause. The live backend commit was
`ed09105387aa943743860645101b215a098ab8b0`; its changes since the 24 July
incident fix do not include the sync routes or worker. No
`/api/admin/stock-recommendations` request appears in the failure window.

## What the dashboard symbols meant

At 08:51, production `ingest.sync_runs` contained three failed rows, four
still-running rows, and zero successful rows for the day:

| Dashboard branch | Run evidence | Why the cell looked that way |
|---|---|---|
| `000` | Run `1877`, v1, started 08:20:26, still `running` | ⏳ because its terminal `/run-log` did not survive the API failure |
| `001` | Run `1878`, v1, started 08:20:33, still `running` | ⏳ for the same reason |
| `003` | Stale-sender runs `1873` and `1879` failed; expected-sender run `1875` remained `running` | ❌ because the daily rollup gives any failure priority over running |
| `004` | Run `1876`, hybrid-v2, failed at 08:23:46 in `products` handoff | ❌ is a real terminal failure |
| `005` | Run `1874`, v1, started 08:20:07, still `running` | ⏳ because its terminal `/run-log` received 502 |

The deployed daily-rollup order is `success`, then `failed`, then `running`,
then `stale`. Consequently, branch `003`'s red X hides a simultaneous
orphaned running run. The UI is accurately representing its aggregation rule,
but one icon cannot communicate all of the day's overlapping outcomes.

## Timeline

| Time | Evidence |
|---|---|
| 08:15:37 | `DESKTOP-8641S4P` reported a branch-003 `startup` heartbeat. |
| 08:15:55 | Branch-003 stale-sender run `1873` started without a valid `branch_code`. |
| 08:17–08:18 | Database CPU rose to 96.5% and 90.2% of the 0.1-vCPU limit while the extra branch-003 run was active. |
| 08:18:15 | Run `1873` failed after reading 17,393 and reporting 10,768 sent records: `branchCode must be one of 000, 001, 002, 003, 004, 005.` |
| 08:20:01–08:20:33 | The five expected branch senders started within the required simultaneous window; runs `1874`–`1878` were created for `005`, `003`, `004`, `000`, and `001`. |
| 08:21–08:31 | Database CPU stayed at 90–100% for almost every one-minute sample. Request latencies grew from seconds to tens of seconds; one successful sales-summary request took 102.9 seconds. |
| 08:23:46 | Branch `004` run `1876` failed with `Request timed out after 60000ms: .../api/sync/products`. It had staged zero CP4 batches. |
| 08:23–08:25 | Branches `000` and `005` received several HTTP 200 responses from `/api/branch-stock/sync`; other requests were still in flight. |
| 08:25:43 | First visible pool-acquisition error: `timeout exceeded when trying to connect`. |
| 08:25:44 | `/api/sync/ada/sales` hit the same connection timeout at deployed `sync-ada.js:2065`; Node exited. Sync requests and their `/run-log` failure reports received 502. |
| 08:25:46 | Render logged `Instance ... restarted`. |
| 08:25:53 | API process was listening again. |
| 08:27:48 | The stale branch-003 sender began another run, `1879`, while the database was still near its CPU limit. |
| 08:28:24–08:28:35 | The restarted API continued to report 15-second pool timeouts for unrelated UI reads, showing that restart did not remove database pressure. |
| 08:31:13 | Stale-sender run `1879` failed with the same invalid-`branchCode` response. |
| 08:32 onward | Database CPU and request latency returned toward normal; no further application error was visible through 08:51. |
| 08:51:31 | Read-only production query: `failed=3`, `running=4`, `success=0` for today's runs. |

## Confirmed root cause and contributors

### 1. Primary capacity failure: database CPU and pool saturation

The database plan is `basic_256mb`, limited to 0.1 CPU and 256 MiB memory.
During this incident:

- CPU reached the 0.1-CPU limit four times and was at least 90% for 13
  one-minute samples.
- memory peaked at 240,218,110 bytes (about 89.5% of the limit);
- active connections reached 10 during the crash window and 13 during the
  post-restart retry load.

The API pool is configured with `max: 10` and
`connectionTimeoutMillis: 15_000` in deployed `apps/admin-api/src/db.js`
lines 22–23. The observed errors and 15,005–15,008 ms HTTP 500 responses
match that timeout exactly.

This is a recurrence of the 24 July capacity pattern, with a larger observed
connection count and the previously documented duplicate sender adding work.
Simultaneous branch scheduling remains a product requirement; staggering the
normal branch schedules is not an acceptable fix.

### 2. Confirmed process-crash mechanism

At deployed commit `ed091053`, `apps/admin-api/src/routes/sync-ada.js:2065`
does this before entering its `try` block:

```js
const client = await db.connect();
let released = false;
try {
```

When the pool timed out, that rejected promise escaped the handler and Node
exited. Render's restart was a consequence, not an independent platform
failure. Other routes returned ordinary 500 errors for the same pool
condition; this route converted the condition into a whole-process outage.

This code predates the post-24-July feature commits. The 24 July fix released
the sales connection before the CRM mirror call, but it did not move the
connection acquisition itself under error handling.

### 3. Duplicate/stale branch-003 sender

This sender was not first discovered on 31 July. `STATE.md` records the same
pre-schedule malformed branch-003 traffic on 19 July, when Render request logs
and a clean diagnostic of the official `POSSRV` machine established that a
second device behind the same branch NAT was responsible. Operational history
identified it as a retired notebook that had never been decommissioned.
The new evidence on 31 July links that known second-device pattern to
heartbeat hostname `DESKTOP-8641S4P`.

Read-only heartbeat and run-history evidence distinguishes two concurrent
Windows sender identities. It does not by itself prove that they are two
physical hardware devices; that requires UUID/BIOS fingerprints:

- expected sender: `POSSRV`, self-update heartbeat at 08:20 and commit
  `f1c88e5`; today's run `1875` stored `branch_code='003'`;
- additional sender: `DESKTOP-8641S4P`, `startup` heartbeat before the normal
  window; its runs store `sync_type='adapos_branch_003'` but
  `branch_code IS NULL`, then receive the same branch-stock HTTP 400.

The additional sender is not a one-off:

- it reported startup on every day from 26 through 31 July;
- it produced 2–3 failed runs per morning on 26–30 July;
- every completed attempt after the first network failure reached the same
  invalid-`branchCode` terminal error;
- the expected 08:20 `POSSRV` run still succeeded on 26–30 July, which hid
  those failures because the dashboard gives success the highest priority.

Later target-side read-only collection confirmed the mechanism. The Dell
laptop has a daily 22:00 Task named `AdaPOS Nightly Sync (Branch 003)` with
`StartWhenAvailable=True`; after its 08:05 boot, the missed Task ran at
08:15:30. Its old `sync-and-shutdown.ps1 -Branch 003` wrapper sends the
`startup` heartbeat, runs `node src/index.js --execute --branch=003` up to
three times with 120-second waits, and schedules shutdown after completion or
exhaustion. Its `.env` has a valid branch-003 value, API/token presence, and
POSSRV reference, while checkout commit `ee58bfd` predates the official
POSSRV commit. This mechanism matches the production heartbeat/retry/shutdown
sequence. The Task file and wrapper were hashed; no containment change has
yet been made at the time of that collection.

After fresh explicit human authorization later on 31 July, the operator ran
an exact hostname/action/branch-gated Disable command on the laptop. The Task
reported `Ready` immediately before the command and `Disabled` with
`Settings.Enabled=False` immediately afterward. It was disabled, not deleted.
No action was issued against the official `POSSRV` sender or the unrelated
`AdaDateFix` watchdog.

Do not override the device gate merely because an on-site machine reports
hostname `POSSRV`: `POSSRV` is the official branch-003 sender and the same
generic hostname is also used at other branches. Hardware and task identity
must follow `BRANCH_MACHINE_IDENTITY_REGISTRY.md`.

### 4. Branch 004 failed before CP4 could help

Run `1876` is `ingestion_mode='hybrid_v2'`, but has:

- `failure_stage='handoff'`;
- `handoff_status='failed'`;
- `apply_status='failed'`;
- `total_batches=0`.

The worker emitted uninterrupted heartbeats and no non-heartbeat event. The
incident therefore occurred before queue registration. The live worker
deployment is the older `e2fb168` commit; Render redeployed that same commit
on 30 July. None of the local migrations 066–069 or the later retirement,
reconciliation, or fencing changes were live.

### 5. Dashboard reads were concurrent pressure, not the initiating cause

At about 08:25:27, an admin page opened at least four visible sales-target
progress reads plus focus-product and stock-day reads. They waited behind the
already saturated pool and ended as 500/502 around the restart. They may have
influenced the exact instant at which the pool ran out of wait capacity, but:

- branch `004` had already timed out at 08:23:46;
- database CPU had already been 90–100% for several minutes;
- no stock-recommendations endpoint was called;
- the only deployed sales-target code change since 24 July changes a
  remaining-days arithmetic expression, not its queries.

It would therefore be incorrect to label the new stock-recommendations
feature as the cause from this evidence.

## Data impact

### Confirmed

- No CP4 batch from branch `004` was staged or applied.
- Branches `001`, expected-sender `003`, and `004` did not reach a successful
  branch-stock upload in their morning run.
- Branch `000` received 16 HTTP 200 responses from
  `/api/branch-stock/sync` before two 502 responses.
- Branch `005` received 15 HTTP 200 responses from the same endpoint before
  two 502 responses.
- Each deployed v1 endpoint request opens a transaction and returns 200 only
  after `COMMIT` (`branch-stock.js` lines 1185–1203 at the live commit).
  Therefore multiple chunks for `000` and `005` were committed.
- Neither run reached a successful terminal `/run-log`, so the server has no
  complete-generation proof for those partial writes.

### Consequence

Current stock for branches `000` and `005` can be a mixed generation: product
rows in committed chunks reflect this morning, while rows in chunks not
reached before the restart retain the previous value. The Render request log
does not include product payloads, so it cannot identify the exact SKU
boundary or row count safely.

This does **not** prove that any particular quantity visible to staff is
wrong. It proves that today's v1 write path permits partial-catalog
publication and that today's runs exercised that path. A complete rerun is
the only existing operational way to replace that mixed state with one full
source snapshot; no rerun was initiated by this investigation.

The local generation/reconciliation design is intended to make this state
detectable and gate it from recommendations, but it was not deployed and
must not be described as protection that production had today.

## What remains unknown

- The exact per-attempt local stdout/stderr for the confirmed
  `DESKTOP-8641S4P` wrapper; no 31-July log file was present in the searched
  checkout even though Task definition, code, configuration classifications,
  and production timing establish the mechanism.
- The exact SKU set committed for branches `000` and `005`; Render request
  logs deliberately do not contain payload bodies.
- Whether any staff read or acted on a mixed-generation quantity before a
  later full rerun.
- Whether the 08:20 agents wrote useful partial non-stock datasets after
  their run rows became orphaned.

These unknowns must not be silently upgraded into either “no data problem”
or “confirmed wrong stock.”

## Safe recovery and follow-up boundaries

The duplicate-sender containment in item 1 was subsequently authorized and
completed. No stock recovery sync, deploy, database write, or other listed
follow-up was performed by this observation. The remaining actions still
require separate authorization:

1. Completed: disabled—but did not delete—the confirmed
   `\AdaPOS Nightly Sync (Branch 003)` Task on `DESKTOP-8641S4P`; preserved
   the recorded Task/wrapper hashes and left the unrelated AdaDateFix watchdog
   untouched.
2. Run one complete recovery sync for each affected branch after the peak
   has ended, verifying terminal success and, for CP4, applied batch counts.
   Incident recovery reruns do not change the simultaneous normal schedule.
3. Treat `000` and `005` as mixed-generation until their full reruns succeed.
4. Put connection acquisition for sync routes under explicit error handling
   so a saturated pool returns an error without terminating the process.
5. Continue the reconciliation/generation release work, but do not claim it
   fixes synchronous pre-handoff load; CP4 coverage of earlier datasets is a
   separate design decision.
6. Re-check database metrics during the next simultaneous window and retain
   the exact run IDs, worker events, and branch-machine identities.

## Re-runnable read-only evidence

Use the procedure in `PRODUCTION_SYNC_INCIDENT_OBSERVATION_RUNBOOK.md`. The
specific evidence window for this report is:

- web service: `srv-d6c0sd0gjchc73fvup5g`;
- worker: `srv-d9fiumrtqb8s73d6t0u0`;
- Postgres: `dpg-d6apu9i4d50c73c7sas0-a`;
- UTC log/metric window: `2026-07-31T01:10:00Z` through
  `2026-07-31T01:40:00Z`;
- relevant run IDs: `1873`–`1879`.

The production database queries must use Render's read-only query operation.
Never copy a production connection string into the report or run an
unwrapped write-capable SQL client for incident observation.

## Remediation status — local implementation, not deployed (2026-07-31, later same day)

This section is an append-only update from a separate, explicitly authorized
local-remediation task. It does not revise anything recorded above — the
08:51 read-only observation stands as written. This work happened entirely
in a local working tree; no deploy, restart, production DB write, env
change, branch-PC action, or git commit/push was performed as part of it.

**Exact crash mechanism addressed**: item 2 of "Confirmed root cause and
contributors" above — `await db.connect()` at deployed `sync-ada.js:2065`
(and structurally identical sites in `sync.js` and `branch-stock.js`) ran
outside its handler's own `try/catch`. In Express 4, when that promise
rejects (a pg pool acquisition timeout), the rejection escapes the async
route handler as an uncaught exception; Node exits; Render restarts the
process. This was independently reproduced locally before any code was
changed, using the real `createAdaSyncRouter` factory (not a
reimplementation) mounted in a standalone Express app with a `db.connect()`
that rejects the way a pool-acquisition timeout rejects: the child process
exited with the stack trace rooted at `sync-ada.js:2065`, and no HTTP
response was ever sent for the request. The exact escape was reproduced
again afterward as a non-vacuous revert-check (see ledger CLAIM-C-06x for
both runs' exact output).

**Files changed** (all in `PaaSRTSM-project`, local working tree only):
- `apps/admin-api/src/utils/db-acquire.js` (new) — `acquireIngestionDbClient(db, res, routeLabel)`: wraps `await db.connect()` in a `try/catch`; on rejection, logs a safe operational line (route label + error code/message only, no stack, no connection string) and writes one `503 { error: "DB_UNAVAILABLE", message, request_id }` response, then returns `null`. On success it returns the client untouched and never touches `res`.
- `apps/admin-api/src/routes/sync-ada.js` — all 10 `db.connect()` acquisition sites now call the helper and `return` immediately if it yields `null`, before entering the existing `try` block (so `ROLLBACK`/`release()` can never run against a client that was never acquired). Includes the exact incident site (`/sales`), which keeps its existing early-release-before-CRM-mirror behavior (see the 24 July fix, unchanged by this work) — the mirror still only runs after a normal commit+release, never after a `DB_UNAVAILABLE` response.
- `apps/admin-api/src/routes/sync.js` — all 6 acquisition sites (`/products`, `/sales-summary`, `/purchase-summary`, `/v2/batches`, `/v2/runs/:syncRunId/finalize`, `/v1/runs/:syncRunId/reconcile-branch-stock`) converted the same way.
- `apps/admin-api/src/routes/branch-stock.js` — all 4 acquisition sites converted: the three sync-ingestion routes (`/branch-stock/sync`, `/sync/ada/branch-stock`, `/branch-stock/upload`) plus `/admin/taxonomy-match-apply` (an authenticated admin route in the same file with the identical unguarded-`db.connect()` shape; included because it shares the same file, process, and crash mechanism, even though it is not itself sync-ingestion traffic).
- `apps/admin-api/src/routes/db-unavailable.test.js` (new) — 14 tests against the real router factories.

**Coverage across equivalent ingestion routes**: all 20 `await db.connect()` sites found across the three audited files (10 + 6 + 4, matching the counts the authorizing task named) now go through the shared helper; a permanent structural test (`db-unavailable.test.js`, test 8) asserts zero raw `await db.connect()` occurrences remain in any of the three files, so a future new route that reintroduces the old pattern fails CI rather than silently reintroducing the crash.

**Tests**: `apps/admin-api/src/routes/db-unavailable.test.js`, 14/14 passing — exact incident route returns 503 without touching an unacquired client; server serves a normal request immediately after a 503; no process-level `unhandledRejection`; `/products` and `/branch-stock/sync` also return 503; a normal `/sales` request still succeeds; CRM mirror release-before-call/non-fatal/no-double-release behavior is unchanged; the shared `/products` records-handler in `sync-ada.js` is covered; the structural all-sites-use-the-helper assertion; a successful acquisition followed by a downstream query failure still rolls back and releases exactly once; a `DB_UNAVAILABLE` response never reports acceptance counts; a documentary test recording that 503 is outside the sender's `response.ok` range (`SC-StockDay-Ordering/apps/adapos-sync/src/client.js`'s `postJson()` already throws on any non-2xx status — confirmed from source, no sender change made or needed); plus 2 unit tests of the helper itself.

**Revert-check (non-vacuous)**: the guard was reverted twice, in two different ways, both showing the pre-fix escape:
1. `sync-ada.js`'s `/sales` acquisition line was directly reverted to the bare pre-fix shape (`const client = await db.connect();`, no guard) and the permanent test file was run against it under `node --test`. Unlike the pre-fix isolated-process characterization, the process did not exit — the rejection became a process-level unhandled rejection that neither Express nor the test runner routed to a response, and the affected test hung until manually stopped. That is a *worse* outward symptom than a clean crash (no test failure message, no process exit, just a permanently blocked request) but confirms the same underlying escape. The source was restored immediately after, confirmed via `grep` (zero raw sites) and `node -c` (syntax OK) before re-running the full suite.
2. A second, isolated-child-process revert-check left `sync-ada.js` completely untouched and instead monkeypatched the *exported* `acquireIngestionDbClient` function to strip its own `try/catch` (restoring the exact pre-fix control flow while still going through the real route file). Run standalone (not under the test runner), this reproduced the original characterization exactly: process exit code 1, stack trace rooted at `sync-ada.js:2070` (the fixed line), and no HTTP response ever sent.

Both revert-checks were temporary, contained to throwaway scratch files, and removed immediately after use; the real source files were confirmed unmodified (`git status`/`grep`) before re-running the full suites.

**Full suite results**: `PaaSRTSM-project` `npm test` (mocked): 515 tests / 450 pass / 0 fail / 65 skipped, up from a 501/436/0/65 baseline captured before this work (+14, all new, all passing). `SC-StockDay-Ordering` `apps/adapos-sync` `npm test`: 55/55 pass, unchanged (no sender-side change was made). `git diff --check`: exit 0 in both repositories (only pre-existing line-ending advisory warnings on unrelated files).

**What this does not claim**:
- This does not increase database capacity, and it does not make an overloaded sync succeed. A branch whose sync hits `DB_UNAVAILABLE` still needs a rerun, exactly as before.
- This does not change CP4, reconciliation, retirement, migrations, environment configuration, or branch-agent scheduling.
- **Production is not fixed until this is reviewed, merged, deployed, and verified live on Render.** No deploy, Render restart, production DB access/write, env var change, git commit/push/pull/reset, or branch-PC action was performed as part of this work.

**Post-incident operational facts, recorded here without rewriting the original 08:51 observation**: recovery runs `1880`–`1884` subsequently completed successfully for branches `004`, `000`, `005`, `001`, and `003` respectively, and the duplicate branch-003 sender's Scheduled Task was disabled (not deleted) under separate authorization, both as already described earlier in this document. Neither fact means this local remediation is deployed.

### Follow-up (same day) — cross-verification found and fixed one log-sanitization gap

Independent cross-verification (`_ledger` protocol, Codex) found that
`acquireIngestionDbClient`'s server-side log line fell back to a rejected
acquisition's raw `error.message` whenever `error.code` was absent — and a
pg connection error's message text can itself embed the connection target,
so a code-less rejection could write credential/connection-string-shaped
content to Render logs even though the HTTP response stayed sanitized. This
did not affect the HTTP response contract, process survival, or any of the
14 tests already recorded above — all of those held under adversarial
re-verification. Fixed by replacing the `error.code`-or-`error.message`
fallback with an allowlisted classification (`error.code` only if it
matches a short alphanumeric/underscore shape; a fixed constant
`NO_SAFE_ERROR_CODE` otherwise) — `error.message` is no longer read
anywhere in the logging path. Two new tests added (14 → 16 in
`db-unavailable.test.js`), including a direct reproduction of the
cross-verifier's exact synthetic sentinel with `console.error` captured;
non-vacuously proven by reverting to the old fallback and confirming the
new test fails with the leaked sentinel, then restoring. Full suite:
517/452/0/65 (+2 from the prior 515/450/0/65). Exact claims:
`_ledger/claude.md` CLAIM-C-065 (fix) and `_ledger/codex.md` CLAIM-X-070
(the original finding). This remains local-only, not deployed.

## Required prevention program after duplicate-sender containment

Recorded by human direction on 2026-07-31 after the duplicate branch-003
sender was disabled and the immediate recovery was completed. Disabling that
sender contains the known duplicate, but the following four workstreams are
still required to prevent a recurrence of the same incident pattern:

1. **Authorized Sender Enforcement**
   - Give every branch machine a unique sender identity and credential.
   - The server must accept sync traffic only from a sender registered for the
     claimed branch.
   - An old, lost, replaced, or duplicate sender must be revocable without
     affecting the authorized machine for that branch.

2. **Prevent API termination when the database pool is exhausted**
   - Put sync-route `db.connect()` acquisition under explicit error handling.
   - A temporary inability to acquire a database connection must return HTTP
     503 rather than allow a rejected promise to terminate the Node process.
   - This protects process availability; it does not increase database
     capacity or make an overloaded sync request succeed.

3. **Extend asynchronous queue coverage to work before branch stock**
   - CP4 currently protects only the branch-stock queue/apply stage.
   - Reduce synchronous peak load from earlier heavy datasets such as
     `products`, `sales`, and other pre-branch-stock ingestion.
   - Preserve the simultaneous normal branch schedule required by
     `DECISIONS.md`; schedule staggering is not the remedy.

4. **Generation and reconciliation gate**
   - Prove that each full source snapshot was received completely and matches
     the source dataset before stock is eligible for recommendation
     computation.
   - Do not allow a partial or mixed-generation branch snapshot to produce
     transfer or purchase suggestions.

Required sequence:

1. fix the API crash mechanism;
2. implement authorized-sender enforcement;
3. complete and validate generation/reconciliation;
4. extend queue coverage to the earlier synchronous datasets.

These items are a required prevention roadmap, not a statement that they are
already implemented, deployed, or production-verified. Every implementation
and deployment remains separately human-gated under the cross-verification
protocol.
