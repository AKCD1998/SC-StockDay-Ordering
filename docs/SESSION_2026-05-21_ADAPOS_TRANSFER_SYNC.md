# Session Summary - 2026-05-21 - Mother-PC AdaPOS Sync and Shared Backend Alignment

## Scope

This session aligned the mother-PC `SC-StockDay-Ordering` repo with the shared backend architecture and then validated a real live transfer sync run for branch `005`.

This repo's role in the final architecture:

- source of truth for the real AdaPOS sync agent
- reads AdaAcc from SQL Server
- posts data to the shared backend on Render

Shared backend used in production:

- repo: `AKCD1998/PaaSRTSM-project`
- service URL: `https://paasrtsm-project.onrender.com`

## Problem Statement

There was initial confusion because two different repos existed:

- `SC-StockDay-Ordering`
- `PaaSRTSM-project`

The important conclusion was:

- this repo owns the real sync agent behavior
- the live Render backend belongs to `PaaSRTSM-project`
- therefore mother-PC payload shape had to be validated here, and API compatibility had to be fixed there

## What Was Confirmed in This Repo

### 1. Real transfer payload shape

The real payload builder in this repo uses camelCase transfer payloads, not raw AdaAcc field names.

Relevant files:

- `apps/adapos-sync/src/queries.js`
- `apps/adapos-sync/src/transform.js`
- `apps/adapos-sync/src/index.js`

Real transfer header fields emitted by the agent include:

- `docNo`
- `docType`
- `docDate`
- `tnfDate`
- `branchFrm`
- `branchTo`
- `whFrm`
- `whTo`
- `type`
- `total`
- `vat`
- `grand`
- `deptCode`
- `usrCode`

Real transfer line fields emitted by the agent include:

- `docNo`
- `seqNo`
- `productCode`
- `unitCode`
- `unitName`
- `factor`
- `qty`
- `qtyBase`
- `cost`
- `costIn`
- `net`
- `vat`
- `branchFrm`
- `branchTo`
- `whFrm`
- `whTo`
- `docDate`

This was the critical source-of-truth used to fix backend compatibility in `PaaSRTSM-project`.

## Changes / Cleanup Performed in This Repo

### 1. Agent path cleanup for ADA routes

File:

- `apps/adapos-sync/src/index.js`

During the session, the sync agent flow was cleaned up so it could target ADA-prefixed sync paths directly without fallback chains intended for mixed backends.

### 2. Local server alias work

Files touched during the session:

- `server/src/routes.js`
- `server/src/repositories/postgresRepository.js`
- `server/src/tests/transfers.test.js`
- `server/db/migrations/002_transfers.sql`

This local repo also received compatibility work so its own server implementation stayed coherent with the transfer pipeline and testable in isolation.

Important note:

- this local server is not the shared production backend used by Render
- final production transfer compatibility was proven in `PaaSRTSM-project`

### 3. Git / merge resolution history in this repo

This repo went through local merge cleanup around transfer sync ingestion.

Notable commits seen during the session:

- `e3a8aeb` - merge resolution for transfer sync ingestion
- `e50969a` - add `/api/sync/ada/*` aliases and cross-backend compatibility
- `00d8160` - correct `/api/sync/ada/transfers` alias and harden `PostgresRepository` constructor

These were useful for keeping this repo internally consistent, but they were not the final production backend deploy.

## Production Architecture Decision

The final architecture decision was:

- keep Render pointed at `PaaSRTSM-project`
- do not repoint Render to `SC-StockDay-Ordering`
- use this repo as the mother-PC writer
- use `PaaSRTSM-project` as the shared backend reader/persistence layer

That decision avoided splitting production traffic across two competing backend implementations.

## Live Mother-PC Transfer Sync Run

After the shared backend in `PaaSRTSM-project` was fixed, committed, pushed, and confirmed deployed on commit `eda3289`, the live sync was executed from this repo.

Command run:

```bash
npm run sync:ada-agent -- --execute --branch=005 --datasets=transfers,transfer_lines
```

Observed output summary:

- SQL Server connected OK
- `transfers: 200 rows`
- `transfer_lines: 3294 rows`
- `Total records read: 3494`
- posted `200` transfer headers and `3294` lines
- API accepted all of them
- run completed successfully

Most important production proof:

- `POST /api/sync/ada/transfers` no longer returned 500
- live mother-PC sync succeeded end to end

## Shared Backend Outcome

The shared backend in `PaaSRTSM-project` was then directly verified to have persisted the data.

Direct DB proof from the backend side confirmed:

- `200` live transfer headers
- `3294` live transfer lines
- branch `005` present with real persisted rows

That means the work in this repo successfully produced valid production traffic for the shared backend.

## Operational Conclusion

For this repo, the important session outcome is:

1. the real mother-PC sync agent payload shape is now documented and understood
2. the shared backend was adapted to that real payload
3. the branch `005` live transfer sync completed successfully
4. the posted data was directly proven to persist on the shared backend

## Remaining Follow-up

Not blockers:

- keep using `transfers` or `transfers,transfer_lines` only as supported by the local agent code
- monitor next live runs from this repo
- expand branch coverage beyond `005`
- prepare for the larger stock reset / reconciliation cutover planned in the next weeks

## Open Architecture Question

The team is still unsure which transfer workflow origin is easier and more stable:

1. create outbound in our app, then automate filling/posting into Ada by robotic / AI / RPA means
2. allow staff to create outbound in Ada first, then let our agent detect/capture that Ada command and broadcast/filter it into the correct branch workflow

This decision is intentionally left open.

What remains to evaluate:

- which path is simpler to implement
- which path is more operationally stable
- which path creates less staff burden
- which path gives better auditability and easier recovery when something goes wrong

## Suggested Next Work After This Session

- run the next branch pilots
- add easier operational readback/reporting on the shared backend side
- write a branch operator runbook for:
  - sync command
  - expected success output
  - where to check failures
  - how to verify a branch run landed successfully
