# Session 2026-07-12 — Focus Products (สินค้าโฟกัส) feature

New dashboard feature: admin sets monthly sales targets per product across four categories, and every logged-in account sees live progress computed from real AdaPOS sales data. Built end-to-end in this session — schema, backend, frontend, performance fixes, and July 2026 data entry for all four branches.

---

## 1. What it does

Admin defines a **focus product**: a product code, a target quantity, a date range (typically one month), and which of four types it is:

| Type | Success rule |
|---|---|
| **โฟกัสรายคน** (salesperson) | One combined target, summed across branches 001/003/004/005. |
| **โฟกัสเภสัชกร** (pharmacist) | Each branch has its own target, judged independently — no combined verdict. |
| **โฟกัสผู้จัดการหน้าร้าน** (store_manager) | Same as pharmacist — per-branch, independent. |
| **โฟกัสผู้จัดการกลุ่ม** (group_manager) | Each branch can have its own target, but success requires **every** branch to independently clear its own number. |

Every account (`admin`/`staff`/`branch`) can view the page; only `admin` can create/edit/delete. Staff accounts (`staffXXX`) only see their own branch's columns in the pharmacist/store_manager tables — salesperson and group_manager stay company-wide for everyone.

Sold-qty progress is **never stored** — it's computed live from `ada.sales_lines`/`ada.sales_headers` on every read, filtered to the row's own date range. The one exception: once a row's `date_to` has passed, progress **freezes** automatically on the next read, so later AdaPOS corrections (voids/refunds synced after month-end) can't rewrite a month's historical HR-record numbers.

---

## 2. Backend (PaaSRTSM-project)

### Schema — `focus.focus_products`

| Column | Purpose |
|---|---|
| `product_code`, `focus_type`, `target_qty`, `date_from`, `date_to` | Core target definition (migration 045) |
| `branch_codes` | Which branches this row applies to; `NULL` = all active branches |
| `assigned_person_name` | Free-text employee name for salesperson rows — hardcoded until an HR/employee system exists (migration 046) |
| `frozen_sold_by_branch`, `frozen_total_sold`, `frozen_at` | Snapshot written once `date_to` has passed (migration 046) |
| `branch_targets` (jsonb) | `{branchCode: targetQty}` override — lets pharmacist/store_manager/group_manager rows have a different target per branch. `0` is a valid value meaning "not set yet" (migrations 049→051 renumbered, 046 validation relaxed later) |

Migrations: `045_add_focus_products.sql`, `046_add_focus_products_person_and_freeze.sql`, `051_add_focus_products_branch_targets.sql`, `052_add_ada_sales_headers_doc_date_index.sql` (superseded), `053_add_ada_sales_covering_indexes.sql` (the real perf fix).

### Service — `apps/admin-api/src/services/focusProducts.js`

- `listFocusProducts` / `createFocusProduct` / `updateFocusProduct` / `deactivateFocusProduct`
- `attachProgress` computes live sold-qty for every row in one batched query per distinct date range (not one query per row — see §4), applies the freeze-on-read logic, and returns `soldByBranch`, `totalSold`, `achieved`, `branchAchieved`, `branchTargetsEffective`, `isFrozen`.
- `computeStatus` implements the four types' differing success rules described above.
- `GET /api/focus-products?debug=1` returns a `timings` array breaking down each query phase — added during the perf investigation, harmless to leave in.

### Routes — `apps/admin-api/src/routes/focus-products.js`

- `GET /api/focus-products` — any authenticated account, active rows only.
- `GET/POST/PATCH/DELETE /api/admin/focus-products[...]` — admin + CSRF only. `DELETE` is a soft-delete (`is_active = false`).

---

## 3. Frontend (SC-StockDay-Ordering/apps/admin-web)

`FocusProductsPanel.jsx`, wired into the Dashboard nav group (`App.jsx`, view key `focus-products`).

- **Year calendar**: `‹ [year] ›` header + 12 month cards. Each card shows colored pills for whichever focus types have a product overlapping that month (date-range overlap, not just start month), or "ยังไม่มี" if none. Clicking a month reveals the detail section below.
- **Four table components**, one per focus type, each mirroring the source Excel layouts the business actually uses:
  - `SalespersonFocusTable` — purple Excel banner, ลำดับ/เป้ารายคน/รหัสสินค้า/จำนวน(เป้า)/สินค้าโฟกัส/ยอดสาขา×4/รวม.
  - `BranchTargetFocusTable` (pharmacist/store_manager) — one เป้า/ขาย column pair per branch, colored green/red per branch's own pass/fail. Accepts `restrictToBranch` to scope down to one branch for staff accounts.
  - `GroupManagerFocusTable` — purple banner + pill tabs (per branch + "รวมทั้งหมด"); target/ยอดล่าสุด/สถานะ swap based on the selected tab. "รวมทั้งหมด" shows the summed target, total sold, and the true all-branches-must-succeed verdict.
- **Fullscreen modal**: clicking any section expands it full-screen (click backdrop or ✕ to close); `table-layout: fixed` + text wrapping scoped to the modal so long Thai product names don't force a horizontal scrollbar.
- **Loading overlay**: full-panel overlay with a simulated progress bar that climbs to 90% while waiting and only jumps to 100% on genuine completion — every transition (start/end/unmount) clears any existing timer first, so it can't get stuck mid-progress.
- **Admin form**: product search (debounced against `/api/products/search`), focus type, target, date range, branch checkboxes, per-branch target grid (pharmacist/store_manager/group_manager), assigned-person field (salesperson only), note.

---

## 4. Performance investigation

The sold-qty query hung production entirely at one point, then stayed at 20-30+ seconds after a partial fix. Root-caused with `EXPLAIN (ANALYZE, BUFFERS)` run directly against production (user shared a temporary read connection string):

1. **N+1 queries** — the first version issued one query per focus row instead of batching by date range. Fixed by grouping rows into one `WHERE product_code = ANY($1::text[])` query per distinct date range.
2. **JSONB filter defeats plain indexes** — `raw_payload->>'FTShdStaPaid'` etc. can't be pushed into a normal btree index, so Postgres heap-fetched and evaluated the filter per row regardless of which index it started from. Fixed with a **partial index** whose predicate matches the query's filter exactly (`idx_ada_sales_headers_paid_doc_date`) — turned into an index-only scan with zero heap fetches.
3. **Wrong index column order** — `ada.sales_lines`'s existing unique index has `line_no` between `doc_no` and `product_code`, so a query constraining `branch_code`+`doc_no`+`product_code` (not `line_no`) couldn't seek directly; it scanned every line of every matching receipt. Fixed with a dedicated `(branch_code, doc_no, product_code)` index.

Combined effect: **~26-30s → ~2.9-3.7s** on the real 26-row/one-month query. See migration `053` and the ADA sales query perf memory for the general lesson (applies to any future query against these tables).

---

## 5. Data entered (July 2026 / กรกฎาคม 2569)

All sourced from the business's real Excel workbooks (`โฟกัสปี69.xlsx` and `โฟกัสปี69(1).xlsx`), transcribed sheet-by-sheet per branch and confirmed with the user before writing. All four branches (001/003/004/005) now have real targets across every focus type as of end of session:

- **Salesperson** (7 rows, ids 6-12) — shared/global, one combined target across all 4 branches, with `assigned_person_name` set.
- **Pharmacist** (6 products, ids 21-26) — per-branch targets via `branchTargets`.
- **Store manager** (8 products, ids 13-20) — per-branch targets via `branchTargets`. Two line items in the source sheets bundle two product codes under one shared target (IC-002462+IC-005185, IC-004754+IC-004755) — only the first code was seeded per row, the paired code is recorded in `note` since the schema is one-product-per-row.
- **Group manager** (5 products, ids 1-5) — per-branch targets via `branchTargets`; confirmed with the user that branch 003's targets are intentionally identical to branch 001's (not a copy-paste artifact, unlike some sheets' stale month-label text which *was* an unedited copy-paste leftover).

---

## 6. Notable friction / lessons

- **Two agents, one working directory.** Codex runs concurrently in this exact `PaaSRTSM-project` checkout on an unrelated "stock recommendation workflow" feature. This caused a migration filename collision **twice** in one session (047 renumbered to 049, then 049 collided again and became 051) and one commit that swept up this session's uncommitted changes as a side effect of a broad `git add`. Always re-check the latest migration number immediately before creating a file *and* again immediately before pushing.
- **PaaSRTSM-project needs a Manual Deploy click every single push** — no `render.yaml`, no auto-deploy. `SC-StockDay-Ordering`'s admin-web *does* auto-deploy. Several rounds of "it's still broken" were actually "the fix hasn't been deployed yet."
- **`PATCH .../branchTargets` replaces the whole object, it does not merge.** Every patch to add one branch's target had to include all previously-set branches' overrides too, or they'd silently get dropped.
- **Don't trust a sheet's title text at face value** — staff copy-paste Excel templates without editing header text (wrong month shown on a sheet that was actually for July), but the row data itself (codes, quantities) was reliable. When something looks suspicious (e.g. one branch's targets exactly matching another's), ask before assuming either way.
