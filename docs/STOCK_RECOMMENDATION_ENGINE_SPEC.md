# Stock Recommendation Engine Spec

Last updated: 2026-07-13
Status: Draft v1 (Phase 2 read-only engine live; demand data source corrected)
Owners: SC StockDay ordering/admin domains

## Implementation Status Update (2026-07-13)

The read-only engine (`PaaSRTSM-project/apps/admin-api/src/services/stockRecommendations.js`)
was already built per this spec, but two production bugs were found and fixed today:

1. **Priority sort bug**: `priorityScore` was computed from raw `shortageQty`
   regardless of the resolved `action`. Products with no sales in 90 days and a
   *negative* recorded `current_stock` (data-quality artifacts, especially on
   branch `000`, the warehouse, which never sells directly) produced a
   spuriously positive `shortageQty` and floated to the top of the
   `priority_desc` sort even though their action was correctly `NO_ACTION`.
   Fixed: `priorityScore` now derives only from the qty the resolved action
   will actually move (`purchaseQty`/`transferPlanQty`), so it's 0 whenever
   the action is `NO_ACTION`/`NO_PURCHASE_SLOW_MOVING`.

2. **Demand data source bug (much bigger)**: this spec's own "Backend
   Implementation Notes" section (below) already warned *"do not depend on
   `analytics.product_sales_summary_periods` for arbitrary recommendation date
   windows"* — but the shipped implementation used it anyway for both the
   30d and 90d sold-qty windows. In production, that table's `period_days=90`
   bucket is only ever written by `ada.refresh_sales_summary_period_into_analytics()`
   (migration 017), which filters `paid_status IN ('1', ...)`; real paid sales
   use `paid_status='3'` (confirmed against `movement-analytics.js` /
   `focusProducts.js`). That function ran once, on 2026-05-20, and has been
   stale ever since. The only thing still populating the table
   (`adapos_sync`, from the branch senders) only ever pushes `period_days=30`.
   Net effect: `soldQty90d` was `0` for virtually every SKU, `adjustedAdu`
   collapsed to `0`, and ~85% of the catalog was misclassified
   `NO_PURCHASE_SLOW_MOVING` — the engine never recommended a single
   `PURCHASE`/`TRANSFER_IN` action in production. Fixed by adding
   `loadRawSalesAggByBranch()`, which aggregates `sold_qty_30d`/`sold_qty_90d`
   directly from `ada.sales_lines` + `ada.sales_headers` with the correct
   `paid_status='3'` filter (same pattern as `movement-analytics.js`),
   replacing the `analytics.product_sales_summary_periods` dependency
   entirely for this engine. After the fix, a full-catalog snapshot run
   (`npm run derive:stock-recommendations`) went from 0 actionable rows to
   1,626 `TRANSFER_IN` + 804 `TRANSFER_AND_PURCHASE` + 698 `PURCHASE` out of
   ~14,300 branch/product rows.

3. **Nightly refresh scheduled**: `refreshStockRecommendationSnapshots()` now
   runs on a cron inside the admin-api process (`stockRecommendationSchedule.js`,
   using `node-cron`), gated behind `FEATURE_STOCK_RECOMMENDATION_CRON`. See
   `docs/stock-recommendation-performance-implementation.md` for the env vars
   and operational details — this closes the "Render cron/background job for
   periodic refresh" item that doc previously listed as not done.

Full session notes: `docs/SESSION_2026-07-13_STOCK_RECOMMENDATION_DEMAND_FIX.md`
(in `PaaSRTSM-project`).

## Purpose

This document records the intended design for a stock recommendation engine that helps each branch decide:

- do nothing
- request stock from another branch
- purchase more stock
- request some stock from another branch and purchase the remaining shortage

This file is intended to be durable context for future LLM sessions. It favors explicit business rules, formulas, assumptions, API contracts, and UI behavior over prose.

## Business Goal

Current operating observation:

- average stock cover is roughly `115-120 days`
- total inventory cost is roughly `15,000,000 THB`

Target:

- reduce average stock cover to `90 days`
- reduce inventory cost proportionally while keeping enough stock to support branch demand

Simple proportional estimate:

- `15,000,000 x 90 / 115 = 11,739,130 THB`
- `15,000,000 x 90 / 120 = 11,250,000 THB`

Expected reduction range:

- `3.26M - 3.75M THB`

## Problem Statement

Historically, branches could not clearly see stock at other branches, so they often purchased overlapping stock. Now the system already has:

- daily branch stock by product
- sold quantity by branch and product
- stock cost by branch via moving average cost
- incoming purchase receipts / PO visibility

The next step is to convert this data into operational recommendations that are simple for branch staff to use.

## Scope

Phase 1 scope:

- recommend stock action per `product x branch`
- use recent sales, current stock, incoming PO, and cross-branch surplus
- prefer internal branch transfer before new purchase
- keep UX simple enough for branch staff
- support both `order-web` and `admin-web` from one shared backend recommendation engine
- preserve human override instead of forcing the system recommendation as the only valid decision

Out of scope for phase 1:

- true supplier lead time modeling
- expiry-aware allocation
- MOQ or pack-multiple logic
- actual transfer workflow automation
- exact incoming PO allocation matrix per branch

## Source of Truth and Repo Boundaries

Live backend:

- `PaaSRTSM-project/apps/admin-api`

Relevant frontend apps:

- `SC-StockDay-Ordering/apps/admin-web`
- `SC-StockDay-Ordering/apps/order-web`

Important existing sources:

- sold qty routes are in `PaaSRTSM-project/apps/admin-api/src/routes/movement-analytics.js`
- stock quantity and inventory value routes are in `PaaSRTSM-project/apps/admin-api/src/routes/branch-stock.js`
- incoming receipt views are in `PaaSRTSM-project/apps/admin-api/src/routes/ordering.js`

Known live rule for paid sales:

- use the `movement-analytics.js` convention
- paid sale means `COALESCE(NULLIF(sh.raw_payload->>'FTShdStaPaid', ''), sh.paid_status, '') = '3'`

Do not reuse stale paid-status logic from older derivation migrations for new recommendation queries.

## Core User Outcomes

For each branch staff user, the system should answer:

1. Which SKUs need attention first?
2. For each SKU, should the branch:
   - do nothing
   - request stock from another branch
   - purchase more
   - request some and purchase the rest
3. Why is that recommendation being made?

For managers/admin users, the system should answer:

1. Which branches are overstocked or understocked?
2. How much stock value could be reduced by moving toward 90 days cover?
3. How much shortage can be resolved by internal transfer before purchasing?
4. What did the system recommend versus what the branch actually requested?
5. Where did admin intentionally override the recommendation and why?

## Product Philosophy

This engine is a decision-support system, not a decision-replacement system.

The system should provide a consistent statistical baseline, but final business decisions may still depend on:

- manager experience
- supplier news
- market shortages
- promotion plans
- branch-specific context not visible in raw data

Therefore:

- the system must compute one clear recommendation
- branch users must be allowed to follow or deviate from that recommendation
- admin users must be allowed to approve, revise, or reject it
- the system must preserve an audit trail of those differences

## Definitions

- `ADU`: average daily usage
- `days cover`: stock on hand divided by daily usage
- `target days`: desired stock cover, initially `90`
- `incoming PO`: incoming stock not yet added to branch stock snapshots
- `donor branch`: branch with transferable surplus above target
- `receiver branch`: branch below target

## Inputs Per Product Per Branch

Required:

- `product_code`
- `branch_code`
- `current_stock`
- `unit_cost_avg`
- `sold_qty_30d`
- `sold_qty_90d`
- `incoming_po_qty_total`
- `incoming_po_allocation_qty`

Optional in phase 1, important later:

- `sold_qty_same_period_last_year`
- `supplier_lead_time_days`
- `moq`
- `pack_multiple`
- `expiry risk`

Network-level inputs:

- stock and cost for the same SKU across all active branches
- incoming PO visibility for the same SKU

## Current Assumptions

### Incoming PO allocation

Current manual process (2026-07-13, photographed reference table): head office
keeps a printed lookup table mapping total received qty (1-200) to a
per-branch split for branches 001/003/004/005. Decoded from the table: it is
a **fixed ratio of 3:3:1:1** (001:003:004:005), applied via a largest-remainder
apportionment method (the same style used to apportion parliamentary seats)
so the split stays as close to that ratio as possible at every whole-unit
total. Confirmed from multiple rows, e.g. qty=8 -> 3,3,1,1 exactly; qty=200 ->
75,75,25,25 (= 3:3:1:1 exactly).

Problem with the fixed-ratio table: it never adapts. Whatever drove 3:3:1:1
historically (branch size, opening-day estimate, etc.) may no longer match
current real demand, and the table has no way to notice. A branch that's
currently selling faster than its historical share still only gets its fixed
25% (or whatever slot it's in), and a branch that's already overstocked still
gets its full fixed share of every new shipment regardless of how much it
already has on hand — directly undermines the 90-day-cover goal this whole
project is built around.

Decided direction (design agreed 2026-07-13, not yet implemented): replace
the fixed 3:3:1:1 weight with a dynamic per-branch weight computed from real
data, keeping the same largest-remainder apportionment mechanics as the
existing table (so the allocation math itself doesn't need to be reinvented,
just its input weights):

- **Primary weight: shortage** — `shortage_qty` per branch (already computed
  per product/branch in the engine), using the 90-day-window-derived demand
  figures already in place (not a single day's shortage) to avoid the
  allocation flipping around between shipments. A branch that's already at
  or above its 90-day target gets `shortage_qty = 0` and receives none of a
  new shipment for that SKU — this is what makes it self-correcting toward
  the 90-day goal, unlike the fixed-ratio table.
- **Fallback weight: demand (`adjusted_adu`)** — used only when every branch's
  shortage is 0 for that SKU (nobody currently needs it), so a shipment still
  has some defensible way to be split rather than an undefined 0/0 case.

Explicitly **advisory, not enforced** — matches the existing "system
recommendation vs branch request vs admin decision" three-layer model
described earlier in this doc. The computed split is a starting suggestion
branch staff/admin can override before acting on it, specifically so a
one-off case (e.g. a government procurement order suddenly buying out a
branch that doesn't normally carry much of that SKU) doesn't get blocked by
the system insisting on its computed split.

Formula (previous placeholder, superseded by the above):

```text
incoming_po_allocation_qty = incoming_po_qty_total / active_branch_count
```

Not yet implemented in code — `stockRecommendations.js` still uses the
equal-split placeholder above as of 2026-07-13. This section records the
agreed design so the next implementation session doesn't have to re-derive
it.

### Target stock cover

Default phase 1 target:

```text
target_days = 90
```

### Safety stock

Default phase 1 safety stock:

```text
safety_stock_days = 7
```

This can be implemented either by increasing target days to `97` internally or by adding a separate buffer term.

## Calculation Logic

### Step 1: Demand baseline

```text
adu_30 = sold_qty_30d / 30
adu_90 = sold_qty_90d / 90
base_adu = adu_90
```

Reason:

- `adu_90` is more stable than `adu_30`
- `adu_30` is still useful as a trend signal

### Step 2: Trend adjustment

```text
trend_ratio_30_vs_90 = adu_30 / NULLIF(adu_90, 0)
```

Adjustment rule:

```text
if trend_ratio_30_vs_90 >= 1.20
  adjusted_adu = base_adu * 1.10
else if trend_ratio_30_vs_90 <= 0.80
  adjusted_adu = base_adu * 0.90
else
  adjusted_adu = base_adu
```

Reason:

- recognize acceleration or slowdown
- avoid overreacting to short-term noise

### Step 3: Effective stock

```text
effective_stock = current_stock + incoming_po_allocation_qty
```

### Step 4: Cover days

```text
current_days_cover = current_stock / NULLIF(adjusted_adu, 0)
effective_days_cover = effective_stock / NULLIF(adjusted_adu, 0)
```

### Step 5: Target quantity

Without explicit safety stock:

```text
target_qty = adjusted_adu * 90
```

With safety stock:

```text
target_qty = adjusted_adu * (90 + safety_stock_days)
```

### Step 6: Gap

```text
gap_qty = effective_stock - target_qty
surplus_qty = MAX(gap_qty, 0)
shortage_qty = MAX(-gap_qty, 0)
```

Interpretation:

- `surplus_qty > 0` means branch has more than target
- `shortage_qty > 0` means branch is below target

## Donor / Receiver Logic

### Receiver

A branch is a receiver for a SKU when:

```text
shortage_qty > 0
```

### Donor

A branch is a donor for a SKU when it can give stock away and still remain safe.

```text
donor_min_keep_qty = adjusted_adu_donor * 90
donor_transferable_qty = MAX(effective_stock_donor - donor_min_keep_qty, 0)
```

If `donor_transferable_qty > 0`, the branch is a donor candidate.

### Donor sorting

Phase 1 donor ranking:

```text
sort donor branches by donor_transferable_qty desc
```

### Transfer planning

For one `receiver branch x product`:

1. compute `shortage_qty`
2. gather all donor branches for that product
3. sort donors by `donor_transferable_qty desc`
4. allocate transfers from donors until:
   - shortage is fully covered, or
   - all donor surplus is exhausted

Outputs:

- `transfer_plan_qty`
- `transfer_plan[]`
- `remaining_purchase_qty`

Example:

```text
receiver shortage = 20
donor 003 transferable = 12
donor 005 transferable = 15

transfer from 003 = 12
transfer from 005 = 8
remaining purchase = 0
```

## Decision Hierarchy

The engine must evaluate actions in this order:

1. current branch stock
2. incoming PO allocation
3. internal transfer opportunity
4. purchase recommendation

This order matters. Internal stock redistribution should reduce unnecessary purchasing.

## Shared Recommendation Workflow

This feature must exist across both applications:

- `order-web` for branch-side daily action
- `admin-web` for company-wide review, override, and approval

The recommendation engine itself must live in the shared backend and expose one consistent result set to both apps.

### Workflow stages

1. backend computes recommendation per `product x branch`
2. `order-web` shows the recommendation to the branch user
3. branch user decides what to request
4. branch submits a request based on or deviating from the recommendation
5. `admin-web` shows:
   - system recommendation
   - branch-requested quantity
   - cross-branch stock context
   - incoming PO context
6. CEO/admin approves, adjusts, or rejects
7. final approved quantity becomes the operational decision

### Key design principle

The recommendation logic is shared.

The action-taking surfaces are different:

- `order-web` should optimize for speed and clarity
- `admin-web` should optimize for review, comparison, and override

## Workflow Decision Update

Current preferred architecture:

- recommendation is a `decision layer`
- existing request flow remains the operational workflow
- recommendation should prefill into the existing `คำขอสินค้า` flow instead of creating a second parallel request system

This means:

- `order-web` shows recommendation rows
- branch users select items and push them into the existing request draft / request experience
- `admin-web` compares:
  - system recommendation
  - branch request
  - final admin decision

The recommendation engine helps users think.
The request flow remains the place where users act.

### What this avoids

- duplicate request UIs
- duplicate draft concepts
- confusion between "recommendation draft" and "request draft"
- a second workflow that overlaps with `คำขอสินค้า`

### What this requires

- recommendation-to-request mapping must be explicit
- request records must preserve recommendation snapshots for audit
- admin review must show system recommendation next to the real request

## Recommendation, Request, Decision Model

The system should conceptually preserve three separate layers:

### 1. System recommendation

What the engine recommends from data.

Examples:

- request from branch 003 qty 8
- purchase from CEO qty 12
- request 8 and purchase 4
- do nothing

### 2. Branch request

What the branch user actually submits.

This may match the recommendation or differ from it.

### 3. Admin decision

What the CEO/admin finally approves.

This may match:

- the system recommendation
- the branch request

or may override both.

## Audit and Explainability Requirements

The system must preserve enough fields to answer these questions later:

- What did the system recommend?
- What did the branch request?
- Did admin approve the same thing?
- If not, what changed?
- Why did it change?

At a minimum, the workflow should preserve:

- recommendation action
- recommendation quantities
- branch-requested action
- branch-requested quantities
- admin-approved action
- admin-approved quantities
- difference flags
- free-text reason / note for override

## Action Types

### `NO_ACTION`

Use when:

- branch is already at or above target
- no urgent risk exists

### `TRANSFER_IN`

Use when:

- branch is below target
- donor branches can fully cover the shortage

### `PURCHASE`

Use when:

- branch is below target
- no donor branches can provide stock

### `TRANSFER_AND_PURCHASE`

Use when:

- branch is below target
- donor branches can provide only part of the shortage

### `OVERSTOCK`

Advisory flag, not the primary action, when:

```text
effective_days_cover > 120
```

or other configurable threshold in the future.

## Zero-Sales Logic

If `sold_qty_90d = 0`:

- if `current_stock = 0` -> `NO_ACTION`
- if `current_stock > 0` -> `NO_PURCHASE_SLOW_MOVING`

Reason text examples:

- `90 วันที่ผ่านมาไม่มีการขาย ยังไม่ควรสั่งเพิ่ม`
- `สินค้าหมุนช้า ควรระบายก่อน`

## Recommended Quantity Rounding

Phase 1:

```text
rounded_qty = CEIL(raw_qty)
```

Later:

- round up to `pack_multiple`
- honor MOQ

## Priority Score

A simple operational priority score helps sort the list:

```text
priority_score = shortage_qty * unit_cost_avg
```

Alternative:

```text
priority_score = MAX(0, 90 - effective_days_cover) * adjusted_adu * unit_cost_avg
```

Phase 1 recommendation:

- use the first formula because it is easier to explain and debug

## Manager KPIs

Recommended KPI outputs:

- `current_total_inventory_value`
- `projected_inventory_value_at_90_days`
- `potential_inventory_value_reduction`
- `average_days_cover_company`
- `average_days_cover_by_branch`
- `sku_count_recommend_transfer`
- `sku_count_recommend_purchase`
- `total_transferable_qty`
- `total_shortage_qty`
- `total_surplus_qty`

## Backend API Spec

### API placement

Recommended backend repo and area:

- repo: `PaaSRTSM-project`
- app: `apps/admin-api`
- likely route file: new route file under `src/routes/`, not the legacy SC server

### Route 1: Recommendation list

```text
GET /api/admin/stock-recommendations
```

Purpose:

- return branch-specific recommendation rows for staff or admin users
- provide the same recommendation baseline to both `order-web` and `admin-web`

Auth:

- cookie auth required
- staff users should default to their own branch
- admin users may query any branch or `all`

Query parameters:

- `branchCode`: `000|001|002|003|004|005|all`
- `dateFrom`: optional, default derived from latest synced data
- `dateTo`: optional, default derived from latest synced data
- `targetDays`: optional, default `90`
- `page`: optional, default `1`
- `pageSize`: optional, default `50`
- `search`: optional SKU/name/barcode search
- `action`: optional filter `NO_ACTION|TRANSFER_IN|PURCHASE|TRANSFER_AND_PURCHASE|NO_PURCHASE_SLOW_MOVING`
- `sort`: optional
  - `priority_desc`
  - `days_cover_asc`
  - `inventory_value_desc`
  - `product_code_asc`

Notes:

- use Bangkok-aware date handling
- sold quantity date-range logic should follow the live sales route convention
- do not use overlapping summary-window approximations when exact date ranges matter

Response shape:

```json
{
  "branchCode": "001",
  "targetDays": 90,
  "generatedAt": "2026-07-12T09:15:00.000Z",
  "summary": {
    "skuCount": 1284,
    "recommendTransferCount": 146,
    "recommendPurchaseCount": 221,
    "recommendMixedCount": 49,
    "slowMovingCount": 93,
    "currentInventoryValue": 2567890.12,
    "projectedInventoryValueAtTarget": 2145123.55,
    "potentialReductionValue": 422766.57
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 221
  },
  "rows": [
    {
      "productCode": "IC-003662",
      "productNameThai": "ปลาอมิ สุขุม 325 mg 1000 เม็ด",
      "barcode": "8851234567890",
      "unit": "กระปุก",
      "branchCode": "001",
      "currentStock": 18,
      "unitCostAvg": 210.0,
      "inventoryValue": 3780.0,
      "soldQty30d": 21,
      "soldQty90d": 54,
      "soldQtySamePeriodLastYear": null,
      "adu30": 0.7,
      "adu90": 0.6,
      "trendRatio30Vs90": 1.1667,
      "adjustedAdu": 0.6,
      "incomingPoQtyTotal": 24,
      "incomingPoAllocationQty": 6,
      "effectiveStock": 24,
      "currentDaysCover": 30.0,
      "effectiveDaysCover": 40.0,
      "targetDays": 90,
      "targetQty": 54.0,
      "surplusQty": 0,
      "shortageQty": 30.0,
      "transferPlanQty": 20,
      "purchaseQty": 10,
      "priorityScore": 6300.0,
      "action": "TRANSFER_AND_PURCHASE",
      "reason": "สต๊อกหลังรวม incoming PO พอประมาณ 40 วัน ต่ำกว่าเป้าหมาย 90 วัน แนะนำขอจากสาขา 003 จำนวน 20 และสั่งเพิ่มอีก 10",
      "flags": ["HAS_INCOMING_PO"],
      "donors": [
        {
          "branchCode": "003",
          "qty": 20,
          "daysCoverAfterTransfer": 96.2
        }
      ]
    }
  ]
}
```

### Route 2: Branch submission against recommendation

```text
POST /api/stock-recommendation-requests
```

Purpose:

- allow branch staff to submit what they want to do after reviewing the recommendation

Expected request body:

```json
{
  "branchCode": "001",
  "items": [
    {
      "productCode": "IC-003662",
      "recommendationSnapshot": {
        "action": "TRANSFER_AND_PURCHASE",
        "transferPlanQty": 20,
        "purchaseQty": 10,
        "generatedAt": "2026-07-12T09:15:00.000Z"
      },
      "requestedAction": "PURCHASE",
      "requestedTransferQty": 0,
      "requestedPurchaseQty": 15,
      "requestReason": "คาดว่าความต้องการจะขึ้นเพิ่ม"
    }
  ]
}
```

Behavior:

- save the recommendation snapshot used by the branch at submit time
- save the branch-requested quantities
- mark whether the request matches the recommendation

### Route 3: Admin decision / approval

```text
POST /api/admin/stock-recommendation-decisions
```

Purpose:

- allow admin or CEO to approve, modify, or reject branch requests while seeing the system baseline

Expected request body:

```json
{
  "requestId": "srqrec_20260712_001_0001",
  "decision": {
    "approvedAction": "PURCHASE",
    "approvedTransferQty": 0,
    "approvedPurchaseQty": 12,
    "overrideReason": "อนุมัติต่ำกว่าที่สาขาขอ เพราะ incoming PO จะเข้าเร็ว"
  }
}
```

Behavior:

- persist final admin decision
- mark whether admin matched or overrode the branch request
- mark whether admin matched or overrode the system recommendation

### Route 4: Manager summary

```text
GET /api/admin/stock-recommendations/summary
```

Purpose:

- provide lightweight KPI cards and branch comparison without full row payload
- include recommendation-vs-request and admin-override visibility

Query parameters:

- `branchCode`: optional, default `all`
- `targetDays`: optional, default `90`

Response shape:

```json
{
  "branchCode": "all",
  "targetDays": 90,
  "generatedAt": "2026-07-12T09:15:00.000Z",
  "company": {
    "currentInventoryValue": 15000000.0,
    "projectedInventoryValueAtTarget": 11490000.0,
    "potentialReductionValue": 3510000.0,
    "averageDaysCover": 117.5,
    "skuCountRecommendTransfer": 314,
    "skuCountRecommendPurchase": 428,
    "requestMatchRecommendationCount": 211,
    "requestOverrideRecommendationCount": 96,
    "adminOverrideBranchRequestCount": 34,
    "adminOverrideSystemRecommendationCount": 41
  },
  "branches": [
    {
      "branchCode": "000",
      "label": "สำนักงานใหญ่",
      "currentInventoryValue": 4123456.78,
      "averageDaysCover": 131.4,
      "recommendTransferCount": 84,
      "recommendPurchaseCount": 52
    }
  ]
}
```

### Route 5: Optional donor detail endpoint

This route is optional. It may not be needed if donor details already come inside each row.

```text
GET /api/admin/stock-recommendations/:productCode/donors
```

Purpose:

- explain which branches can supply stock for one SKU

## Backend Implementation Notes

- compute sold-qty using raw `ada.sales_headers` + `ada.sales_lines` with the live paid-sale filter
- use current branch stock and cost from `ada.branch_stock_snapshots`
- use incoming PO visibility from the approved/pending purchase receipt area
- keep incoming allocation logic isolated so it can be swapped later
- keep donor selection logic deterministic and explainable
- avoid adding logic to `SC-StockDay-Ordering/server`

## Backend Implementation-Ready Mapping

This section ties the recommendation design to the actual live backend code in `PaaSRTSM-project`.

### Live mount points

Confirmed from `PaaSRTSM-project/apps/admin-api/src/server.js`:

- `createBranchStockRouter(...)` is mounted at `/api`
- `createMovementAnalyticsRouter(...)` is mounted at `/api/admin`
- `createStockRequestsRouter(...)` is mounted at `/api`
- `createStockRequestDraftsRouter(...)` is mounted at `/api`
- `createOrderingRouter(...)` is mounted at `/api`

This means any new recommendation routes should be added in `PaaSRTSM-project/apps/admin-api/src/routes/` and mounted from `server.js`, not in the SC legacy server.

### Existing source routes to reuse

#### 1. Sold quantity source

Existing live route file:

- `PaaSRTSM-project/apps/admin-api/src/routes/movement-analytics.js`

Relevant route patterns already live:

- `GET /api/admin/branch-product-sales`
- `GET /api/admin/branch-sales-summary`
- `GET /api/admin/sales-sync-coverage`

Important implementation detail already proven in production:

- exact sold-qty should come from raw `ada.sales_headers` + `ada.sales_lines`
- paid-sale filter must use:

```sql
COALESCE(NULLIF(sh.raw_payload->>'FTShdStaPaid', ''), sh.paid_status, '') = '3'
```

and document type should stay constrained to the real sale-doc condition already used by the live route.

Recommended reuse:

- extract the paid-sale filtering and date-range sales aggregation into a new service, or
- keep the first implementation inside a new route file but copy the exact live filter logic from `movement-analytics.js`

#### 2. Current stock and cost source

Existing live route file:

- `PaaSRTSM-project/apps/admin-api/src/routes/branch-stock.js`

Relevant live route:

- `GET /api/branch-stock/inventory-value`

Primary source table:

- `ada.branch_stock_snapshots`

Important implementation detail:

- current inventory value is already computed as `qty x moving average cost`
- branch cost columns are already present per branch in `ada.branch_stock_snapshots`

Recommended reuse:

- recommendation queries should read current stock directly from `ada.branch_stock_snapshots`
- for branch-specific calculations, use the existing branch column mapping pattern already present in `branch-stock.js`
- for admin/company-wide summary, reuse the same branch-order and aggregation style as `/api/branch-stock/inventory-value`

#### 3. Incoming PO / receipts source

Existing live route file:

- `PaaSRTSM-project/apps/admin-api/src/routes/ordering.js`

Relevant live routes:

- `GET /api/admin/pending-receipts`
- `GET /api/admin/approved-receipts`

Primary source tables:

- `ada.pending_receipt_headers`
- `ada.pending_receipt_lines`
- `ada.approved_receipt_headers`
- `ada.approved_receipt_lines`

Recommended phase 1 interpretation:

- define one recommendation-specific helper that aggregates incoming receipt quantity per `branch_code x product_code`
- keep `pending` and `approved` logic selectable by policy
- if the business has not decided which receipt states count as reliable incoming supply, expose it as a policy choice or config constant

Suggested initial policy:

- count `approved receipts` as incoming only if they are visible before branch stock snapshots reflect them
- if that timing is ambiguous in practice, prefer `pending + approved` behind an explicit policy flag until business confirms the meaning

#### 4. Existing request workflow to mirror

Existing live route files:

- `PaaSRTSM-project/apps/admin-api/src/routes/stock-requests.js`
- `PaaSRTSM-project/apps/admin-api/src/routes/stock-request-drafts.js`
- `PaaSRTSM-project/apps/admin-api/src/services/stockRequests.js`
- `PaaSRTSM-project/apps/admin-api/src/services/stockRequestDrafts.js`

Why these matter:

- they already implement the house style for request lifecycle
- they already separate `draft`, `submit`, `mine`, `incoming`, and detail views
- they already respect auth, branch identity, and CSRF patterns

Recommended recommendation workflow pattern:

- recommendation rows themselves are read-only analytics
- branch-selected actions should follow the existing draft/submit workflow style rather than a one-off ad hoc endpoint family

### Recommended new backend files

Recommended new route file:

- `PaaSRTSM-project/apps/admin-api/src/routes/stock-recommendations.js`

Recommended new service file:

- `PaaSRTSM-project/apps/admin-api/src/services/stockRecommendations.js`

Optional later if draft complexity grows:

- `PaaSRTSM-project/apps/admin-api/src/services/stockRecommendationRequests.js`

Reason:

- keep analytics/recommendation logic separate from the already-large `ordering.js`
- avoid bloating `movement-analytics.js` further
- keep workflow code separate from pure recommendation calculations

### Recommended route family

#### Read-only recommendation routes

These should live under admin-style analytics namespace because they are shared analytical outputs, even if consumed by both apps.

1. `GET /api/admin/stock-recommendations`
   Purpose:
   - shared recommendation list
   - consumed by both `order-web` and `admin-web`
   Auth:
   - `requireAuthMiddleware`
   Behavior:
   - if user role is `staff` or `branch`, default `branchCode` to `req.auth.effectiveBranchCode`
   - if user role is `admin`, allow any branch or `all`

2. `GET /api/admin/stock-recommendations/summary`
   Purpose:
   - KPI cards and branch comparison summary
   Auth:
   - `requireAuthMiddleware`
   - optionally `requireRoleMiddleware("admin")` if cross-branch company-wide summary should remain admin-only

3. `GET /api/admin/stock-recommendations/:branchCode/:productCode`
   Purpose:
   - detail view for one recommendation row
   - donor explanation, incoming explanation, recommendation snapshot
   Auth:
   - `requireAuthMiddleware`

#### Recommendation-to-request integration routes

Preferred direction:

- do not create a separate recommendation draft workflow
- reuse the existing stock-request draft and submit flow
- attach recommendation snapshot metadata to existing draft lines and submitted request lines

Recommended integration points:

4. `PUT /api/stock-request-draft/me`
   Purpose:
   - existing draft endpoint continues to be the save target
   - recommendation-aware UI sends recommendation snapshot fields together with normal request-draft line data

5. `POST /api/stock-requests`
   Purpose:
   - existing submit endpoint remains the operational submit target
   - submitted lines carry recommendation snapshot metadata for later review

6. `GET /api/stock-requests/mine`
   Purpose:
   - existing request list remains the branch-facing history

#### Admin review integration

Preferred direction:

- admin continues to review real requests in the existing request/admin flow
- admin screens should render recommendation-vs-request comparison using recommendation snapshot data attached to the request lines

Recommended integration points:

7. `GET /api/stock-requests/mine`
   Branch history with recommendation-aware status details.

8. `GET /api/stock-requests/incoming/:publicId`
   Extend response so admin/receiver-side review can see system recommendation snapshot alongside requested quantities.

9. Existing response / approval routes under `/api/stock-requests/incoming/...`
   Continue to be the operational action routes.

### Route-to-file recommendation

Recommended code placement:

- list/detail/summary routes:
  `apps/admin-api/src/routes/stock-recommendations.js`
- recommendation calculation helpers:
  `apps/admin-api/src/services/stockRecommendations.js`
- draft/submit routes:
  `apps/admin-api/src/routes/stock-recommendation-drafts.js`
- admin decision routes:
  either:
  - `apps/admin-api/src/routes/stock-recommendation-requests.js`
  or
  - keep them in `stock-recommendations.js` if the file stays cohesive

Preferred split:

- `stock-recommendations.js` for read-only recommendation analytics
- `stock-recommendation-drafts.js` for branch draft handling
- `stock-recommendation-requests.js` for submit/review/decision flow

### Implementation data sources by field

Recommended source mapping for recommendation rows:

- `productCode`
  source:
  - `ada.branch_stock_snapshots.product_code`

- `productNameThai`, `productNameEng`, `barcode`, `unit`
  source:
  - first preference: `ada.branch_stock_snapshots`
  - fallback: `ada.products`
  - optional category fallback: `public.skus`

- `currentStock`
  source:
  - branch-specific qty column in `ada.branch_stock_snapshots`

- `unitCostAvg`
  source:
  - branch-specific cost column in `ada.branch_stock_snapshots`

- `inventoryValue`
  formula:
  - `currentStock * unitCostAvg`

- `soldQty30d`, `soldQty90d`
  source:
  - aggregate from `ada.sales_headers` + `ada.sales_lines`
  rules:
  - use the live paid-sale filter from `movement-analytics.js`
  - use exact date filtering on `sh.doc_date`

- `incomingPoQtyTotal`
  source:
  - aggregate from receipt tables by product

- `incomingPoAllocationQty`
  source:
  - compute in service layer from incoming policy
  phase 1 rule:
  - equal split across active branches unless branch-specific quantity is known

- `effectiveStock`
  formula:
  - `currentStock + incomingPoAllocationQty`

- `currentDaysCover`, `effectiveDaysCover`
  formula:
  - use calculated ADU

- `donors`
  source:
  - other branches' qty/cost values from `ada.branch_stock_snapshots`
  plus:
  - same recommendation logic applied cross-branch for transferable surplus

### Active branches policy

Do not hardcode branch lists in multiple places unless matching an already-established backend constant.

Recommended phase 1 policy:

- derive active branches from `core.branches WHERE is_active = TRUE`
- if branch-column limitations in `ada.branch_stock_snapshots` force a fixed set, centralize the active branch list in one recommendation service constant

### Response shape recommendation: list route

Implementation-ready top-level shape:

```json
{
  "ok": true,
  "request_id": "uuid",
  "branchCode": "001",
  "targetDays": 90,
  "generatedAt": "2026-07-12T09:15:00.000Z",
  "policy": {
    "incomingAllocationMode": "equal_split",
    "incomingSourceMode": "pending_and_approved_receipts",
    "demandMode": "sales_90d_with_30d_trend_adjustment"
  },
  "summary": {
    "skuCount": 1284,
    "recommendTransferCount": 146,
    "recommendPurchaseCount": 221,
    "recommendMixedCount": 49,
    "slowMovingCount": 93,
    "currentInventoryValue": 2567890.12,
    "projectedInventoryValueAtTarget": 2145123.55,
    "potentialReductionValue": 422766.57
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 221
  },
  "rows": []
}
```

Recommendation:

- keep `ok` and `request_id` consistent with current backend response style
- prefer `rows` for list data because it is already used conceptually in analytics-style APIs

### Response shape recommendation: branch submit route

Implementation-ready response:

```json
{
  "ok": true,
  "request_id": "uuid",
  "recommendationRequestId": "SRR-20260712-001-000001",
  "status": "SUBMITTED",
  "submittedAt": "2026-07-12T10:25:00.000Z",
  "matchesRecommendation": false,
  "items": [
    {
      "productCode": "IC-003662",
      "recommendedAction": "TRANSFER_AND_PURCHASE",
      "requestedAction": "PURCHASE",
      "requestedPurchaseQty": 15
    }
  ]
}
```

### Response shape recommendation: admin decision route

Implementation-ready response:

```json
{
  "ok": true,
  "request_id": "uuid",
  "recommendationRequestId": "SRR-20260712-001-000001",
  "status": "APPROVED",
  "decision": {
    "approvedAction": "PURCHASE",
    "approvedTransferQty": 0,
    "approvedPurchaseQty": 12,
    "overrideReason": "อนุมัติต่ำกว่าที่สาขาขอ เพราะ incoming PO จะเข้าเร็ว"
  }
}
```

### Recommended validation rules

For branch-facing submit routes:

- branch user can only submit for `req.auth.effectiveBranchCode`
- recommendation snapshot must include `generatedAt`
- requested quantities must be non-negative
- at least one of transfer or purchase quantity must be positive when action is not `NO_ACTION`

For admin decision routes:

- admin can approve, modify, or reject
- override reason should be required if the final decision materially differs from both:
  - the system recommendation
  - the branch request

### Recommended initial persistence strategy

Recommended path:

- use stateless recommendation read routes
- persist recommendation snapshots inside the existing request flow

This means:

- recommendation rows are computed on read
- when a branch user saves a request draft or submits a request, the recommendation snapshot for each selected line is attached to the existing draft/request line

Reason:

- no duplicated workflow
- preserves what the branch actually saw when submitting
- supports audit and later comparison even if stock or sales data change afterward

### Recommended phase 1 non-goals for backend

- do not try to auto-create transfer documents yet
- do not blend this into existing `stock_requests` tables unless the workflow becomes proven compatible
- do not use the SC legacy server
- do not depend on `analytics.product_sales_summary_periods` for arbitrary recommendation date windows

## DB Schema Proposal

This section proposes additive workflow tables for the recommendation feature.

Design goals:

- avoid creating a parallel request workflow
- attach recommendation context to existing `ordering.stock_request_*` workflow
- preserve a snapshot of what the system recommended at submit time
- preserve what the branch requested
- preserve what admin finally approved
- support draft save, submit, review, and audit

Recommended schema:

- `ordering`

Reason:

- the workflow is operational and branch-facing, not just passive analytics
- it aligns with the existing request-oriented domain already stored in `ordering.*`

### Preferred persistence model

Preferred phase 1 direction:

- reuse existing tables:
  - `ordering.stock_request_drafts`
  - `ordering.stock_request_draft_lines`
  - `ordering.stock_requests`
  - `ordering.stock_request_lines`
- add recommendation snapshot fields via additive columns or sidecar tables
- keep recommendation read-model separate, but let request persistence stay inside the existing request workflow

### Preferred option: sidecar tables

Recommended table family:

- `ordering.stock_request_draft_line_recommendations`
- `ordering.stock_request_line_recommendations`
- optional later: `ordering.stock_request_recommendation_events`

Reason:

- avoids bloating core request line tables with too many nullable columns
- keeps recommendation payload explicit
- preserves clear audit without creating a parallel workflow

### Table 1: `ordering.stock_request_draft_line_recommendations`

Purpose:

- attach recommendation snapshot data to existing `ordering.stock_request_draft_lines`
- supports prefill and resume behavior inside the existing draft flow

Recommended columns:

- `draft_line_recommendation_id bigserial primary key`
- `draft_line_id bigint not null references ordering.stock_request_draft_lines(draft_line_id) on delete cascade`
- `target_days integer not null default 90`
- `incoming_allocation_mode text not null`
- `incoming_source_mode text not null`
- `recommendation_generated_at timestamptz null`
- `recommendation_basis_date_from date null`
- `recommendation_basis_date_to date null`
- `product_code text not null`
- `current_stock numeric(14,4) null`
- `unit_cost_avg numeric(14,4) null`
- `sold_qty_30d numeric(14,4) null`
- `sold_qty_90d numeric(14,4) null`
- `adu_30 numeric(14,6) null`
- `adu_90 numeric(14,6) null`
- `adjusted_adu numeric(14,6) null`
- `incoming_po_qty_total numeric(14,4) null`
- `incoming_po_allocation_qty numeric(14,4) null`
- `effective_stock numeric(14,4) null`
- `current_days_cover numeric(14,4) null`
- `effective_days_cover numeric(14,4) null`
- `target_qty numeric(14,4) null`
- `surplus_qty numeric(14,4) not null default 0`
- `shortage_qty numeric(14,4) not null default 0`
- `recommended_action text not null`
- `recommended_transfer_qty numeric(14,4) not null default 0`
- `recommended_purchase_qty numeric(14,4) not null default 0`
- `primary_suggested_donor_branch_code text null references core.branches(branch_code)`
- `recommendation_reason text`
- `recommendation_flags jsonb not null default '[]'::jsonb`
- `donor_snapshot jsonb not null default '[]'::jsonb`
- `recommendation_snapshot jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Recommended constraints:

- unique `(draft_line_id)`

### Table 2: `ordering.stock_request_line_recommendations`

Purpose:

- attach the recommendation snapshot that existed when an actual request line was submitted
- preserve `system recommendation` versus `actual request` on the real request line

Recommended columns:

- `request_line_recommendation_id bigserial primary key`
- `line_id bigint not null references ordering.stock_request_lines(line_id) on delete cascade`
- `target_days integer not null default 90`
- `incoming_allocation_mode text not null`
- `incoming_source_mode text not null`
- `recommendation_generated_at timestamptz null`
- `recommendation_basis_date_from date null`
- `recommendation_basis_date_to date null`
- `product_code text not null`
- `current_stock numeric(14,4) null`
- `unit_cost_avg numeric(14,4) null`
- `inventory_value numeric(14,4) null`
- `sold_qty_30d numeric(14,4) null`
- `sold_qty_90d numeric(14,4) null`
- `adu_30 numeric(14,6) null`
- `adu_90 numeric(14,6) null`
- `adjusted_adu numeric(14,6) null`
- `incoming_po_qty_total numeric(14,4) null`
- `incoming_po_allocation_qty numeric(14,4) null`
- `effective_stock numeric(14,4) null`
- `current_days_cover numeric(14,4) null`
- `effective_days_cover numeric(14,4) null`
- `target_qty numeric(14,4) null`
- `surplus_qty numeric(14,4) not null default 0`
- `shortage_qty numeric(14,4) not null default 0`
- `recommended_action text not null`
- `recommended_transfer_qty numeric(14,4) not null default 0`
- `recommended_purchase_qty numeric(14,4) not null default 0`
- `request_matches_recommendation boolean not null default true`
- `primary_suggested_donor_branch_code text null references core.branches(branch_code)`
- `recommendation_reason text`
- `recommendation_flags jsonb not null default '[]'::jsonb`
- `donor_snapshot jsonb not null default '[]'::jsonb`
- `recommendation_snapshot jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Recommended constraints:

- unique `(line_id)`

### Table 3: `ordering.stock_request_line_recommendation_decisions`

Purpose:

- preserve final admin comparison at the real request-line level
- record whether admin followed the request, followed the recommendation, or overrode both

Recommended columns:

- `request_line_recommendation_decision_id bigserial primary key`
- `line_id bigint not null references ordering.stock_request_lines(line_id) on delete cascade`
- `response_id bigint null references ordering.stock_request_line_responses(response_id) on delete set null`
- `approved_action text null`
- `approved_transfer_qty numeric(14,4) not null default 0`
- `approved_purchase_qty numeric(14,4) not null default 0`
- `matches_branch_request boolean not null default true`
- `matches_system_recommendation boolean not null default true`
- `override_reason text`
- `decision_note text`
- `decided_by text not null`
- `decided_by_role text not null`
- `decided_at timestamptz not null default now()`
- `is_current boolean not null default true`

Recommended constraints:

- unique current decision per `line_id`

### Relationship summary

Recommended relationships:

- one existing `stock_request_drafts` row has many existing `stock_request_draft_lines`
- one draft line may have one `stock_request_draft_line_recommendations` row
- one existing `stock_requests` row has many existing `stock_request_lines`
- one request line may have one `stock_request_line_recommendations` row
- one request line may have one current `stock_request_line_recommendation_decisions` row

### Why not reuse `ordering.stock_request_*` directly

Phase 1 recommendation:

- reuse `ordering.stock_request_*` as the actual workflow
- keep recommendation metadata as an attached layer, not a second workflow

Reason:

- this avoids duplicated UX and duplicated request lifecycle
- recommendation data still needs a clear audit boundary
- sidecar tables give that boundary without forking the workflow

### Recommended migration strategy

Suggested migration sequence:

1. create `ordering.stock_request_draft_line_recommendations`
2. create `ordering.stock_request_line_recommendations`
3. create `ordering.stock_request_line_recommendation_decisions`
7. add indexes and partial unique indexes

Suggested migration filename:

- `migrations/047_add_stock_recommendation_metadata.sql`

### Recommended phase 1 simplifications

If the team wants a smaller first migration:

- keep donor details only in `donor_snapshot jsonb`
- skip draft-line attachment first if needed
- start with request-line attachment only
- keep one current decision row per request line

This keeps the schema expressive enough for audit without exploding table count.

## Implementation Plan By File

This section translates the design into a practical file-by-file build plan for `PaaSRTSM-project`.

Guiding principles:

- land the read-only recommendation engine first
- add persistence for branch draft and submit second
- add admin review/decision third
- reuse proven query fragments and auth patterns before inventing new ones
- avoid one giant route file

### Phase order

Recommended build sequence:

1. migration for recommendation workflow tables
2. new service with read-only recommendation calculation helpers
3. new admin analytics route for recommendation list and summary
4. new draft service and draft routes for branch-side save/load
5. new submit/review/decision service and routes
6. mount routes in `server.js`
7. tests for calculation, draft save, submit, and decision flows

### Files to create

Recommended new files:

- `apps/admin-api/src/services/stockRecommendations.js`
- `apps/admin-api/src/routes/stock-recommendations.js`
- `migrations/047_add_stock_recommendation_metadata.sql`
- `tests/stock_recommendations_api.test.js`

Optional helper extraction later:

- `apps/admin-api/src/services/stockRecommendationSql.js`

Only add this if the main service becomes too large.

### Files to update

Required updates:

- `apps/admin-api/src/server.js`
- `apps/admin-api/src/services/stockRequestDrafts.js`
- `apps/admin-api/src/services/stockRequests.js`
- `apps/admin-api/src/routes/stock-request-drafts.js`
- `apps/admin-api/src/routes/stock-requests.js`

Optional refactor-only updates if helpful:

- `apps/admin-api/src/routes/movement-analytics.js`
- `apps/admin-api/src/routes/ordering.js`
- `apps/admin-api/src/routes/branch-stock.js`

These optional files should only be touched to extract reusable helper functions if the duplication becomes unacceptable.

## Phase 1: Migration

### File

- `migrations/047_add_stock_recommendation_metadata.sql`

### Goal

- create recommendation metadata attachment tables for the existing request workflow

### Tables to create

- `ordering.stock_request_draft_line_recommendations`
- `ordering.stock_request_line_recommendations`
- `ordering.stock_request_line_recommendation_decisions`

### Notes

- follow the additive style used by `033_add_stock_request_workflow.sql`
- wrap in `BEGIN/COMMIT`
- keep constraints explicit
- add partial unique indexes for active draft and current decision

## Phase 2: Read-only recommendation engine

### File

- `apps/admin-api/src/services/stockRecommendations.js`

### Goal

- compute recommendation rows and summaries without any persistence dependency

### Functions to implement first

Recommended public service functions:

- `listStockRecommendations({ db, auth, filters })`
- `getStockRecommendationSummary({ db, auth, filters })`
- `getStockRecommendationDetail({ db, auth, branchCode, productCode, filters })`

Recommended internal helper functions:

- `resolveEffectiveBranchScope(auth, requestedBranchCode)`
- `loadActiveBranchCodes(db)`
- `loadRecommendationPolicy(filters)`
- `loadSalesAggByProductBranch(db, options)`
- `loadCurrentStockByProduct(db, options)`
- `loadIncomingReceiptAggByProductBranch(db, options)`
- `buildRecommendationRows({ stockRows, salesRows, incomingRows, branchCodes, policy })`
- `computeRecommendationForProductBranch(input)`
- `computeDonorPlan(input)`
- `summarizeRecommendationRows(rows)`

### Queries to reuse first

#### Reuse 1: sold quantity aggregation

Source to copy from:

- `apps/admin-api/src/routes/movement-analytics.js`

Reuse the exact paid-sales logic from the `GET /api/admin/branch-product-sales` query:

- source tables:
  - `ada.sales_headers sh`
  - `ada.sales_lines sl`
- required filters:
  - `sh.doc_date` exact range filter
  - paid status using `FTShdStaPaid = '3'`
  - sale doc type filter already used in that route

Recommended first extraction target:

- copy the `filtered_sales` CTE pattern into `loadSalesAggByProductBranch`

Do not reuse:

- `analytics.product_sales_summary_periods` for arbitrary windows

#### Reuse 2: current stock + cost

Source to copy from:

- `apps/admin-api/src/routes/branch-stock.js`

Reuse concepts:

- branch column mapping
- inventory value formula
- active-branch aggregate style

Recommended first extraction target:

- load one row per product from `ada.branch_stock_snapshots`
- map branch qty and cost columns into a normalized in-memory shape like:

```js
{
  productCode,
  branches: {
    "001": { qty, unitCostAvg },
    "003": { qty, unitCostAvg }
  }
}
```

This keeps later recommendation logic cleaner than operating on raw wide columns.

#### Reuse 3: incoming receipts

Source to copy from:

- `apps/admin-api/src/routes/ordering.js`
- specifically `getPendingReceipts` and `getApprovedReceipts`

Recommended first extraction target:

- do not reuse the grouped document response shape
- instead write one recommendation-specific aggregate query:

  - group by `branch_code, product_code`
  - sum `qty_base` or normalized quantity
  - support mode:
    - `pending_only`
    - `approved_only`
    - `pending_and_approved`

Reason:

- recommendation engine needs quantity aggregates, not per-document UI payload

### Output shape for service layer

Recommended normalized row object before route formatting:

```js
{
  branchCode,
  productCode,
  productNameThai,
  productNameEng,
  barcode,
  unit,
  currentStock,
  unitCostAvg,
  inventoryValue,
  soldQty30d,
  soldQty90d,
  adu30,
  adu90,
  adjustedAdu,
  incomingPoQtyTotal,
  incomingPoAllocationQty,
  effectiveStock,
  currentDaysCover,
  effectiveDaysCover,
  targetQty,
  surplusQty,
  shortageQty,
  action,
  transferPlanQty,
  purchaseQty,
  donors,
  recommendationReason,
  flags,
  priorityScore
}
```

## Phase 3: Read-only routes

### File

- `apps/admin-api/src/routes/stock-recommendations.js`

### Goal

- expose summary/list/detail routes backed by `stockRecommendations.js`

### Routes to add first

1. `GET /stock-recommendations`
2. `GET /stock-recommendations/summary`
3. `GET /stock-recommendations/:branchCode/:productCode`

Mounted at:

- `/api/admin`

Final URLs:

- `GET /api/admin/stock-recommendations`
- `GET /api/admin/stock-recommendations/summary`
- `GET /api/admin/stock-recommendations/:branchCode/:productCode`

### Auth pattern

Use the same style as other admin analytics routes:

- `requireAuthMiddleware` on all routes
- optionally `requireRoleMiddleware("admin")` on company-wide summary if needed

### Route implementation plan

Implement in this order:

1. parse query params
2. pass to service
3. return `ok`, `request_id`, payload

Keep the route thin. Do not place SQL directly in this route file if it can stay in the service.

## Phase 4: Existing draft persistence integration

### Files

- `apps/admin-api/src/services/stockRequestDrafts.js`
- `apps/admin-api/src/routes/stock-request-drafts.js`

### Goal

- keep using the existing request draft flow
- extend it so draft lines may carry recommendation snapshot metadata

### Pattern to mirror

Copy the structure of:

- `apps/admin-api/src/services/stockRequestDrafts.js`
- `apps/admin-api/src/routes/stock-request-drafts.js`

### Functions to implement first

Recommended additions inside the existing draft service:

- load recommendation attachment rows for draft lines
- persist recommendation snapshot payload when lines come from the recommendation page
- keep version-conflict handling unchanged

### Routes to reuse

Keep existing URLs:

- `GET /api/stock-request-draft/me`
- `PUT /api/stock-request-draft/me`
- `DELETE /api/stock-request-draft/me`

### Validation rules to implement early

- branch user can only save draft for own effective branch
- recommendation snapshot fields must be accepted as snapshot data, not recomputed on save
- `requested_*` fields must be validated
- version conflict handling should mirror `stockRequestDrafts.js`

## Phase 5: Existing request submit and admin decision integration

### Files

- `apps/admin-api/src/services/stockRequests.js`
- `apps/admin-api/src/routes/stock-requests.js`

### Goal

- keep using the existing submit/review/decision workflow
- extend request lines so they preserve the recommendation snapshot and comparison state

### Pattern to mirror

Copy structure and sequencing from:

- `apps/admin-api/src/services/stockRequests.js`
- `apps/admin-api/src/routes/stock-requests.js`

### Functions to implement first

Recommended additions inside the existing request service:

- map recommendation-aware line payload into submitted request lines
- persist recommendation attachment rows during submit
- load recommendation attachment rows into request detail responses
- persist admin comparison / override metadata at decision time

### Routes to reuse

Keep existing URLs:

- `POST /api/stock-requests`
- `GET /api/stock-requests/mine`
- `GET /api/stock-requests/incoming`
- `GET /api/stock-requests/incoming/:publicId`
- existing response / submit / acknowledge routes

### Submit path implementation order

1. validate request body and idempotency key
2. load draft if linked
3. insert request header row
4. insert request item rows with recommendation snapshot
5. insert recommendation attachment rows for each submitted line
6. insert event rows
7. mark draft submitted if applicable
8. return submitted request summary

### Decision path implementation order

1. load request + item rows
2. validate admin action payload
3. persist recommendation comparison / override metadata for each affected line
4. update request status to `APPROVED`, `PARTIALLY_APPROVED`, or `REJECTED`
5. insert event rows
6. return final decision summary

## Phase 6: Server wiring

### File

- `apps/admin-api/src/server.js`

### Goal

- mount the new routes in a predictable location

### Imports to add

- `createStockRecommendationsRouter`
- `createStockRecommendationDraftsRouter`
- `createStockRecommendationRequestsRouter`

### Mount order recommendation

Add them near related route families:

1. mount `/api/admin` recommendation read routes near `createMovementAnalyticsRouter`
2. mount `/api` recommendation draft routes near `createStockRequestDraftsRouter`
3. mount `/api` and `/api/admin` recommendation request routes near `createStockRequestsRouter`

Reason:

- keeps operational workflow routes grouped
- reduces surprise when future developers scan `server.js`

## Phase 7: Tests

### Files

- `tests/stock_recommendations_api.test.js`
- `tests/stock_recommendation_drafts_api.test.js`
- `tests/stock_recommendation_requests_api.test.js`

### Test order

1. recommendation list basic response
2. recommendation list branch scoping for staff vs admin
3. recommendation summary KPI response
4. draft save/load/discard
5. submit request with recommendation snapshot
6. admin decision modifies request
7. override reason persistence

### Existing tests to study first

- `tests/branch_stock_routes.test.js`
- `tests/receiptRoutes.test.js`
- `tests/ada_sync_api.test.js`
- `tests/stock_requests_api.test.js` if present in current repo naming

## Reuse-first query checklist

Before writing new SQL, reuse these ideas in this order:

1. sales paid filter and exact date filtering from `movement-analytics.js`
2. branch qty/cost column mapping from `branch-stock.js`
3. receipt grouping source tables from `ordering.js`
4. draft optimistic-version pattern from `stockRequestDrafts.js`
5. request lifecycle and idempotency pattern from `stockRequests.js`

## What not to do in the first implementation

- do not compute recommendation SQL inside route handlers and duplicate it across list/detail/summary
- do not mix recommendation persistence into `ordering.stock_request_*` tables yet
- do not rely on the SC legacy server
- do not over-model donor allocations in SQL before the core recommendation row works
- do not block phase 1 on the real incoming PO allocation matrix

## Minimal viable landing plan

If the team wants the smallest useful landing:

1. create migration
2. build `stockRecommendations.js`
3. expose:
   - `GET /api/admin/stock-recommendations`
   - `GET /api/admin/stock-recommendations/summary`
4. extend existing request draft save/load to accept recommendation snapshot metadata
5. extend existing request submit flow to persist recommendation snapshot metadata
6. extend request detail / review flow to compare recommendation vs request vs decision

That sequence gets the core engine visible quickly while preserving a path to the full dual-surface workflow.

## Scalability / Performance Plan

This feature must assume:

- many thousands of SKUs
- several branches
- one recommendation row per `product x branch`
- donor planning across branches

The system can support this scale, but only if it avoids computing and returning everything in one request.

## Performance principles

### 1. Keep recommendation logic on the backend

Do not send raw stock/sales/receipt data to the frontend and let the browser compute recommendations.

Reason:

- frontend duplication of business logic is hard to trust
- payload size becomes too large
- donor comparison across all branches is better done centrally

### 2. Separate summary, list, and detail

The feature should not use one all-purpose route for everything.

Use three layers:

1. summary layer
   - KPI cards
   - branch-level counts
   - inventory value reduction estimate

2. list layer
   - paginated recommendation rows
   - sorted and filtered

3. detail layer
   - donor explanation
   - deeper reasoning
   - optional request/decision audit

Reason:

- most users do not need donor detail for every row
- separating detail keeps the main list fast

### 3. Always paginate the list route

Recommendation list responses must always be paginated.

Suggested defaults:

- `page = 1`
- `pageSize = 50`

Suggested max page size in phase 1:

- `100`

Reason:

- prevents the API from returning thousands of computed rows in one response
- keeps sort and serialization costs bounded

### 4. Scope by branch whenever possible

Branch-facing usage should compute only the authenticated branch by default.

Admin-facing usage may support:

- one selected branch
- `all` branches in summary mode

But admin list view should still default to one branch or a filtered operational slice, not all detailed rows at once.

Reason:

- branch-scoped queries reduce product-branch combinations dramatically

### 5. Compute donor detail on demand

Do not eagerly compute a full multi-branch transfer plan for every row shown in the list if the UI only needs one line of advice.

Recommended phase 1 behavior:

- list route includes:
  - primary action
  - transfer qty
  - purchase qty
  - one primary donor if available
- detail route computes or expands:
  - full donor ranking
  - donor days cover after transfer
  - alternative donors

Reason:

- donor planning is one of the more expensive parts of the logic

### 6. Reuse one normalized stock shape in memory

When the service loads `ada.branch_stock_snapshots`, normalize wide branch columns once into a branch map structure.

Reason:

- avoids repeatedly branching on raw column names
- simplifies cross-branch donor calculations
- reduces code duplication and accidental complexity

## Query strategy

### Summary route strategy

Route:

- `GET /api/admin/stock-recommendations/summary`

Strategy:

- aggregate at company or branch level only
- do not return row-level donor payload
- prefer one branch-scoped summary query and one all-branches summary mode

Expected cost profile:

- moderate SQL aggregation
- low response size

### List route strategy

Route:

- `GET /api/admin/stock-recommendations`

Strategy:

- compute recommendation rows server-side
- apply branch filter early
- apply search filter early where safe
- sort only on supported computed columns
- paginate before serializing response

Recommended sort set:

- `priority_desc`
- `days_cover_asc`
- `inventory_value_desc`
- `product_code_asc`

Do not allow unlimited arbitrary sort expressions from the client.

### Detail route strategy

Route:

- `GET /api/admin/stock-recommendations/:branchCode/:productCode`

Strategy:

- compute richer donor detail only for one row
- load request/decision state only when needed

Expected cost profile:

- small result size
- acceptable slightly heavier per-row logic

## Phase 1 live-compute strategy

Phase 1 should use live computation, but under tight constraints.

Recommended constraints:

- branch-scoped by default
- paginated list
- limited sort options
- donor detail deferred to detail route
- summary route separate from list route

This is the simplest correct design before any caching or precomputation is added.

## Phase 2 optimization path

If phase 1 proves slow, optimize in this order:

### Step 1: Query tuning

- inspect execution plans
- add or adjust indexes
- reduce avoidable joins
- prefilter branch/product scope earlier

### Step 2: Pre-aggregate sales windows

If live 30d and 90d sold-qty aggregation becomes expensive, create a helper aggregate or refreshable snapshot per:

- `product_code`
- `branch_code`
- `sold_qty_30d`
- `sold_qty_90d`
- `last_refreshed_at`

This can be:

- a physical helper table refreshed after sync
- or a materialized view if the team is comfortable operating it

### Step 3: Cache recommendation summaries

Cache only lightweight summary responses first, such as:

- branch KPI cards
- company KPI cards

Reason:

- summary responses are read frequently
- they are much easier to invalidate safely than full row recommendations

### Step 4: Precompute recommendation snapshots

If needed later, compute recommendation rows in the background after the morning sync and store them in a helper snapshot table.

This is a phase 2 or 3 move, not a phase 1 requirement.

Reason:

- it improves response time
- but increases freshness and invalidation complexity

## Recommended phase 1 indexes to verify

Before blaming the design, verify the existing source indexes are adequate.

Important source areas:

- `ada.sales_headers`
  - branch/date access
- `ada.sales_lines`
  - product access
- `ada.branch_stock_snapshots`
  - product lookup
  - synced_at
- `ada.pending_receipt_headers`
  - branch/date access
- `ada.pending_receipt_lines`
  - product access
- `ada.approved_receipt_headers`
  - branch/date access
- `ada.approved_receipt_lines`
  - product access

If recommendation queries introduce new common filter patterns, add dedicated indexes only after measuring the real need.

## Search behavior plan

Search on the recommendation list should be intentionally narrow.

Recommended searchable fields:

- `product_code`
- `product_name_thai`
- `product_name_eng`
- `barcode`

Recommended behavior:

- empty search should not block the query
- non-empty search should reduce row set before expensive response formatting

Do not try to support fuzzy search, embeddings, or broad unbounded text search in phase 1.

## Response size plan

Keep payloads small enough for routine branch use.

Recommendation:

- list route returns only fields needed for the visible table
- detail route returns donor breakdown and request/decision detail
- do not inline large audit timelines into list responses
- do not inline raw receipt document payloads into recommendation rows

## Freshness plan

Recommendation correctness depends on recent:

- branch stock sync
- sold-qty sync
- incoming receipt sync

Phase 1 plan:

- compute from current live tables at request time
- include `generatedAt`
- optionally include policy/freshness metadata such as:
  - latest stock sync seen
  - latest sales sync seen

Reason:

- helps explain whether the recommendation is based on fresh or stale evidence

## Failure mode plan

If some supporting data is missing:

- missing cost should not block recommendation quantity logic
- missing incoming receipt data should degrade to zero incoming
- zero-sales products should use slow-moving logic
- partial branch data should be flagged, not silently hidden

Recommended response flags:

- `MISSING_COST`
- `NO_INCOMING_DATA`
- `SLOW_MOVING`
- `PARTIAL_BRANCH_COVERAGE`

## What success looks like

Phase 1 is successful if:

- branch users can open recommendations quickly for their own branch
- admin users can review system recommendation versus branch request
- payloads stay bounded
- recommendation rows are explainable
- the backend can handle several thousand SKUs without attempting to dump all detail at once

## UI Placement Spec

### Recommended surface strategy

Required split:

- `order-web`: branch staff action-taking
- `admin-web`: review, approval, override, and cross-branch oversight

Reason:

- branch staff are the ones who request stock from other branches or from CEO
- CEO/admin must compare branch requests with system recommendations before deciding
- both apps must read from the same backend recommendation layer

## Admin-Web UI Spec

### New view name

Suggested view key:

```text
stock-recommendations
```

Suggested label:

```text
คำแนะนำการสั่งสินค้า
```

### Audience

- admin
- HQ reviewers
- CEO / purchasing owner
- branch supervisors if admin-web access is allowed

### Page structure

1. top KPI bar
2. filter/search toolbar
3. recommendation review table
4. branch request vs system recommendation comparison
5. approval / override area
6. optional donor detail drawer or inline expand row

### KPI bar

Display:

- current inventory value
- projected inventory value at target
- potential reduction value
- average days cover
- transfer recommendations count
- purchase recommendations count
- branch requests matching recommendation
- branch requests deviating from recommendation
- admin overrides

### Filters

- branch selector
- action selector
- target days selector
- search box
- toggle: show only urgent
- toggle: include zero-sales items
- toggle: show only branch requests waiting approval
- toggle: show only overrides

### Table columns

- product code
- product name
- branch
- current stock
- incoming PO allocated
- effective stock
- sold 30d
- sold 90d
- days cover
- target qty
- system recommended action
- system transfer qty
- system purchase qty
- branch requested action
- branch requested qty
- admin approved action
- admin approved qty
- priority score
- reason

### Row interaction

Each row should be readable without opening a modal.

Preferred interaction:

- one primary action chip
- one short reason sentence
- optional expand/caret to show donor detail
- approval controls visible inline or in a right-side drawer

Expanded donor detail:

- donor branch
- transferable qty
- donor days cover before transfer
- donor days cover after transfer

### Admin review fields

For each row, admin should be able to see:

- `system says`
- `branch requested`
- `admin approves`

This comparison is central to the feature.

### Admin actions

Admin should be able to:

- accept the branch request as-is
- accept the system recommendation instead
- edit transfer qty
- edit purchase qty
- add override reason
- reject request

### Action chip text

Examples:

- `พอแล้ว`
- `ขอจากสาขา 003 จำนวน 8`
- `สั่งเพิ่ม 12`
- `ขอ 8 และสั่งเพิ่ม 4`
- `ไม่ควรสั่ง เพิ่ม หมุนช้า`

## Order-Web UI Spec

### Recommended placement

Suggested new route or section:

```text
/recommendations
```

or a new tab inside the branch stock / request workflow.

### Audience

- branch staff
- branch manager

### Staff UX principle

The page must be simpler than admin-web.

Staff should not need to interpret raw analytics tables. The UI should present a small number of decisions already computed by the backend.

### Staff page structure

1. branch summary cards
2. recommendation list with default sort by urgency
3. request composer
4. request history / status

### Branch summary cards

- SKUs that need action now
- SKUs recommended for transfer-in
- SKUs recommended for purchase
- current branch days cover
- requests pending CEO/admin approval

### Staff list columns

Keep the staff list compact:

- product code
- product name
- current stock
- days cover
- recommendation
- quantity
- reason

Optional secondary data shown smaller:

- sold 90d
- incoming PO allocated
- donor branch suggested by system

### Staff interaction model

Each row should produce one clear instruction.

Examples:

- `ขอจากสาขา 003 จำนวน 10`
- `สั่งเพิ่ม 6`
- `ยังไม่ต้องสั่ง`

Do not require branch staff to manually compare multiple branches or perform their own calculations.

### Staff action model

For each row, branch staff should be able to:

- accept the recommendation directly
- adjust the requested quantity
- switch from transfer to purchase if needed
- add a short note before submitting

The staff UI should remain simple, but it must still allow deviation from the recommendation.

### Staff request payload concept

When the branch submits, the UI should send:

- recommendation snapshot
- requested action
- requested quantities
- user note

## UX Guardrails

- avoid multi-step planners in phase 1
- avoid forcing users to choose between many possible donor branches unless necessary
- default to the best single recommendation
- always show a short reason sentence
- make the recommendation explainable from visible numbers
- keep branch UX simpler than admin UX
- never hide the difference between recommendation, request, and final approval

## Example Decision Rules

### Example 1: No action

```text
current_stock = 65
incoming = 5
effective_stock = 70
adjusted_adu = 0.7
target_qty = 63
```

Result:

- action = `NO_ACTION`
- reason = `สต๊อกหลังรวม incoming PO สูงกว่าเป้าหมาย 90 วันแล้ว`

### Example 2: Transfer only

```text
shortage_qty = 12
donor_total = 18
```

Result:

- action = `TRANSFER_IN`
- transfer qty = `12`
- purchase qty = `0`

### Example 3: Purchase only

```text
shortage_qty = 9
donor_total = 0
```

Result:

- action = `PURCHASE`
- purchase qty = `9`

### Example 4: Transfer and purchase

```text
shortage_qty = 20
donor_total = 7
```

Result:

- action = `TRANSFER_AND_PURCHASE`
- transfer qty = `7`
- purchase qty = `13`

## Future Extension Points

The following pieces should be designed as replaceable modules:

- incoming PO allocation logic
- demand adjustment / seasonality logic
- donor ranking logic
- quantity rounding logic
- safety stock policy

## Open Questions

These are unresolved and should not block phase 1 design:

1. Which receipt/PO state should count as incoming for recommendations?
2. Which branches are active for equal incoming split?
3. Should target days be global or branch-specific later?
4. Should some SKUs be excluded from transfer recommendation?
5. Should branch users see one donor only or multiple donor options?

## Recommended Build Order

1. backend recommendation engine contract
2. backend recommendation list endpoint
3. backend branch request submission endpoint
4. backend admin decision endpoint
5. admin-web review and override page
6. order-web branch-facing request page
7. replace equal incoming split with real allocation matrix

## Non-Goals

This engine does not try to fully automate procurement in phase 1. It is a recommendation layer that improves branch decisions using the stock and sales data already present in the system.
