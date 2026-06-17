# Session — 2026-06-16 — Branch Stock Sync Fixes

Three related fixes to the branch-stock sync pipeline, landed 2026-06-15 → 2026-06-16.
All three are about making per-branch stock numbers **correct and isolated** so one
branch's nightly sync can no longer corrupt another branch's data.

| Commit | Date | Title |
|---|---|---|
| `8f41124` | 2026-06-15 | fix(stock): use retail on-hand (FCPdtQtyRet) as counted stock value |
| `0bd1b34` | 2026-06-16 | fix: isolate branch stock sync updates per branch |
| `5a2f90c` | 2026-06-16 | fix: handle unknown cost values in branch stock records |

---

## Fix 1 — Wrong stock source: คงเหลือล่าสุด (ประมาณ) → คงเหลือ (ขายปลีก)

**Commit:** `8f41124`

### Problem
`currentStock` was being read from the **approximate running estimate** instead of the
**retail on-hand count**, so the number shown did not match what the other branches use.

| Thai label | AdaPOS field | DB column | Role |
|---|---|---|---|
| คงเหลือล่าสุด (ประมาณ) | `FCPdtQtyNow` | `stock_current` | Running estimate — **was being used (wrong)** |
| คงเหลือ (ขายปลีก) | `FCPdtQtyRet` | `stock_retail` | Retail on-hand count — **should be used (correct)** |

### Fix
Switched the read source for `currentStock` to the retail on-hand value.

- `server/src/repositories/postgresRepository.js`: `p.stock_retail AS stock_current`
  (aliased so nothing downstream had to change).
- `server/src/repositories/mockRepository.js`: `currentStock: product.stockRetail`.

The sync still **stores** all three stock columns (current / retail / warehouse);
only the column we **read** for `currentStock` changed.

---

## Fix 2 — One branch's sync was zeroing out other branches (items showing 0)

**Commit:** `0bd1b34` — the most important fix.

### Problem
The old sync built one **wide** record per product containing a column for *every*
branch (`qty_branch_000` … `qty_branch_005`). Branches that were not the one syncing
got sent as **fake zeroes**. So when, say, Branch 005 ran its nightly sync, it
overwrote Branch 001/002/003/004 quantities with `0` — i.e. items appeared as **0 stock**.

### Fix
Reworked the flow so a sync describes **exactly one branch**:

- `apps/adapos-sync/src/transform.js` — `toBranchStockRecords(rows, branchCode)` now emits
  a single `qty` / `costAvg` per product for **that branch only** (no fake-zero columns
  for the others). Added a `BRANCH_STOCK_SYNC_BRANCHES` whitelist (`000`–`005`) that
  throws on an unknown branch code.
- `apps/adapos-sync/src/index.js` — the branch code is sent **explicitly at the top level**
  of the request body (`postBatches(..., { branchCode })`), not inferred from row contents.
- `server/src/routes.js` — `validateAndNormalizeBranchStockRecords` now **requires** a
  top-level `branchCode`, validates it against the same whitelist, and **rejects payloads
  that mix branch identities** (a per-record branch must match the top-level one). The old
  wide shape is still accepted as a fallback for older agents.
- The server's `ingestBranchStockSnapshots(branchCode, records)` updates only that one
  branch's column.
- Added a test suite: `server/src/tests/branchStock.test.js` to lock the behavior in.
- Marked the global product-master stock fields (from `TCNMPdt`) as **LEGACY / APPROXIMATE**
  in comments — they are not branch-level truth; `branch_stock_snapshots`
  (`/api/branch-stock`) is.

---

## Fix 3 — Unknown cost overwriting saved cost with 0

**Commit:** `5a2f90c`

### Problem
When a product's cost was unknown, the transform sent `Number(cost_avg ?? 0)` = `0`.
The server's `COALESCE` then treated that real `0` as a valid value and **overwrote the
previously stored cost with a fake zero**.

### Fix
`apps/adapos-sync/src/transform.js` now sends `null` (not `0`) when cost is unknown, so the
server's `COALESCE` **keeps the existing stored cost** instead of clobbering it.
Also tightened `qty` to `Number(row.qty || 0)`.

---

## Plain-language summary

- **Stock showed 0 for items** — caused by one branch's sync wiping the other branches'
  numbers to zero. Now each branch only writes its own column. (Fix 2)
- **Cost showed 0** — caused by unknown costs being written as zero. Now unknown cost is
  left untouched. (Fix 3)
- **Stock number was the wrong one** — it came from the approximate estimate
  (คงเหลือล่าสุด ประมาณ) instead of the retail on-hand (คงเหลือ ขายปลีก). Now it uses the
  correct retail value. (Fix 1)

## Rolling out to a branch PC
On each branch's cashier PC: `git pull` on `main`, confirm
`apps/adapos-sync/.env` → `ADAPOS_SYNC_BRANCH_CODE` matches that branch, run the server
test suite, then let the next nightly sync run normally.
