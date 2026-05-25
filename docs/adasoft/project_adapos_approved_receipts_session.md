---
name: AdaPOS Approved/Pending Receipts — build + production sync session (2026-05-22)
description: Session log covering the "approved purchase receipts today" feature build (Prompt 3), DB migration 004, local tests, and the branch-000 production sync attempt against the paasrtsm backend (which 500'd on ingest). Records root causes, what is deployed, and the open production-side blocker.
type: project
originSessionId: mother-pc-2026-05-22
---

## Scope of this session
Build the **"approved purchase receipts today"** admin panel end-to-end (Prompt 3),
verify it locally, then push live AdaPOS pending/approved receipt data to the
production site. Work done on the **mother PC**
(`C:\Users\Administrator\Desktop\Stockdays\SC-StockDay-Ordering`, repo
`AKCD1998/SC-StockDay-Ordering`).

---

## 1. Feature built — approved receipts today (Prompt 3)
Committed as **`4f8197d`** ("feat: approved purchase receipts today panel (Prompt 3)").
8 changes, no other files touched:

| # | File | Change |
|---|---|---|
| 1 | `apps/adapos-sync/src/queries.js` | `getTodayApprovedReceiptHeaderRows` + `getTodayApprovedReceiptLineRows` (SELECT-only, `FTXihStaPrcDoc='1'` AND `CAST(FDXihDocDate AS DATE)=CAST(GETDATE() AS DATE)`). Uses **verified** TACTPiDT columns: `FTXidBarCode`, `FTPunCode`, `FTXidUnitName`, `FCXidFactor`, `FCXidQtyAll`, `FCXidStkFac`. |
| 2 | `apps/adapos-sync/src/transform.js` | `toApprovedReceiptPayload(hdRows, dtRows)` → array of headers each with nested `lines[]`. |
| 3 | `apps/adapos-sync/src/index.js` | imports + `approved_receipts` dataset in `fetchDatasets` + execute block POSTing `{ branchCode, records }` to `/api/sync/ada/approved-receipts`. |
| 4 | `apps/adapos-sync/.env.example` | appended `approved_receipts` to `ADAPOS_SYNC_DATASETS`. |
| 5 | `server/db/migrations/004_approved_receipts.sql` | `ada_approved_receipt_headers` (PK `doc_no`, incl. `sta_prc_doc`) + `ada_approved_receipt_lines` (PK `doc_no,seq_no`, FK CASCADE) + indexes `idx_ada_arh_branch_date`, `idx_ada_arl_product`. |
| 6 | `server/src/routes.js` | `POST /api/sync/ada/approved-receipts` + `GET /api/admin/approved-receipts?branchCode=&date=`. |
| 7 | `server/src/repositories/postgresRepository.js` | `ingestApprovedReceipts` (UPSERT header ON CONFLICT, delete+reinsert lines) + `getApprovedReceipts` (grouped headers→lines). |
| 8 | `server/src/repositories/mockRepository.js` | stubs `ingestApprovedReceipts`→`{upserted:0}`, `getApprovedReceipts`→`[]`. |

### Strategy contrast (already in repo)
- **Pending** receipts (migration 003): DELETE-all-then-INSERT per branch (replace).
- **Approved** receipts (migration 004): UPSERT headers, delete+reinsert lines per doc (accumulate).

---

## 2. Local verification (all passed)
Ran against Render Postgres `sc_drug_db` with a local server on `:4000`:
1. Migration runner applied `001`→`004` cleanly (`004_approved_receipts.sql` new).
2. Dry-run `--branch=005 --datasets=approved_receipts`: connected, 0 rows (none approved today under 005).
3. `GET /api/admin/approved-receipts?branchCode=005` → `{ ok:true, records:[] }`.
4. `POST /api/sync/ada/approved-receipts` with one mock doc → `{ ok:true, upserted:1 }`.
5. `GET` again → returned the stored header + nested line with all fields correct.
Test record `AR-TEST-001` deleted afterward (`DELETE 1`; line cascade-removed).

All 6 `ada_*` tables confirmed present in `sc_drug_db`:
`ada_transfer_headers/lines`, `ada_pending_receipt_headers/lines`, `ada_approved_receipt_headers/lines`.

---

## 3. Why the production site showed empty — root cause
The admin site (`sc-stockday-ordering.onrender.com`, reading from the
**paasrtsm-project.onrender.com** backend) showed "ไม่มีเอกสารรออนุมัติ".

**It was NOT a UI bug and NOT a wrong API-URL.** The agent `.env` already pointed at
production (`ADAPOS_SYNC_API_BASE_URL=https://paasrtsm-project.onrender.com`).
The real cause is the **branch code**: HQ purchase/receiving documents are stored
under **`branch_code='000'`** in AdaAcc, but the pilot agent default is `005`.
Querying for `005` correctly returns nothing.

Dry-run `--branch=000 --datasets=pending_receipts,approved_receipts` confirmed real data:
- `pending_receipt_headers`: **12**, `pending_receipt_lines`: **20**
- `approved_receipt_headers`: 0, `approved_receipt_lines`: 0 (none `FTXihStaPrcDoc='1'` dated today yet)
- Sample: `PR00026-001731`, supplier "บริษัท รอแยล-ดี (ไทยเเลนด์) จำกัด", dated 2026-05-22.

Note: the 12 pending headers seen in AdaAcc for `000` differ from 5 rows earlier seen
in `sc_drug_db` → the `sc_drug_db` and the production **paasrtsm** database are separate;
production needs its own load.

---

## 4. OPEN BLOCKER — production ingest 500s (paasrtsm side)
`--execute --branch=000 --datasets=pending_receipts,approved_receipts` against production:
- Read 32 rows from AdaAcc OK.
- `POST /api/sync/ada/pending-receipts` → **HTTP 500** `{"error":"Internal server error","request_id":"14e56883-93cf-4c2a-aadf-075754f928f4"}`.
- Agent aborted on first POST; **nothing written** to production (no partial data).

Diagnosis: endpoint exists (500, not 404/401) but the **paasrtsm backend throws
server-side on ingest**. That backend is a **different repo (Codex's PaaSRTSM-project),
not on this machine** — cannot be read/fixed from here.

Likely causes (all on the paasrtsm side):
1. pending/approved receipt tables/migration not applied on the production paasrtsm DB.
2. backend ingest expects a different payload shape than our agent's `{ headers:[], lines:[] }`.
3. an INSERT column mismatch (same class as the already-fixed `synced_at` 42703 read-side bug).

**Next action belongs to the paasrtsm maintainer:** check Render →
paasrtsm-project → Logs for `request_id 14e56883-93cf-4c2a-aadf-075754f928f4`,
and compare the agent's pending-receipts payload shape against its ingest handler.

---

## 5. Deploy status
- Our repo `AKCD1998/SC-StockDay-Ordering` `main`: feature complete + pushed (`4f8197d`,
  plus this doc). Migration `004` already applied to `sc_drug_db`.
- The **public production site reads from the separate paasrtsm backend**, so pushing
  this repo does NOT update what the user sees. Unblocking the live receipts display
  depends on fixing the paasrtsm ingest 500 (Section 4).
