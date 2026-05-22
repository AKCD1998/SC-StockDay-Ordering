# Session Summary — 2026-05-22 — Receipt Sync, Production Fixes, and Viewer-vs-Owner Branch Logic

## Overview

Full-day session across two machines (mother PC + development PC running Claude Code).
Work covered: building the approved-receipts feature, diagnosing and fixing four production
bugs, wiring `core.branches` derivation, and implementing viewer-vs-owner branch filtering
so branch 005 users can see HQ (branch 000) purchase receipts.

---

## Part 1 — Mother PC: Approved Receipts Feature Build (Prompt 3)

Committed as **`4f8197d`** on `AKCD1998/SC-StockDay-Ordering`.

### Files changed (8)

| File | Change |
|---|---|
| `apps/adapos-sync/src/queries.js` | `getTodayApprovedReceiptHeaderRows` + `getTodayApprovedReceiptLineRows` — SELECT-only, `FTXihStaPrcDoc='1'` AND today's date filter. Uses verified TACTPiDT columns. |
| `apps/adapos-sync/src/transform.js` | `toApprovedReceiptPayload(hdRows, dtRows)` → headers with nested `lines[]`. |
| `apps/adapos-sync/src/index.js` | Imports + `approved_receipts` dataset + POST to `/api/sync/ada/approved-receipts`. |
| `apps/adapos-sync/.env.example` | Appended `approved_receipts` to `ADAPOS_SYNC_DATASETS`. |
| `server/db/migrations/004_approved_receipts.sql` | `ada_approved_receipt_headers` + `ada_approved_receipt_lines` tables + indexes. |
| `server/src/routes.js` | `POST /api/sync/ada/approved-receipts` + `GET /api/admin/approved-receipts`. |
| `server/src/repositories/postgresRepository.js` | `ingestApprovedReceipts` (UPSERT header, delete+reinsert lines) + `getApprovedReceipts`. |
| `server/src/repositories/mockRepository.js` | Stubs for both new methods. |

### Strategy contrast
- **Pending** receipts (migration 003): DELETE-all-then-INSERT per branch (replace semantics).
- **Approved** receipts (migration 004): UPSERT header ON CONFLICT, delete+reinsert lines per doc (accumulate semantics).

### Local verification (all passed)
- Migration 001→004 applied cleanly to `sc_drug_db`.
- Dry-run `--branch=005 --datasets=approved_receipts`: 0 rows (none approved today under 005) — correct.
- `GET /api/admin/approved-receipts?branchCode=005` → `{ ok:true, records:[] }`.
- Mock POST `AR-TEST-001` → stored + returned with all fields, then deleted.
- All 6 `ada_*` tables confirmed in `sc_drug_db`.

---

## Part 2 — Mother PC: Why Production Showed Empty

Production admin site queried branch 005. HQ purchase/receiving documents live under
`branch_code='000'` in AdaAcc. Querying 005 correctly returned nothing.

Dry-run `--branch=000 --datasets=pending_receipts,approved_receipts` confirmed real data:
- `pending_receipt_headers`: **12 rows**, `pending_receipt_lines`: **20 rows**
- `approved_receipt_headers`: 0 (none approved yet that day)
- Sample: `PR00026-001731`, supplier "บริษัท รอแยล-ดี (ไทยเเลนด์) จำกัด", dated 2026-05-22

**Key distinction:** `sc_drug_db` (SC-StockDay-Ordering local server) and the
paasrtsm production database are separate. Production needs its own ingest.

### Production 500 blocker (paasrtsm side)
`--execute --branch=000` against `https://paasrtsm-project.onrender.com`:
- `POST /api/sync/ada/pending-receipts` → **HTTP 500**
- `request_id: 14e56883-93cf-4c2a-aadf-075754f928f4`
- Nothing written; agent aborted cleanly

Root cause later confirmed: two separate bugs in the paasrtsm backend (see Part 3).

---

## Part 3 — Claude Code Session: Four Production Bug Fixes on PaaSRTSM

All fixes committed to `AKCD1998/PaaSRTSM-project`.

### Bug 1 — PostgreSQL 42703: `h.synced_at` column does not exist (commit `974e6ed` area)

**File:** `apps/admin-api/src/routes/ordering.js`

`getPendingReceipts` and `getApprovedReceipts` both selected `h.synced_at`.
The actual column in `ada.pending_receipt_headers` and `ada.approved_receipt_headers`
is `source_synced_at`. Fixed with alias:

```sql
-- before
h.synced_at

-- after
h.source_synced_at AS synced_at
```

Applied to both queries. Verified live — both endpoints returned 200 after deploy.

### Bug 2 — Spurious `lineBranchCode` validation (commit `974e6ed`)

**File:** `apps/admin-api/src/routes/sync-ada.js`

`replacePendingReceipts` required `FTBchCode/branchCode` on every line.
`ada.pending_receipt_lines` has no `branch_code` column and the adapos-sync agent
correctly omits branchCode from line objects. Validation was architecturally wrong.

Fixed by removing the `lineBranchCode` check from the line loop entirely.
This was the direct cause of the `request_id 14e56883` 500.

### Bug 3 — `ADAPOS_SYNC_API_BASE_URL` defaulted to localhost

**File:** `apps/adapos-sync/src/config.js` (mother PC `.env`)

Sync agent defaulted to `http://localhost:4000`. Data was going to the local
`sc_drug_db` tables (`public.ada_*`) instead of the paasrtsm production database.

Fixed by setting `ADAPOS_SYNC_API_BASE_URL=https://paasrtsm-project.onrender.com`
in `apps/adapos-sync/.env` on the mother PC.

**Result after fix:** Mother PC re-ran sync → **29 headers + 48 lines accepted**.
Production `ada.pending_receipt_headers` confirmed populated via browser.

---

## Part 4 — Viewer-vs-Owner Branch Filtering (commit `cceef38`)

### Problem
Branch 005 users queried their own `branchCode=005`. All 29 synced receipts
live under `branch_code='000'` (HQ). Result: always empty for branch viewers.

### Design decision
- Receipt `branch_code` stays as the real owner — never overwritten.
- Viewer's branch determines scope, not ownership.
- HQ branches identified by `core.branches.is_hq = true` — no hardcoding of `'000'`.

### SQL change — both `getPendingReceipts` and `getApprovedReceipts`

```sql
-- before
WHERE h.branch_code = $1

-- after
WHERE (
  h.branch_code = $1
  OR h.branch_code IN (SELECT branch_code FROM core.branches WHERE is_hq = true)
)
```

Pending receipts additionally wraps with null-guard:
```sql
WHERE ($1::text IS NULL OR (
  h.branch_code = $1
  OR h.branch_code IN (SELECT branch_code FROM core.branches WHERE is_hq = true)
))
```

### Test added — `tests/receipt_routes.test.js`

New test: `viewer-vs-owner: branch 005 viewer sees own receipts plus HQ receipts`

Asserts:
- `branchCode=005` returns both branch 005 and HQ (000) records
- `record.branchCode` on HQ records remains `"000"` — not overwritten
- `branchCode=000` returns only HQ records (no cross-contamination)
- Same logic verified for approved receipts

Mock updated with `hqBranches: new Set(["000"])` in state.

---

## Part 5 — `core.branches` Derivation Was Never Called (commit `ab3f828`)

### Root cause
`ada.refresh_foundations()` is the PostgreSQL function (defined in migration 016)
that populates `core.branches` from `ada.branches` with:
```sql
branch_code = '000' AS is_hq
```
This function existed but was never called anywhere in the application code.
`core.branches` remained empty, so the viewer-vs-owner subquery always returned
nothing — branch 005 still saw no data even after the SQL change.

### Fixes
1. **`apps/admin-api/src/routes/sync-ada.js`** — `/branches` route now calls
   `ada.refresh_foundations()` after each commit (non-fatal if it fails).
2. **`migrations/021_seed_core_branches_from_ada.sql`** — one-time migration that
   seeds `core.branches` from current `ada.branches` data.

**To apply on production:** Run `node scripts/db_migrate.js` from the Render shell.

---

## Part 6 — Frontend Field Name Mismatch in ReceiptCard (commit `390e501`)

**File:** `apps/admin-web/src/App.jsx`

`ReceiptCard` used snake_case field names (`record.doc_no`, `ln.product_code`,
`ln.expired_date`, etc.) but the API returns camelCase (`record.docNo`,
`ln.productCode`, `ln.expiredDate`, etc.). Amounts and qty rendered correctly
because `record.grand` and `ln.qty` happen to be the same in both conventions.
All text fields showed `"-"`.

Fixed all 15 field references in `ReceiptCard` and the sort comparator:

| Was | Fixed to |
|---|---|
| `record.doc_no` | `record.docNo` |
| `record.supplier_name / supplier_code` | `record.supplierName / supplierCode` |
| `record.doc_date / doc_time` | `record.docDate / docTime` |
| `ln.seq_no` | `ln.seqNo` |
| `ln.product_code / product_name` | `ln.productCode / productName` |
| `ln.unit_name / unit_code` | `ln.unitName / unitCode` |
| `ln.set_price` | `ln.setPrice` |
| `ln.lot_no` | `ln.lotNo` |
| `ln.expired_date` | `ln.expiredDate` |

---

## Part 7 — Logout Freeze Fix (commit `9c65359`)

**File:** `apps/admin-web/src/App.jsx`

`loading` state was never reset in `handleLogout`. If `loadDashboard()` was still
running when logout fired, React's effect cleanup set `active = false`, which
prevented `setLoading(false)` from running inside the `finally` block. After
`setSession(null)`, `loading` stayed `true` and the app rendered the
"กำลังตรวจสอบเซสชัน..." screen with no path out.

Fix: added `setLoading(false)` to `handleLogout`'s `finally` block.

---

## Commit Map

| Commit | Repo | Description |
|---|---|---|
| `4f8197d` | SC-StockDay-Ordering | feat: approved purchase receipts today panel (Prompt 3) |
| `974e6ed` | PaaSRTSM-project | fix: synced_at → source_synced_at + remove spurious line branchCode check |
| `cceef38` | PaaSRTSM-project | feat: viewer-vs-owner branch filtering for receipts |
| `ab3f828` | PaaSRTSM-project | fix: populate core.branches after branch sync |
| `9c65359` | SC-StockDay-Ordering | fix: reset loading on logout to prevent frozen session-check screen |
| `390e501` | SC-StockDay-Ordering | fix: camelCase field names in ReceiptCard |

---

## Open Items

1. **Run migration 021 on production** via Render Shell:
   ```
   node scripts/db_migrate.js
   ```
   This seeds `core.branches` so branch 005 users see HQ receipts.

2. **Mother PC sync agent** should re-run with `--branch=000 --datasets=pending_receipts,approved_receipts`
   after migration 021 is applied to confirm end-to-end data flow is clean.

3. **Sync agent `isHq: false` hardcode** — `apps/adapos-sync/src/index.js` line 161 still
   sends `isHq: false` for all branches. This is harmless now because `ada.refresh_foundations()`
   derives `is_hq` from `branch_code = '000'` and ignores what the agent sends.
   But it should be corrected for clarity.

4. **Receipt data is supplier purchase receipts from `TACTPiHD/TACTPiDT`** — this is NOT
   the inter-branch transfer reconciliation (Type 7 from `TCNTPdtTnfHD`). The 91.7%
   unprocessed transfer problem remains a separate future workstream.

---

## Architecture Notes

### Two separate receipt namespaces
| Namespace | Tables | Populated by | Purpose |
|---|---|---|---|
| `public.ada_*` | `ada_pending/approved_receipt_*` | SC-StockDay-Ordering local server | Local dev / `sc_drug_db` |
| `ada.*` | `pending/approved_receipt_headers/lines` | PaaSRTSM production backend | Production site |

Both share the same physical Postgres cluster but different schemas.
The adapos-sync agent targets one or the other based on `ADAPOS_SYNC_API_BASE_URL`.

### Viewer-vs-owner model
- Receipt `branch_code` = owner branch (immutable, set at ingest time)
- Query `branchCode` param = viewer branch (determines scope)
- Viewer sees: own receipts + all receipts where `core.branches.is_hq = true`
- HQ viewers see only their own receipts (HQ is already in the HQ set)
- Future branches (001, 002, 003, 004) inherit same behavior with no code change
