---
name: Branch 005 sales reporting + sync context — 2026-07-02
description: "Read-only SQL evidence from Branch 005 proving how historical sales from POS 001 and POS 002 are represented, plus the implementation guardrails for adding a new branch sales-reporting tab and sync dataset across SC-StockDay-Ordering and PaaSRTSM-project."
type: project
originSessionId: codex
---

# Branch 005 Sales Reporting + Sync Context — 2026-07-02

## Why this document exists

We need a new sales-reporting feature for `https://sc-stockday-ordering.onrender.com` that can answer:

- how many units each product sold in a date range
- branch total
- split by POS 001 vs POS 002
- drill-down to bill/date/time/document no/product line
- show products with zero sales as `0`

This document records the Ada-side evidence and the repo architecture constraints before changing sync or backend behavior.

---

## Two-repo architecture that must not be forgotten

The user explicitly asked to read the architecture before touching code. The split is:

### Repo 1: `SC-StockDay-Ordering`

Local path:

`C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering`

This repo contains:

- `apps/admin-web/` — the static SPA deployed at `sc-stockday-ordering.onrender.com`
- `apps/adapos-sync/` — the branch laptop sync agent and launcher scripts

This repo does **not** host the live API.

### Repo 2: `PaaSRTSM-project`

Local path:

`C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project`

This repo contains the real backend:

- `apps/admin-api/`
- Render-hosted PostgreSQL
- raw evidence landing in `ada.*`
- app-facing derived tables in `public.*`, `analytics.*`, `ordering.*`, etc.

### Operational implication

If we add a new branch sales-reporting feature:

- sync extraction changes start in `SC-StockDay-Ordering/apps/adapos-sync/`
- new ingestion endpoints, migrations, and query APIs must land in `PaaSRTSM-project`
- SPA UI changes may be in either repo depending on which admin web is actually serving the page, but the backend is always `PaaSRTSM-project`

Do not confuse `SC-StockDay-Ordering/server/` with the production backend. It is not the live API.

---

## Existing sync flow that currently works

### Launcher chain

Branch operators currently run:

`apps/adapos-sync/RUN-ADAPOS-SYNC.bat`

That file only does launcher work:

1. `cd` into its own folder
2. runs `open-adapos-and-sync.ps1`
3. runs `show-result.ps1`

### Actual one-shot sync

`open-adapos-and-sync.ps1`:

- requires Node at `C:\Program Files\nodejs\node.exe`
- reads `.env`
- resolves `ADAPOS_SYNC_BRANCH_CODE`
- runs:

```powershell
node src/index.js --execute --branch=<branch>
```

- writes logs to `apps/adapos-sync/logs/sync-YYYYMMDD-HHMMSS.log`

### Nightly scheduled wrapper

`sync-and-shutdown.ps1`:

- sends startup heartbeat
- retries the sync up to 3 times
- optionally shuts the PC down after the run

### Current datasets in branch 005 `.env`

Current branch 005 setup includes:

- `products`
- `sales`
- `branch_stock`
- `transfers`
- `transfer_lines`
- `pending_receipts`
- `approved_receipts`

Important: current `sales` means **30-day product summary only**, not bill-level or line-level evidence.

---

## Hard SQL evidence gathered on 2026-07-02

### Access path used

Direct TCP to SQL Server was blocked from this machine, but Named Pipes worked.

Successful read-only connection:

- host target via Tailscale/SMB-reachable machine: `100.106.107.80`
- SQL instance: `DESKTOP-TQ7J8HJ\SQLEXPRESS`
- database: `AdaAcc`
- login: `readonly_pilot`

Connection was made through:

`np:\\100.106.107.80\pipe\MSSQL$SQLEXPRESS\sql\query`

### Product matched for DUOCETZ

Only one live product matched `DUOCETZ` / `ดูโอเซท`:

- `FTPdtCode = IC-002604`
- Thai name: `เภสัช ดูโอเซท 10 เม็ด`
- English name: `MEGA DUOCETZ PARACETAMOL 325 MG TRAMADOL HYDROCHLORIDE 37.5 MG 10 S`
- barcode: `8850769018431`

### Historical sales source that worked for May-June 2026

For two-month historical sales reporting, the reliable table pair was:

- `TPSTSalHD`
- `TPSTSalDT`

The correct filters for real completed sales in this branch window were:

```sql
FTShdDocType = '1'
FTShdStaPaid = '3'
```

Refunds were separate documents:

```sql
FTShdDocType = '9'
FTShdStaPaid = '3'
```

### POS split is preserved in historical sales

`TPSTSalHD` contains `FTPosCode`, which preserved the source POS terminal:

- `FTPosCode = '001'`
- `FTPosCode = '002'`

Document number patterns matched the POS code:

- POS 001 sale docs looked like `S2605005001-...`
- POS 002 sale docs looked like `S2605005002-...`

This is sufficient to split branch 005 historical sales by POS 001 vs POS 002 without querying two different databases.

### Historical bill counts in the requested window

Window queried:

- `2026-05-01` through `2026-06-30`

Completed sale bills only (`doc_type='1'`, `paid='3'`):

- POS 001: `1,206` bills
- POS 002: `3,291` bills
- total: `4,497` bills

Refund docs in the same window:

- POS 001: `11`
- POS 002: `17`

### Product-level aggregate in the requested window

Across the same completed-sale window:

- total product master rows exported: `6,771`
- products with sales: `1,888`
- products with zero sales: `4,883`
- total sold quantity in sale-line unit: `14,561`
- POS 001 quantity: `4,040`
- POS 002 quantity: `10,521`
- total net amount from sale lines: `1,171,248`

### DUOCETZ result in the requested window

`IC-002604` sold:

- total qty: `1`
- POS 001 qty: `1`
- POS 002 qty: `0`
- bill count: `1`
- first/last sale date: `2026-05-10`

Bill detail:

- bill no: `S2605005001-0000171`
- date: `2026-05-10`
- time: `12:53:56`
- unit name: `แผง`
- qty: `1`
- net amount: `135`

---

## Important nuance: `TSHD001/002` still exist, but not as the main historical source

Earlier watcher tracing proved that live cashier writes can land in per-register tables:

- `TSHD001 / TSDT001 / TSRC001`
- `TSHD002 / TSDT002 / TSRC002`

That remains true and matters for real-time workflows.

However, for this two-month historical reporting run on 2026-07-02:

- `TPSTSalHD/DT` already contained the complete historical processed sales split by `FTPosCode`
- `TSHD001/002` had only a small number of rows left:
  - `TSHD001 = 13`
  - `TSHD002 = 18`
  - `TSDT001 = 22`
  - `TSDT002 = 48`

Conclusion:

- use `TSHDxxx/TSDTxxx/TSRCxxx` for near-real-time watcher/claim-token style flows
- use `TPSTSalHD/TPSTSalDT` for historical branch sales reporting unless proven otherwise for a specific branch/version

This is the most important reconciliation between the 2026-06-03 watcher findings and the 2026-07-02 reporting findings.

---

## Files generated from the read-only report run

Generated on this machine outside the repo because shell writes into `X:\SCstockDay` were blocked in this session:

Directory:

`C:\Users\scgro\Desktop\branch005-sales-reports-2026-05-06`

Files:

- `branch005-product-sales-summary-2026-05-01_to_2026-06-30.csv`
- `branch005-sales-bills-2026-05-01_to_2026-06-30.csv`
- `branch005-sales-transaction-lines-2026-05-01_to_2026-06-30.csv`

Meaning:

- `product-sales-summary`: all product codes, including zero-sale rows, with branch total and POS 001/002 split
- `sales-bills`: one row per completed bill
- `sales-transaction-lines`: one row per bill line item

Counts:

- summary rows: `6,771`
- bill rows: `4,497`
- detail rows: `9,681`

---

## What the current sync agent cannot provide yet

The current `sales` dataset in `apps/adapos-sync/src/index.js` calls:

- `getSalesSummaryRows(...)`
- `toSalesRecords(...)`
- POST `/api/sync/sales-summary`

That payload contains only:

- `productCode`
- `branchCode`
- `periodDays`
- `soldQtyBase`
- `avgDailyUsage`

It does **not** carry:

- POS code
- bill no
- bill date
- bill time
- per-line product detail
- zero-sale product rows
- exact source document statuses

So the current sync shape is not sufficient for the requested tab.

---

## Minimum safe implementation direction for the new feature

### Principle

Do not replace the existing `sales-summary` sync.

Add a **new additive dataset** and new backend landing path for detailed branch sales evidence.

### Recommended new sync dataset

Suggested dataset name:

- `sales_detail`

Suggested extraction grain:

- one row per completed sale line in `TPSTSalHD + TPSTSalDT`

Recommended filters:

```sql
FTShdDocType = '1'
FTShdStaPaid = '3'
```

Recommended mandatory fields:

- `branchCode`
- `posCode`
- `billNo`
- `saleDate`
- `saleTime`
- `docType`
- `paidStatus`
- `refundStatus`
- `productCode`
- `productNameThai`
- `barcode`
- `unitCode`
- `unitName`
- `qty`
- `qtyBase`
- `stockFactor`
- `setPrice`
- `netAmount`
- `cashierUserCode`
- `customerCode`
- `sourceTable = TPSTSalHD/TPSTSalDT`

### Backend landing rule

Following `docs/UNIFIED_BACKEND_ARCHITECTURE.md`, raw Ada evidence should land in `ada.*` first.

That means the proper backend work is in `PaaSRTSM-project`:

- migration(s) for raw detailed branch sales evidence if `ada.sales_headers` / `ada.sales_lines` are not already suitable
- ingestion endpoint(s) under `/api/sync/ada/*`
- derivation or query API for the new tab

### UI/reporting rule

For the new tab, the backend should be able to answer both:

1. all products in the date window, including zero-sale rows
2. drill-down rows by bill and product line with POS split

The backend should calculate and return zero-sale products by left-joining product master to the filtered sales evidence. Do not force the SPA to synthesize zero rows client-side.

---

## Non-regression guardrails

These are mandatory if we implement this later.

1. Do not break the launcher chain:
   - `RUN-ADAPOS-SYNC.bat`
   - `open-adapos-and-sync.ps1`
   - `sync-and-shutdown.ps1`

2. Do not change the behavior of existing working datasets unless required:
   - `products`
   - `sales`
   - `branch_stock`
   - `transfers`
   - `transfer_lines`
   - `pending_receipts`
   - `approved_receipts`

3. Do not route new detailed sales directly into app-facing summary tables first. Preserve raw evidence.

4. Do not assume the local branch live-table pattern (`TSHD001/002`) is the right source for historical reporting. For branch 005 on 2026-07-02, it was not.

5. Do not implement this feature in `SC-StockDay-Ordering/server/` and assume production uses it. Production backend is `PaaSRTSM-project`.

6. Keep read-only law on AdaAcc:
   - no `INSERT`
   - no `UPDATE`
   - no `DELETE`
   - no `EXEC`

---

## Practical next implementation steps

1. In `SC-StockDay-Ordering/apps/adapos-sync/`:
   - add detailed sales queries
   - add `sales_detail` transform
   - add batch posting to a new backend endpoint
   - keep `sales-summary` untouched

2. In `PaaSRTSM-project`:
   - add raw ingestion endpoint for detailed branch sales
   - persist raw rows in `ada.*`
   - add reporting endpoint for:
     - all products with totals and zero-sale rows
     - drill-down bill/product rows
     - branch total + POS split

3. In the admin SPA:
   - add a new tab for sold quantities
   - allow date range input
   - allow switching between summary and transaction drill-down

4. After implementation:
   - test against branch 005 first
   - verify a known SKU like `IC-002604` still returns the same single sale on `2026-05-10`

---

## Implementation status in the writable project clones

The following additive implementation work has already been applied in the writable local clones on 2026-07-02.

### `SC-StockDay-Ordering`

Files changed:

- `apps/adapos-sync/src/queries.js`
- `apps/adapos-sync/src/transform.js`
- `apps/adapos-sync/src/index.js`
- `apps/adapos-sync/.env.example`
- `apps/admin-web/src/MovementTransactionsPanel.jsx`
- `apps/admin-web/src/styles.css`

Implemented behavior:

- branch sync still sends the old `sales-summary` dataset
- branch sync now also extracts detailed completed sales from `TPSTSalHD/TPSTSalDT`
- detailed raw sales posting is additive and goes to `/api/sync/ada/sales`
- detailed sales auto-enable when the existing `sales` dataset is enabled, so old branch configs do not need an immediate `.env` rewrite
- the admin SPA now has a new tab for branch-specific sold quantity reporting with:
  - zero-sale product rows
  - POS split
  - bill drill-down by product
  - date-range filtering

### `PaaSRTSM-project`

File changed:

- `apps/admin-api/src/routes/movement-analytics.js`

Implemented behavior:

- `GET /api/admin/branch-product-sales`
- `GET /api/admin/branch-product-sales/:product_code/bills`

These endpoints read from raw `ada.sales_headers` and `ada.sales_lines` so that the report can preserve:

- branch
- POS
- bill no
- date
- time
- product quantity
- amount

### Sanity checks completed

- `node --check apps/admin-api/src/routes/movement-analytics.js` passed
- `npm run build -w apps/admin-web` passed

This means the current writable implementation is at least syntax-clean and frontend-build-clean, even though end-to-end live sync to the Render backend still needs a real branch sync run to populate data.

---

## Short conclusion

For branch 005 historical sales reporting, the key finding is:

`TPSTSalHD/TPSTSalDT` already gives a processed historical view that combines both cashier machines while preserving the source POS in `FTPosCode`.

That means we can build the requested reporting feature without needing separate SQL connections per cashier terminal, but we **cannot** get the required drill-down from the current `sales-summary` sync shape. A new additive detailed-sales sync path is required.
