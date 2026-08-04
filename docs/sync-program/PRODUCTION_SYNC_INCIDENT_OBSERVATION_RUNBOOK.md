# Production sync incident observation runbook (read-only)

Use this runbook whenever the sync dashboard shows unexpected ⏳, ❌, ⚠️, or
missing results. It is intentionally an observation procedure, not a
recovery or deployment procedure.

## Mandatory reading

Before opening production logs, read:

1. `../../README.md`
2. `../ARCHITECTURE.md`
3. `STATE.md`
4. `DECISIONS.md`
5. `BRANCH_MACHINE_IDENTITY_REGISTRY.md`
6. the newest `INCIDENT_*.md` file
7. `../../../_ledger/PROTOCOL.md`

The live API is in the sibling `PaaSRTSM-project` repository, not the legacy
SC `server/`.

## Hard boundary

Allowed:

- list/get Render services and deploys;
- read Render application and request logs;
- read Render metrics;
- run SQL only through a tool that enforces a read-only transaction;
- inspect repository files and deployed Git commits;
- write an incident Markdown report after evidence is collected.

Forbidden without fresh, explicit human authorization:

- deploy, restart, rollback, scale, suspend, or resume a service;
- change an environment variable or secret;
- write to production Postgres;
- run a branch Scheduled Task, edit a task, or update a branch checkout;
- mark a run successful/failed manually;
- delete logs, rows, deploys, queues, or temporary evidence;
- infer that a local dirty worktree is deployed.

Never expose connection strings, API keys, cookies, request payload bodies,
or personal identifiers in the report.

## Canonical production resources

Verify these IDs against Render before every investigation; reading is
allowed, changing is not:

| Resource | ID |
|---|---|
| Live PaaSRTSM API web service | `srv-d6c0sd0gjchc73fvup5g` |
| CP4 background worker | `srv-d9fiumrtqb8s73d6t0u0` |
| Live `sc-drug-db` Postgres | `dpg-d6apu9i4d50c73c7sas0-a` |

Render timestamps are UTC. Bangkok time is UTC+7.

## Observation sequence

### 1. Freeze the reported symptom

Record:

- screenshot time and timezone;
- symbol per branch;
- whether the user refreshed the page;
- whether anyone manually started a rerun;
- the earliest known good time.

Do not ask operators to rerun until the initial logs and run rows are
captured; a later success can hide an earlier failure in the daily rollup.

### 2. Verify the deployed state

Read the current deploy for the API and worker:

- deploy ID, commit ID, commit date, branch, and status;
- whether a “new” deploy is actually the same old commit being restarted;
- diff the deployed commit against the last known incident fix.

Never use the local working tree as proof of production behavior.

### 3. Read API logs around the window

Start 10–15 minutes before the scheduled window and continue at least 30
minutes after it. Query separately:

- application logs at warning/error/critical levels;
- all application logs around a crash to retain the stack and restart line;
- request logs for `/api/sync/*` and `/api/branch-stock/*`;
- request logs with status `400`, `500`, and `502`;
- admin reads that overlap the failure window.

Capture timestamp, path, status, response time, request ID, and service
instance. Do not capture request bodies.

Distinguish:

- `400`: the live API intentionally rejected the request; inspect the run's
  terminal message or branch log for the validation reason;
- `500`: the application process answered with an error;
- `502`: Render could not get a valid response, commonly during a process
  crash/restart;
- a 200 on a batched write: that individual transaction may already be
  committed even if the overall run later fails.

### 4. Read worker logs independently

Verify:

- heartbeat continuity;
- `CLAIMED`, `APPLIED`, `RETRY`, `REAPED`, or `DEAD_LETTER` events;
- whether the affected run created any queue row at all.

A healthy heartbeat with no batch event means “worker alive, no work
received,” not “CP4 succeeded.” A failed hybrid run with zero batches failed
before the worker could help.

### 5. Read database metrics

For the same UTC window, collect:

- Postgres CPU usage and CPU limit;
- memory usage and memory limit;
- active connections;
- API CPU/memory and instance count if relevant.

Report values as both absolute numbers and percentage of the plan limit.
Do not diagnose “too many connections” from pool errors alone; high CPU with
few connections and high CPU with a full pool are different incident shapes.

### 6. Correlate durable run state

Use Render's read-only Postgres query operation. A minimal run query is:

```sql
SELECT
  sync_run_id,
  branch_code,
  sync_type,
  ingestion_mode,
  status,
  handoff_status,
  apply_status,
  started_at,
  finished_at,
  records_read,
  records_sent,
  total_batches,
  applied_batches,
  failed_batches,
  failure_stage,
  message
FROM ingest.sync_runs
WHERE started_at >= $incident_start
  AND started_at <  $incident_end
ORDER BY sync_run_id;
```

Then count `ingest.sync_batches` by run and status. For sender identity,
correlate `ingest.laptop_heartbeats` by `branch_code`, `laptop_name`, `event`,
and time. Do not assume that `sync_type='adapos_branch_003'` proves the
validated `branch_code` column is `003`.

### 7. Explain the dashboard separately

Read the deployed `GET /api/sync/nightly-log` query. At the time of the 31
July incident its daily priority was:

1. any success → success;
2. else any failure → failed;
3. else recent running → running;
4. else old running → stale.

One symbol can therefore hide overlapping rows. Always report the underlying
run IDs and statuses, not only the icon.

### 8. Assess partial publication

For every batched write endpoint:

- determine whether each request commits independently;
- count successful batches before the first failure;
- identify whether a generation/manifest proves catalog completeness;
- state whether exact affected SKUs are knowable without payload logs.

Use the terms:

- **confirmed complete** only with a successful terminal run plus required
  queue/apply proof;
- **confirmed partial publication** when some independent batch transactions
  committed and the full run did not complete;
- **mixed generation possible/confirmed** according to the deployed write
  contract;
- **unknown SKU boundary** when request logs omit payloads.

Do not convert “no reported wrong quantity” into proof that a partial
generation is correct.

## Report format

Every incident report must include:

- observation cutoff time;
- read-only/no-mutation statement;
- executive summary in plain language;
- timeline in ICT;
- per-branch run table;
- confirmed root cause, contributors, and crash mechanism;
- worker/queue findings;
- data-impact section split into confirmed, inferred, and unknown;
- deployed commits and an explicit local-vs-production comparison;
- re-runnable log window, resource IDs, run IDs, and read-only SQL;
- recovery suggestions clearly labeled as not performed.

If evidence does not identify one root cause, file multiple hypotheses with
the exact observation that would refute each one.

## Recurring lessons

- The simultaneous branch schedule is deliberate and must not be staggered
  as an incident shortcut.
- A worker heartbeat proves only that the process exists.
- Async branch-stock apply does not protect synchronous datasets that run
  before handoff.
- A Render restart can orphan `running` rows because the agent's terminal
  callback receives 502.
- A later daily success can hide earlier failures; preserve run-level
  evidence.
- Duplicate branch senders can look harmless when the expected sender later
  succeeds, while still consuming production database capacity.
- Hostnames such as `POSSRV` are not unique machine identities; use the
  branch machine identity registry before any branch-PC mutation.
- Local reconciliation and fencing code provides no production protection
  until an isolated, verified release is actually deployed.
