# Transfer Delta production candidate — Tech Lead review packet

Date: 2026-09-23 (ICT)  
Status: **READY FOR TECH LEAD REVIEW — local-only, default OFF**

This packet covers both isolated candidate worktrees. It is not approval to
commit, push, open a PR, merge, migrate, deploy, change Render, or change any
branch-PC configuration or Scheduled Task.

## 1. Baselines and worktrees

| Repository | Candidate worktree | Branch | Locally available `origin/main` |
| --- | --- | --- | --- |
| SC Agent | `C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering.transfer-delta-production-candidate-2026-09-23` | `candidate/transfer-delta-production-2026-09-23` | `bc8b975821c202bdd1f1b7f4c72a0311318daa04` |
| PaaS | `C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project.transfer-delta-production-candidate-2026-09-23` | `candidate/transfer-delta-production-2026-09-23` | `674985ab57a9dd7a21dbcc5b799c4470d04201d0` |

No fetch, pull, or rebase was performed. The SC tracking ref is dated
2026-09-20. The PaaS tracking ref is dated 2026-09-10, so remote freshness is
**UNKNOWN** and a fresh fetch/rebase plus migration-number recheck is mandatory
before any Git/PR decision.

Migration inventory found main ceiling `070`, two separate Reservation
candidates using `071`, and the paused Hourly candidate using `072`.
This candidate therefore uses `073_add_transfer_delta_delivery.sql`. A final
workspace scan found no other local `073`, but the stale PaaS tracking ref makes
this a pre-PR gate rather than a permanent reservation of the number.

## 2. Locked scope and release state

- Dataset: Transfer headers and lines only.
- Active fleet: `000`, `001`, `003`, `004`, `005`; `002` is rejected even if
  accidentally placed in the allowlist.
- Existing `POST /api/sync/ada/transfers` remains unchanged and is the Full
  authoritative/backstop path.
- Agent apply flag defaults OFF: `ADAPOS_DELTA_APPLY_TRANSFERS=false`.
- Receiver flag defaults OFF: `FEATURE_TRANSFER_DELTA_APPLY=false` with an
  empty `TRANSFER_DELTA_BRANCHES` allowlist.
- Hard tombstones have a separate default-OFF receiver gate:
  `FEATURE_TRANSFER_DELTA_HARD_TOMBSTONES=false`.
- This candidate does not change Sales, Stock, Receipts, Products, WP4,
  Reservation, R4, Hourly Dual-Stock, or any Scheduled Task.

## 3. Protocol and state model

### Agent delivery

1. The Agent negotiates `transfer-delta-v1` capability and reads the server's
   checkpoint token, monotonic sequence, and accepted-state hash.
2. Delivery uses a new `transfer-delivery-<branch>.json` state file. The
   observational Transfer Shadow cache is never a delivery baseline.
3. Missing, invalid, stale, or divergent delivery state chooses one Full
   fallback. Feature OFF follows the existing Full path.
4. A changed/new document sends its complete current header and line set.
   Unchanged documents are omitted.
5. The deterministic content hash binds branch, contract, base token, base
   state hash, next state hash, headers, lines, and tombstones. The
   idempotency key is independently recomputed by the receiver and includes
   the base checkpoint token.
6. The local checkpoint advances only after an exact acknowledgement: matching
   idempotency/content/state hashes, a new token, increasing sequence, and
   exact header/line/tombstone counts.
7. A lost acknowledgement, server conflict, invalid acknowledgement, or local
   state-write failure chooses Full fallback. After Full succeeds, an explicit
   rebaseline handshake uses the newly negotiated server checkpoint; local
   state is written only after that acknowledgement.

### Receiver apply

- Capability, Delta apply, and rebaseline endpoints are additive under the
  existing sync router. The legacy Full endpoint contract is untouched.
- One database transaction locks the durable checkpoint, validates replay and
  state order, applies all explicitly supplied documents, records the request,
  and advances checkpoint token/sequence/state hash.
- A document is replaced by business key `(branchCode, docType, docNo)`:
  upsert header, delete only that document's old lines, then insert its full
  line set with one set-based `UNNEST`. The effective line key remains
  `(branchCode, docType, docNo, lineNo, productCode)`.
- Same idempotency key and same current terminal result replays safely. Same
  key with different transition content conflicts. A replay whose response is
  no longer the current checkpoint is rejected instead of regressing a client.
- Stale base token or state hash is rejected deterministically.

### Absence, cancellation, and deletion

- A document leaving the rolling query window is **not** a delete. The managed
  fingerprint set retains it across no-op, Full fallback/rebaseline, and later
  changes to other documents.
- Cancellation/void is a normal explicit document-content/status change and
  uses whole-document replacement.
- The Agent emits no hard tombstones in v1.
- A receiver hard tombstone is rejected unless the separate gate is on and the
  payload contains `source-hard-delete` evidence plus an evidence ID; accepted
  tombstones are audit-recorded.

### State-hash trust boundary

The server verifies the prior accepted state hash and cryptographically binds
the next state hash to the complete transition envelope. The server does not
recompute a global rolling-window fingerprint manifest from its database;
that manifest is declared by the authenticated Agent. Historical server rows
outside the first managed rolling window remain unmanaged and are never
silently deleted. This boundary must remain explicit in canary review.

## 4. Changed files

### SC Agent worktree

- `apps/adapos-sync/.env.example` — documents default-OFF delivery controls.
- `apps/adapos-sync/package.json` — includes the new delivery test in the
  existing test command; no dependency or lockfile change.
- `apps/adapos-sync/src/config.js` — parses apply gate and changed-document
  safety limit.
- `apps/adapos-sync/src/index.js` — negotiates Delta, executes exactly one Full
  fallback when necessary, performs acknowledged rebaseline, and keeps Shadow
  observation independent.
- `apps/adapos-sync/src/delta/transferDeliveryState.js` — separate atomic
  durable local delivery state.
- `apps/adapos-sync/src/delta/transferDeltaDelivery.js` — candidate projection,
  checkpoint/hash/idempotency protocol, exact acknowledgement, and rebaseline.
- `apps/adapos-sync/tests/delta-transfer-delivery.test.js` — delivery,
  disappearance, crash, replay, stale-state, and acknowledgement tests.
- `apps/adapos-sync/tests/delta-transfer-shadow-wiring.test.js` — OFF path,
  Full fallback/rebaseline, successful Delta, and Shadow ordering coverage.

### PaaS worktree

- `apps/admin-api/.env.example` — documents three default-OFF/empty controls.
- `apps/admin-api/src/config.js` — parses receiver, branch allowlist, and
  tombstone gates.
- `apps/admin-api/src/routes/sync-ada.js` — additive capability/apply/rebaseline
  routes; original Full route is not replaced.
- `apps/admin-api/src/services/transferDelta.js` — validation, checkpoint and
  replay protocol, transaction, whole-document set-based replacement, and
  explicit tombstones.
- `apps/admin-api/src/routes/sync-ada-transfer-delta.test.js` — default-OFF,
  inactive-branch, real PostgreSQL, replay/conflict/rollback/replacement,
  projection, and tombstone evidence.
- `migrations/073_add_transfer_delta_delivery.sql` — durable checkpoint,
  request/idempotency, and tombstone-audit tables.

## 5. Test evidence

| Evidence | Result |
| --- | --- |
| SC Transfer Delta + existing Transfer Shadow focused | **35/35 pass** |
| SC Agent full suite | **184/184 pass**, 0 skip, 0 fail |
| PaaS Transfer Delta with disposable real PostgreSQL | **9/9 pass**, 0 skip, 0 fail |
| PaaS full serial suite with real-PG Delta guard enabled | **664 total: 485 pass, 179 skip, 0 fail** |
| Isolated unrelated video-provider timing test | **3/3 pass** |
| Syntax checks | pass for all changed JS entry/service/test modules |
| `git diff --check` | pass in both worktrees; only existing LF/CRLF conversion warnings |
| Added-line secret scan | 0 matching credential/private-key patterns |
| Package-lock drift | none in either worktree |

The first concurrent PaaS full run had one unrelated timing-sensitive video
mock assertion (`processing` had already become `completed`). It passed 3/3 in
isolation and passed in the full serial suite. No video code was changed.

The disposable PostgreSQL 18 evidence used a local-only cluster on port 5554
and database `sc_transfer_delta_test_20260923`. It proved:

- migration `015` bootstrap plus `073` first run and idempotent rerun;
- constraints and durable capability token/sequence/state hash;
- one new document and full current line-set replacement;
- stale-line removal and explicit cancellation/status projection;
- set-based line insert query shape (`UNNEST`, once per changed document);
- duplicate replay, hash/idempotency conflict, stale checkpoint/state, and
  stale historical replay rejection;
- transaction failure leaves no partial document and no checkpoint advance;
- hard tombstone rejection while its separate gate is OFF;
- source-evidenced tombstone plus audit row when explicitly enabled;
- branch `002` remains disabled even if accidentally allowlisted.

The database was dropped, the PostgreSQL process was stopped, port 5554 was
verified closed, the exact validated temporary cluster directory was removed,
and no candidate test process remained.

## 6. Required pre-PR and rollout gates

1. Fetch and rebase both candidates on genuinely current `origin/main`.
2. Recheck migration inventory; rename `073` if current main or another chosen
   candidate owns it.
3. Rerun focused, full Agent, full serial PaaS, and disposable real-PostgreSQL
   evidence after rebase.
4. Obtain separate approval for migration and PaaS deployment while all flags
   remain OFF.
5. Prove capability default-OFF in the deployed environment.
6. Use a separately approved single-branch canary. Keep Full Sync and its
   schedule unchanged throughout acceptance.
7. Define operational monitoring and rollback before enabling any Agent flag.

## 7. Known risks / unknowns

- PaaS remote freshness is unknown because the local tracking ref is dated
  2026-09-10; this candidate must not go directly to PR without rebase review.
- The receiver trusts the authenticated Agent's managed fingerprint manifest;
  it verifies transition binding but does not derive a global fingerprint
  manifest from all database rows.
- The first rebaseline manages only documents visible in the configured source
  window. Older rows remain outside the managed set and are deliberately not
  deleted.
- Hard-delete source evidence integration does not exist in the Agent; the
  separate tombstone feature must stay OFF.
- No production load/latency measurement exists yet for the new endpoints.
  Content Capture predicts high reduction, but canary evidence is still
  required before fleet expansion.

## 8. Mutation declaration

No commit, push, PR, merge, deploy, Render change, production migration,
production database write, branch-PC change, `.env` change, config change,
Scheduled Task change, Manual Sync, or canary activation was performed.
Central ledger, Roadmap Gantt, Hourly Draft PR/branches/worktrees, and all main
worktrees were not edited.

## 9. Rebase and pre-PR revalidation — 2026-09-25

This section is an incremental follow-up; it does not erase the original
2026-09-23 evidence above.

- Fresh fetch confirmed SC `origin/main@bc8b975821c202bdd1f1b7f4c72a0311318daa04`
  and PaaS `origin/main@674985ab57a9dd7a21dbcc5b799c4470d04201d0`.
  Both candidate branches were already at those commits, so both rebases were
  no-ops. Candidate changes were restored from named temporary stashes without
  conflicts; those temporary stashes were dropped.
- Migration inventory after fetch has one candidate file numbered `073` and no
  competing `073` on current main. The pre-existing duplicate migration number
  `020` remains outside this candidate and was not changed.
- Focused Transfer Delta/Shadow suites passed again in both repositories and
  `git diff --check` returned exit 0.
- SC Agent full suite passed **184/184**, 0 skip, 0 fail.
- PaaS full serial suite, with `TRANSFER_DELTA_TEST_DATABASE_URL` pointing only
  to a disposable local PostgreSQL 18 database, returned exit 0. This exercised
  the guarded nine-test real-PostgreSQL Transfer Delta group, including
  migration `015` plus `073` first run/idempotent rerun and the documented
  rollback/replay/checkpoint/tombstone/branch-002 gates.
- The disposable database `sc_transfer_delta_test_20260925` was dropped, its
  PostgreSQL process was stopped, the exact temporary cluster directory was
  deleted, and localhost port `5554` was verified not listening.

Updated verdict: **READY FOR SEPARATE GIT/PR AUTHORIZATION**. This is not an
authorization to commit, push, open a PR, merge, deploy, run a production
migration, enable flags, or start a branch canary.

