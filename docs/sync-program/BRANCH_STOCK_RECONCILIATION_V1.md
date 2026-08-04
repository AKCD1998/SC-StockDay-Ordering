# Branch-stock reconciliation v1

Status: implemented and tested locally on 2026-07-29; not deployed.

This is the first shadow evidence layer required by
`docs/STOCK_RECOMMENDATION_PRODUCT_GOAL_AND_RECONCILIATION_GATE.md`. It does
not change either stock UI, repair data, block an existing stock write, or
make a recommendation eligible yet.

## Contract

The sync agent calculates one manifest from the complete Microsoft SQL stock
extract before CP4 divides it into HTTP batches. The canonical contract is
`branch-stock-v1`:

- product code is trimmed;
- quantity is rounded to four decimal places and represented as a scaled
  integer;
- rows are sorted by product code with an ordinal comparison;
- SHA-256 consumes one UTF-8 line per row:
  `JSON.stringify(productCode) + TAB + scaledQuantity + LF`;
- the manifest also records row count, unique/duplicate product counts,
  scaled quantity sum, negative-stock count, and the minimum/maximum extract
  timestamp.

The agent and backend have separate implementations with one shared golden
vector. A disagreement therefore fails reconciliation rather than allowing
one implementation to certify itself.

## Durable lifecycle

Migration 067 adds `ingest.branch_stock_reconciliations`, keyed by
`sync_run_id`. Its state machine is:

`pending -> processing -> pass|fail`

Processing errors use bounded retries:

`processing -> retry_wait -> processing -> dead_letter`

The existing sync worker claims rows with `FOR UPDATE SKIP LOCKED`. A
processing lease is reaped after the existing worker lease window, and
terminal evidence is retained for 90 days by default. The v2 status endpoint
surfaces reconciliation status, attempts, last error, timestamps, and bounded
mismatch evidence, so an absent or stopped worker cannot be represented as a
reconciliation pass.

A pending reconciliation whose source sync failed is terminalized instead of
remaining claimable forever. A source sync that never becomes eligible is
terminalized after the existing seven-day abandoned-handoff window. An
unfinished v1 run does not block a newer branch generation merely because it
registered shadow evidence before crashing.

## CP4 / hybrid-v2 evidence

Finalize validates and stores the agent manifest in the same transaction that
queues the stock batches. Reconciliation becomes claimable only after the
sync run reaches `apply_status='applied'`.

The worker then uses one `REPEATABLE READ READ ONLY` transaction to read:

1. the immutable CP4 batch payloads;
2. `ada.branch_stock_current` for the branch;
3. the branch columns in `ada.branch_stock_snapshots`.

It independently derives all three manifests, compares agent-to-payload,
payload-to-normalized, and normalized-to-wide, and stores at most 20
per-product mismatch examples. It never writes either stock table.

Runs for the same branch are applied in run order while an earlier
reconciliation is pending, processing, or waiting to retry. Different
branches remain independent. This avoids comparing generation N after
generation N+1 has already overwritten the current-state rows.

## Legacy v1 evidence

The v1 agent registers its manifest only after all synchronous stock batches
have committed. The job waits until the corresponding v1 run is marked
successful, then compares the source manifest with normalized and wide
current state.

V1 does not retain the complete submitted stock payload in
`ingest.sync_batches`. Therefore it can prove digest equality but cannot
produce source-side per-SKU mismatch examples. It still produces bounded
normalized-versus-wide examples. A failed registration emits a structured,
payload-free warning and leaves the existing stock sync successful because
this phase is shadow-only.

## Interpretation

- `pass`: all comparisons available for that ingestion mode agree.
- `fail`: evidence disagrees; stock is not changed or repaired.
- `pending`, `processing`, `retry_wait`: no verdict exists yet.
- `dead_letter`: reconciliation itself repeatedly errored.
- no row: no reconciliation evidence was registered for that sync run.

No status currently changes `#/branch-stock`,
`#/stock-recommendations`, or suggestion eligibility. A later gate must treat
anything except an accepted `pass` generation as ineligible; that cutover is
not part of reconciliation v1.

## Verification

From `SC-StockDay-Ordering`:

```powershell
cd apps/adapos-sync
npm test
```

From sibling repo `PaaSRTSM-project`:

```powershell
npm test
$env:CP4_TEST_DATABASE_URL = '<throwaway PostgreSQL URL>'
node --test tests/cp4_postgres_integration.test.js
```

The real-PostgreSQL case named `finalize creates durable evidence and worker
reaches reconciliation PASS` exercises the complete v2 path. A production
deployment, shadow observation window, freshness threshold, and recommendation
eligibility gate still require separate human authorization and evidence.
