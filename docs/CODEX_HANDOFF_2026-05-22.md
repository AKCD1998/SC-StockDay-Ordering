# Codex Handoff — SC-StockDay-Ordering (2026-05-22)

This document is the authoritative context for the next Codex session.
Read it fully before touching any file.

---

## What this project is

**SC-StockDay-Ordering** — a Node.js/React/PostgreSQL web app that bridges the
AdaSoft POS system (AdaAcc SQL Server 2008 R2) with a modern admin dashboard.

| Layer | Tech | Location |
|---|---|---|
| Backend API | Express (ESM) | `server/` |
| Admin UI | React + Vite (plain CSS, no Tailwind) | `apps/admin-web/` |
| Order UI | React + Vite | `apps/order-web/` |
| Sync agent | Node.js CLI | `apps/adapos-sync/` |
| Database | PostgreSQL (Render `sc_drug_db`) | Render-hosted |

---

## What was built in this session (2026-05-22)

### Prompts 1 + 2 — Pending purchase receipts (done earlier)
- AdaAcc source tables: `TACTPiHD` (119 cols) + `TACTPiDT` (89 cols)
- `FTXihStaPrcDoc IS NULL` = pending/รออนุมัติ
- Sync agent reads, POSTs to `POST /api/sync/ada/pending-receipts`
- Postgres tables: `ada_pending_receipt_headers` + `ada_pending_receipt_lines`
- Ingest strategy: **DELETE branch rows → INSERT fresh** (replace, because approved docs disappear)
- Migration: `server/db/migrations/003_pending_receipts.sql`

### Prompt 3 — Approved receipts today (commit `4f8197d`)
- `FTXihStaPrcDoc = '1'` AND `CAST(FDXihDocDate AS DATE) = CAST(GETDATE() AS DATE)`
- Sync agent: dataset `approved_receipts` in `apps/adapos-sync/src/`
- Postgres tables: `ada_approved_receipt_headers` + `ada_approved_receipt_lines`
- Ingest strategy: **UPSERT headers, DELETE+reinsert lines per doc** (accumulate)
- Migration: `server/db/migrations/004_approved_receipts.sql`
- API: `POST /api/sync/ada/approved-receipts`, `GET /api/admin/approved-receipts?branchCode=&date=`

### Prompt 4 — Admin UI two-panel (commits `abcb0c4`, `9c65359`, `390e501`)
- `apps/admin-web/src/App.jsx` now has a view switcher: `dashboard` | `receipts`
- `PurchaseReceiptsPanel` component with two tabs:
  - **Tab 1**: 📋 รออนุมัติ (pending)
  - **Tab 2**: ✅ รับของวันนี้ (approved today, with date picker)
- `ReceiptCard` component: expandable header+lines, highlights expired rows in red
- API field names used in frontend: **camelCase** (`docNo`, `supplierName`, `docDate`,
  `productCode`, `productName`, `unitName`, `setPrice`, `lotNo`, `expiredDate`)
  ← Fixed in `390e501` after initial snake_case bug
- `branchCode` comes from `import.meta.env.VITE_BRANCH_CODE || "005"`

---

## Current API endpoints (all on `/`)

### Sync ingestion (from adapos-sync agent → server)
| Method | Path | Body |
|---|---|---|
| POST | `/api/sync/ada/pending-receipts` | `{ branchCode, records: [...] }` |
| POST | `/api/sync/ada/approved-receipts` | `{ branchCode, records: [...] }` |
| POST | `/api/sync/ada/transfers` | (existing) |

### Admin reads (from admin-web UI → server)
| Method | Path | Returns |
|---|---|---|
| GET | `/api/admin/pending-receipts?branchCode=` | `{ ok, records: [{ docNo, supplierName, ..., lines:[...] }] }` |
| GET | `/api/admin/approved-receipts?branchCode=&date=YYYY-MM-DD` | same shape |
| GET | `/api/admin/stock-day` | existing |
| GET | `/api/admin/order-requests` | existing |
| GET | `/api/admin/sync-status` | existing |

### Response shape (camelCase — from `postgresRepository.getApprovedReceipts`)
```js
{
  docNo, branchCode, docType, docDate, docTime,
  supplierCode, supplierName, refExt, refExtDate,
  warehouseCode, total, vat, grand,
  usrCode, createdBy, createdAtAda, staDoc, staPrcDoc,
  syncedAt,
  lines: [{
    seqNo, productCode, productName, barcode,
    unitCode, unitName, factor, qty, qtyBase, stockFactor,
    setPrice, net, vat, costIn, lotNo, expiredDate, warehouseCode
  }]
}
```
Note: `getPendingReceipts` and `getApprovedReceipts` in postgresRepository spread
`headerRes.rows` directly — the pg driver returns snake_case column names.
The camelCase mapping ONLY happens inside the repository's `map()` call.
Check `postgresRepository.js` carefully — if it spreads raw rows (`...h`)
then frontend must use snake_case. If it maps explicitly, use camelCase.

---

## Postgres DB — all 6 `ada_*` tables

| Table | Purpose |
|---|---|
| `ada_transfer_headers` | Inter-branch stock transfers (header) |
| `ada_transfer_lines` | Transfer line items |
| `ada_pending_receipt_headers` | TACTPiHD WHERE StaPrcDoc IS NULL |
| `ada_pending_receipt_lines` | TACTPiDT for pending docs |
| `ada_approved_receipt_headers` | TACTPiHD WHERE StaPrcDoc='1', today |
| `ada_approved_receipt_lines` | TACTPiDT for approved docs |

All 6 tables confirmed present on Render `sc_drug_db` (migration 001–004 applied).

---

## Things to POLISH — Codex task list

### 🔴 P1 — vite proxy missing (local dev broken for receipts panel)
`apps/admin-web/vite.config.js` has no proxy. `apiFetch()` calls fail with CORS
when running `vite dev` + separate Express on `:4000`. Fix:

```js
// apps/admin-web/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:4000",
      "/admin": "http://localhost:4000",
    },
  },
});
```

### 🔴 P1 — Verify camelCase vs snake_case in repositories
`390e501` fixed the frontend to use camelCase. Confirm that `postgresRepository.js`
`getPendingReceipts` and `getApprovedReceipts` actually return camelCase (explicit map)
and not raw pg rows (snake_case). If they spread raw rows, either:
- Add explicit camelCase mapping to the repository, OR
- Revert frontend to snake_case
One must be consistent. Check and fix if needed.

### 🟡 P2 — `VITE_BRANCH_CODE` not documented
`apps/admin-web/.env.example` is missing `VITE_BRANCH_CODE`. Add:
```
VITE_BRANCH_CODE=005
```
Also consider: a branch selector dropdown in the UI so admin can switch between
branches 000, 001, 003, 004, 005 without rebuilding. (Branch 000 = HQ, has most
purchase receipts.)

### 🟡 P2 — Production deployment of admin-web unclear
Currently `server/src/index.js` has NO `express.static()`. The admin-web is
either only local or on a separate Render Static Site. To wire it up properly:

**Option A (serve from Express — one Render service):**
1. Add to root `package.json` a `"build"` script:
   `"build": "vite build -c apps/admin-web/vite.config.js --outDir ../../dist/admin-web --root apps/admin-web"`
2. In `server/src/index.js` after the routes middleware:
   ```js
   import { fileURLToPath } from "url";
   import path from "path";
   const __dirname = path.dirname(fileURLToPath(import.meta.url));
   const distPath = path.resolve(__dirname, "../../dist/admin-web");
   app.use(express.static(distPath));
   app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
   ```
3. Set Render Start Command to: `npm run build && npm run start -w server`
4. Set Render env var: `VITE_API_BASE_URL=` (empty — same-origin in production)

**Option B (separate Render Static Site):**
- Build Command: `npm run build -w apps/admin-web`
- Publish Directory: `apps/admin-web/dist`
- Env var: `VITE_API_BASE_URL=https://YOUR-API.onrender.com`

### 🟡 P2 — `.gitignore` needs updating
Currently `.codex-*.log` files are committed (should be ignored).
Add to `.gitignore`:
```
.codex-*.log
.codex-*.err.log
output/
SESSION_SUMMARY_*.md
```

### 🟢 P3 — Branch selector UI
The receipts panel hardcodes `branchCode` from env. A simple `<select>` at the
top of `PurchaseReceiptsPanel` with options for all 6 branches would make the
admin dashboard much more useful. Branch list from AdaAcc:
| Code | Name |
|---|---|
| 000 | สำนักงานใหญ่ (HQ) — most purchase receipts here |
| 001 | สาขาที่ 1 |
| 002 | สาขาที่ 2 |
| 003 | สาขาที่ 3 |
| 004 | สาขาที่ 4 |
| 005 | สาขาที่ 5 (pilot branch) |

### 🟢 P3 — Sync status badge for receipts
The main dashboard has a sync status card. Add a small "Last synced: X minutes ago"
badge to the receipts panel header, reading from the synced_at column of the
most recent record.

---

## Known production blocker (separate repo — cannot fix here)

The production site reads from `paasrtsm-project.onrender.com` (a separate repo:
`PaaSRTSM-project`). When the adapos-sync agent POSTs pending/approved receipts
to that backend, it returns HTTP 500 with `request_id: 14e56883-93cf-4c2a-aadf-075754f928f4`.

**Root cause**: The paasrtsm backend either:
1. Does not have the pending/approved receipt migration applied, OR
2. Has a different ingest endpoint/payload shape

**Fix belongs in the PaaSRTSM-project repo**, not here.
This repo's backend (`sc_drug_db`) works correctly — all 5 local tests passed.

---

## How to run locally

```bash
# Terminal 1 — backend (with Render postgres)
DATABASE_URL="postgresql://sc_drug_db_user:..." DATA_MODE=postgres npm run dev:server

# Terminal 2 — admin UI
npm run dev:admin
# → opens http://localhost:5173

# Terminal 3 — sync agent (dry-run, branch 005)
node apps/adapos-sync/src/index.js --dry-run --branch=005 --datasets=pending_receipts,approved_receipts

# Terminal 3 — sync agent (execute, branch 000 = HQ, which has real data)
node apps/adapos-sync/src/index.js --execute --branch=000 --datasets=pending_receipts,approved_receipts
```

The sync agent runs on a machine that has network access to AdaAcc SQL Server
(`POSSRV\SQLEXPRESS` or `SERVER\SQLEXPRESS`, user `readonly_pilot`).
It does NOT run on Render.

---

## File structure (relevant files only)

```
SC-StockDay-Ordering/
├── apps/
│   ├── admin-web/
│   │   ├── src/
│   │   │   ├── App.jsx          ← single-page app, has PurchaseReceiptsPanel
│   │   │   └── styles.css       ← plain CSS, Thai font stack
│   │   ├── vite.config.js       ← ⚠️ no proxy yet (P1 fix needed)
│   │   └── .env.example         ← VITE_API_BASE_URL + missing VITE_BRANCH_CODE
│   └── adapos-sync/
│       └── src/
│           ├── index.js         ← CLI: --dry-run/--execute, --branch, --datasets
│           ├── queries.js       ← SQL Server read-only queries
│           ├── transform.js     ← AdaAcc rows → API payload
│           └── config.js        ← parses HOST\INSTANCE, blocks sa account
├── server/
│   ├── db/migrations/
│   │   ├── 001_init.sql
│   │   ├── 002_transfers.sql
│   │   ├── 003_pending_receipts.sql
│   │   └── 004_approved_receipts.sql
│   └── src/
│       ├── index.js             ← Express entrypoint, no static serving yet
│       ├── routes.js            ← all endpoints
│       └── repositories/
│           ├── postgresRepository.js  ← real DB ops
│           └── mockRepository.js     ← stubs for DATA_MODE=mock
└── docs/
    ├── CODEX_HANDOFF_2026-05-22.md  ← this file
    └── adasoft/
        └── project_adapos_approved_receipts_session.md  ← mother PC session log
```

---

## Conventions to follow (match existing code exactly)

- **React**: hooks only, no class components, no context/Redux
- **CSS**: plain classes in `styles.css` — no inline styles, no Tailwind
- **API calls**: use `apiFetch(path)` helper (already in App.jsx) — never use `fetch` directly
- **Numbers**: `formatNumber(value, digits)` helper — always use for Thai locale
- **Text**: Thai UI labels — follow existing pattern (see `translateStatus()`)
- **Error handling**: show `notice error` div, never `alert()`
- **Loading state**: `empty-state` paragraph with Thai text
- **No new npm packages** unless absolutely necessary
