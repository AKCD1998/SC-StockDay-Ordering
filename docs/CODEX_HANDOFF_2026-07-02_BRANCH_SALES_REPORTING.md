# Codex Handoff — Branch Sales Reporting + Detailed Sales Sync
**Date:** 2026-07-02
**Author:** Codex
**Next agent:** Claude

---

## Read this first

There are **two repos** in play and the split matters:

| Repo | Local path | Responsibility |
|------|------------|----------------|
| `SC-StockDay-Ordering` | `C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering` | Admin SPA in `apps/admin-web/` and branch sync agent in `apps/adapos-sync/` |
| `PaaSRTSM-project` | `C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project` | Real backend in `apps/admin-api/`, Render Postgres, raw `ada.*`, analytics routes |

Do **not** put backend work into `SC-StockDay-Ordering/server/`. That is not the production backend.

The user explicitly asked that architecture be understood first. These were read before implementation:

- `SC-StockDay-Ordering/docs/ARCHITECTURE.md`
- `PaaSRTSM-project/docs/UNIFIED_BACKEND_ARCHITECTURE.md`
- `SC-StockDay-Ordering/docs/SYNC_BRANCH_STOCK_CONTEXT.md`
- `SC-StockDay-Ordering/docs/SESSION_2026-06-16_BRANCH_STOCK_FIXES.md`
- `SC-StockDay-Ordering/docs/adasoft/project_adapos_transaction_tracing_2026-06-03.md`
- `PaaSRTSM-project/scripts/README_ada_sync_agent.md`

Also read the current launcher chain:

- `apps/adapos-sync/RUN-ADAPOS-SYNC.bat`
- `apps/adapos-sync/open-adapos-and-sync.ps1`
- `apps/adapos-sync/sync-and-shutdown.ps1`

---

## What the user wanted

The user wants a new report for sold quantities by branch with:

- total sold quantity for the branch
- split by POS 1 vs POS 2
- all products, including products with zero sales
- drilldown to bill/date/time/receipt id and per-bill quantity

The specific business case is branch `005`, especially proving how sales from POS 1 and POS 2 combine historically.

The user also wants the sync path extended so branch laptops can push the raw sales evidence needed by that new report, without breaking the existing working sync behavior.

---

## SQL evidence already proven

Read-only SQL access to branch 005 succeeded through Named Pipes:

- host target: `100.106.107.80`
- instance: `DESKTOP-TQ7J8HJ\SQLEXPRESS`
- database: `AdaAcc`
- login: `readonly_pilot`
- connection path: `np:\\100.106.107.80\pipe\MSSQL$SQLEXPRESS\sql\query`

Historical branch-sales reporting for `2026-05-01` through `2026-06-30` is reliably sourced from:

- `TPSTSalHD`
- `TPSTSalDT`

Correct completed-sale filter:

```sql
FTShdDocType = '1'
FTShdStaPaid = '3'
```

Refund docs are separate:

```sql
FTShdDocType = '9'
FTShdStaPaid = '3'
```

The important finding is that both cashier machines are already combined in `TPSTSalHD/TPSTSalDT`, while `FTPosCode` preserves the source terminal:

- POS001 docs like `S2605005001-...`
- POS002 docs like `S2605005002-...`

This means historical branch reporting does **not** require connecting to two different databases.

### Branch 005 result for the requested window

Completed sale bills:

- POS001: `1,206`
- POS002: `3,291`
- total: `4,497`

All-product sold-quantity summary:

- all products exported: `6,771`
- products with sales: `1,888`
- products without sales: `4,883`
- total sold qty: `14,561`
- POS001 qty: `4,040`
- POS002 qty: `10,521`
- total net amount: `1,171,248`

### DUOCETZ result

Matched SKU:

- `IC-002604`
- Thai: `เภสัช ดูโอเซท 10 เม็ด`
- barcode: `8850769018431`

Result in the same window:

- total qty: `1`
- POS001 qty: `1`
- POS002 qty: `0`
- bill count: `1`
- bill no: `S2605005001-0000171`
- sale date: `2026-05-10`
- sale time: `12:53:56`
- unit: `แผง`
- net amount: `135`

### Important reconciliation with older watcher work

Earlier work correctly proved live cashier writes in:

- `TSHD001/TSDT001/TSRC001`
- `TSHD002/TSDT002/TSRC002`

That still matters for near-real-time watcher/token workflows.

But for this two-month historical report:

- `TPSTSalHD/TPSTSalDT` was the correct source
- `TSHD001/002` only had a tiny residual row count

Do not confuse those two use cases.

---

## Files and reports already created

CSV exports were generated to:

`C:\Users\scgro\Desktop\branch005-sales-reports-2026-05-06`

Files:

- `branch005-product-sales-summary-2026-05-01_to_2026-06-30.csv`
- `branch005-sales-bills-2026-05-01_to_2026-06-30.csv`
- `branch005-sales-transaction-lines-2026-05-01_to_2026-06-30.csv`

Documentation already added:

- `SC-StockDay-Ordering/docs/adasoft/project_branch005_sales_reporting_sync_context_2026-07-02.md`
- updated `SC-StockDay-Ordering/docs/adasoft/MEMORY.md`

---

## Code already changed

### Repo: `SC-StockDay-Ordering`

Changed files:

- `apps/adapos-sync/src/queries.js`
- `apps/adapos-sync/src/transform.js`
- `apps/adapos-sync/src/index.js`
- `apps/adapos-sync/.env.example`
- `apps/admin-web/src/MovementTransactionsPanel.jsx`
- `apps/admin-web/src/styles.css`
- `docs/adasoft/MEMORY.md`
- `docs/adasoft/project_branch005_sales_reporting_sync_context_2026-07-02.md`

What changed in the sync agent:

- Added detailed sales extraction from `TPSTSalHD/TPSTSalDT`
- Added `toSalesDetailPayload(...)`
- Added posting to:

```text
/api/sync/ada/sales
```

- Detailed sales auto-enable when the existing `sales` dataset is enabled
- Existing `sales-summary` behavior was intentionally preserved

Important implementation choice:

- this is **additive**
- no branch `.env` rewrite is required immediately for existing branches because `sales` now implies detailed sales too

What changed in the SPA:

- Existing tabs remain:
  - Summary
  - Sales
  - Transactions
  - Documents
- Added a new tab:
  - `Sold Qty — รายงานสินค้า`

The new tab loads:

- `GET /api/admin/branch-product-sales`
- `GET /api/admin/branch-product-sales/:product_code/bills`

and shows:

- branch-specific sold quantity
- zero-sale products
- POS split
- per-product bill drilldown

### Repo: `PaaSRTSM-project`

Changed file:

- `apps/admin-api/src/routes/movement-analytics.js`

Added endpoints:

- `GET /api/admin/branch-product-sales`
- `GET /api/admin/branch-product-sales/:product_code/bills`

These read from raw:

- `ada.sales_headers`
- `ada.sales_lines`

and filter only completed sale docs using raw payload / paid status.

---

## Validation already done

Passed:

- `node --check C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project\apps\admin-api\src\routes\movement-analytics.js`
- `npm run build -w apps/admin-web` in `SC-StockDay-Ordering`

So the current local changes are syntax-clean and frontend-build-clean.

What was **not** done yet:

- no end-to-end live branch sync run against the changed code
- no deployment to Render yet
- no live verification that `/api/sync/ada/sales` has been populated from a real branch run after these changes

---

## Current local git state

### `SC-StockDay-Ordering`

Expected modified files:

- `apps/adapos-sync/.env.example`
- `apps/adapos-sync/src/index.js`
- `apps/adapos-sync/src/queries.js`
- `apps/adapos-sync/src/transform.js`
- `apps/admin-web/src/MovementTransactionsPanel.jsx`
- `apps/admin-web/src/styles.css`
- `docs/adasoft/MEMORY.md`
- new `docs/adasoft/project_branch005_sales_reporting_sync_context_2026-07-02.md`

There are unrelated untracked docs already in the repo:

- `docs/taxonomy-batch42-43-summary-2026-07-01.md`
- `docs/taxonomy-batch44-summary-2026-07-01.md`
- `docs/taxonomy-batch45-47-summary-2026-07-01.md`

Do not touch those unless the user asks.

### `PaaSRTSM-project`

Expected modified file:

- `apps/admin-api/src/routes/movement-analytics.js`

There are many unrelated untracked `scripts/batch*.sql` files. Ignore them.

---

## Important caveats and implementation notes

### 1. The sync flow must not be broken

The user specifically warned that previous sync changes caused issues.

Preserve:

- `RUN-ADAPOS-SYNC.bat`
- launcher chain
- existing sync datasets
- old `sales-summary` API path

The new detailed sales posting should remain additive.

### 2. Raw-first architecture matters

Per backend architecture, raw Ada evidence should land in `ada.*` first. The new report correctly reads from raw `ada.sales_headers` and `ada.sales_lines`.

Do not replace this with a frontend-only synthetic report or a summary-only table if the user still wants bill/POS drilldown.

### 3. X drive write behavior

During this session, writes were effectively done in the writable local clones under:

- `C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering`
- `C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project`

Do not assume the code was edited directly under `X:\SCstockDay`.

### 4. Possible future refinement

The new branch-product-sales endpoint currently relies on `ada.products` as product master for zero-sale rows. That is consistent with the user's request for all products, but if the real business meaning should be "all orderable products visible to the branch", the source universe may later need refinement.

---

## Recommended next steps for Claude

1. Review both diffs, do not re-implement from scratch.
2. Run an actual branch sync test from the updated `apps/adapos-sync` code.
3. Verify on backend that `ada.sales_headers` and `ada.sales_lines` receive the detailed rows for the chosen date window.
4. Smoke-test these endpoints against real data:
   - `/api/admin/branch-product-sales?branch_code=005&date_from=2026-05-01&date_to=2026-06-30`
   - `/api/admin/branch-product-sales/IC-002604/bills?branch_code=005&date_from=2026-05-01&date_to=2026-06-30`
5. Confirm the endpoint returns:
   - DUOCETZ qty `1`
   - bill `S2605005001-0000171`
   - POS001 only
6. Deploy backend and SPA only after that verification.
7. If the user wants, wire a proper deploy/runbook into docs after live confirmation.

---

## Useful file pointers

### Sync agent

- `SC-StockDay-Ordering/apps/adapos-sync/src/queries.js`
- `SC-StockDay-Ordering/apps/adapos-sync/src/transform.js`
- `SC-StockDay-Ordering/apps/adapos-sync/src/index.js`

### Admin web

- `SC-StockDay-Ordering/apps/admin-web/src/MovementTransactionsPanel.jsx`
- `SC-StockDay-Ordering/apps/admin-web/src/styles.css`

### Backend

- `PaaSRTSM-project/apps/admin-api/src/routes/movement-analytics.js`
- `PaaSRTSM-project/apps/admin-api/src/routes/sync-ada.js`

### Context docs

- `SC-StockDay-Ordering/docs/adasoft/project_branch005_sales_reporting_sync_context_2026-07-02.md`
- `SC-StockDay-Ordering/docs/adasoft/MEMORY.md`

---

## Short conclusion

The hard part is already answered:

- branch 005 historical sales across POS1 and POS2 are already combined in `TPSTSalHD/TPSTSalDT`
- `FTPosCode` preserves the POS split
- the requested report therefore needs raw detailed sales sync, not a second SQL connection

The local implementation for that path is already in place and validated for syntax/build. The next agent should focus on real sync verification, not on rediscovering the architecture or the SQL source tables.
