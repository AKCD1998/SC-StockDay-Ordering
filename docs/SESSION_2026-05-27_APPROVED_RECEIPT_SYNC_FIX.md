# Session — 2026-05-27 — Approved Receipt Sync Fix (Missed-Day Backfill)

## Root cause

`getTodayApprovedReceiptHeaderRows` and `getTodayApprovedReceiptLineRows` in
`apps/adapos-sync/src/queries.js` filtered with:

```sql
AND CAST(FDXihDocDate AS DATE) = CAST(GETDATE() AS DATE)
```

This means the sync only fetched **today's** approved receipts.
If the sync agent did not run on 2026-05-26 (or ran before staff finished approving
documents that day), those documents were permanently missed — they will never appear
in the "today" window again once the date changes.

The pending-receipt query already uses a 90-day lookback; the approved-receipt query
was inconsistently restricted to one day.

## AdaPOS documents missed on 2026-05-26

13 documents confirmed present in `TACTPiHD` (branch 000, `FTXihStaPrcDoc = '1'`):

```
PR00026-001771  PR00026-001772  PR00026-001773  PR00026-001774
PR00026-001775  PR00026-001776  PR00026-001777  PR00026-001778
PR00026-001779  PR00026-001780  PR00026-001781
PS00026-000231  PS00026-000232
```

All are approved. None reached `ada_approved_receipt_headers` on the web.

## Files changed

| File | What changed |
|---|---|
| `apps/adapos-sync/src/queries.js` | Renamed `getTodayApprovedReceiptHeaderRows` → `getApprovedReceiptHeaderRows` and `getTodayApprovedReceiptLineRows` → `getApprovedReceiptLineRows`. Both now accept `{ lookbackDays, fromDate, toDate }`. Default: last 14 days. |
| `apps/adapos-sync/src/config.js` | Added CLI flags `--date-from`, `--date-to`, `--lookback-days`. Added `syncConfig.approvedReceiptsLookbackDays`, `syncConfig.dateFrom`, `syncConfig.dateTo`. |
| `apps/adapos-sync/src/index.js` | Updated imports to renamed functions. Wires date options through. Improved logging: shows date range in banner and fetch step, lists all doc nos being posted, reports per-doc upserted/failed counts and any failed doc numbers. Approved receipts are now posted one-by-one so a single doc failure does not abort the rest. |

## Backend idempotency (unchanged — already safe)

`server/src/repositories/postgresRepository.js` → `ingestApprovedReceipts`:
- Header: `INSERT ... ON CONFLICT (doc_no) DO UPDATE SET ...`
- Lines: `DELETE FROM ada_approved_receipt_lines WHERE doc_no = $1` then reinsert

Re-syncing the same document multiple times produces no duplicates.

## How to run the normal daily sync (approved_receipts, last 14 days)

```powershell
cd C:\SC-StockDay-Ordering
node apps/adapos-sync/src/index.js --execute --branch=000 --datasets=pending_receipts,approved_receipts
```

The approved receipts query now covers the last 14 days automatically, so any
day that was missed will be caught on the next run.

## How to backfill 2026-05-26 right now

```powershell
cd C:\SC-StockDay-Ordering
node apps/adapos-sync/src/index.js --execute --branch=000 --datasets=approved_receipts --date-from=2026-05-26 --date-to=2026-05-26
```

Expected output:
```
=== AdaPos Sync Agent ===
...
Backfill:      approved_receipts 2026-05-26 → 2026-05-26
SQL Server: connected OK

  approved_receipts date range: 2026-05-26 → 2026-05-26
  approved_receipt_headers: 13 rows
  approved_receipt_lines:   N rows

Posting 13 approved receipt headers, N lines (2026-05-26 → 2026-05-26)...
  Doc nos: PR00026-001771, PR00026-001772, ..., PS00026-000232
  approved-receipts: 13 upserted, 0 failed
Done. 13 records sent to API.
```

## How to dry-run first (safe, no writes)

```powershell
node apps/adapos-sync/src/index.js --dry-run --branch=000 --datasets=approved_receipts --date-from=2026-05-26 --date-to=2026-05-26
```

## Pending receipts flow — unchanged

`pending_receipts` was not affected by this fix. It still uses a 90-day lookback
and `FTXihStaPrcDoc IS NULL`. No changes to that path.
