---
name: AdaPos transaction tracing — 2026-06-03
description: "SCCRMonPOS watcher is healthy and connected to the right instance/DB, but a test transaction completed today does not appear in TPSTSalHD or any obvious sale table. All three initial hypotheses eliminated. New evidence points toward a hold/temp flow or a POS-terminal-specific doc that was not searched."
type: project
originSessionId: claude+codex
---

# AdaPos Transaction Tracing — 2026-06-03

**Context:** SCCRMonPOS companion helper was deployed and a real cashier transaction was completed to test the live-capture pipeline. The transaction did not land in `TPSTSalHD`.

---

## What The Watcher Shows

- `runtime.log` reports healthy:
  - SQL resolved to `.\SQLEXPRESS`
  - connected successfully to `AdaAcc`
  - polling every 3 seconds
- Every poll returns `rows=0`

---

## Hard Evidence Gathered

### AdaIni.ada on this machine

Found at: `D:\AdaSoft\AdaPos4.0HpmFhn\AdaTools\AdaIni.ada`

Readable strings:
```
SqlSrc  POSSRV\SQLEXPRESS
SqlDB   AdaAcc
SqlUsr  Csa
SqlUsrP adasoft
```

**Conclusion: The cashier app IS pointing to the same instance and database the watcher monitors.**
Hypothesis 1 ("wrong instance") eliminated.

---

### Active SQL Sessions During The Test

| Program | Host | Database |
|---|---|---|
| `AdaPosFront` | `FRONT2` | `AdaAcc` |
| `AdaPosFront` | `POSSRV` | `AdaAcc` |
| `AdaPosBack` | `FRONT2` | `AdaAcc` |
| `SCCRMonPOS` | (watcher) | `AdaAcc` |

**Conclusion: All components are on the same DB. Both cashier terminal FRONT2 and the server POSSRV have active AdaPosFront sessions.**

---

### Databases On This SQL Instance

- `AdaAcc` ← only user DB
- `master`, `model`, `msdb`, `tempdb` (system only)

**Conclusion: No alternate business database exists on this instance.**
Hypothesis 3 ("AdaAcc2 or other DB") eliminated.

---

### TSALE\* / TMEMBER\* Tables

Query returned **0 rows**. These tables do not exist in this `AdaAcc`.

**Conclusion: There is no legacy FTP-sync shadow schema on this instance.**
Hypothesis 2 in exact form eliminated. Note: the TWO PARALLEL SCHEMAS finding from NB-005-01 final scan referred to a different machine/branch or was a HQ-side construct, not present here.

---

### Sale-Adjacent Tables Checked

| Table | Rows | Notes |
|---|---|---|
| `TPSTSalHD` | many | latest = **2026-06-02** — no 2026-06-03 rows |
| `TPSTSalHD_B` | 0 | empty |
| `TDFTSalHD` | 0 | empty |
| `TACTmpBillHD` | 1 | one old sample row, not today's transaction |

`MAX(FDDateIns)` = `2026-06-02`
`MAX(FDShdDocDate)` = `2026-06-02`

---

## Remaining Hypotheses (Ranked)

### 1. Transaction is in a HOLD or TEMP state — HIGH LIKELIHOOD

AdaPos has a hold-bill feature. If the cashier used it, or if payment was interrupted, the row would land in:
- `TPSTHoldHD` / `TPSTHoldDT`
- `TACTmpBillHD` (only 1 row found — check if it updated)

The fact that `TACTmpBillHD` had 1 row (old sample) is interesting — if that row timestamp changed, the transaction is there.

### 2. Transaction used a different POS terminal or branch code — MEDIUM LIKELIHOOD

Doc numbers follow `S2606[branch][pos]-[seq]`. The last known docs were from POS terminal `002`. If the test transaction went through POS `001` or `003`, a branch-filtered query would miss it. Check all branches in `TPSTSalHD` for today.

### 3. Buddhist Era date storage in this specific version — LOW BUT NOT ZERO

From Session 9: branch 004 had 62k records stored with Buddhist Era year `2569`. If today's transaction stored `FDDateIns = 2569-06-03` (Buddhist Era) instead of `2026-06-03`, a `MAX(FDDateIns)` returning `2026-06-02` might be correct for Gregorian-stored rows while today's row sits at `2569-06-03` and appears "in the future" to Gregorian queries. Check:
```sql
SELECT TOP 5 FDDateIns, FDShdDocDate FROM TPSTSalHD ORDER BY FDDateIns DESC
```
If you see a row like `2569-06-03`, Buddhist Era storage is confirmed.

### 4. Transaction committed to a read replica or linked server — VERY LOW

No evidence for this on a local branch setup. Unlikely.

---

## Highest-Signal Next Step

**Get the receipt number printed by the cashier and search it across all TPS/TACT tables.**

```sql
-- Replace 'S2606005002-XXXXXXX' with the actual receipt number
DECLARE @doc NVARCHAR(50) = 'S2606005002-XXXXXXX'

SELECT 'TPSTSalHD'     AS tbl, FTShdDocNo, FDDateIns FROM TPSTSalHD     WHERE FTShdDocNo = @doc
UNION ALL
SELECT 'TACTmpBillHD'  AS tbl, FTBilDocNo, FDDateIns FROM TACTmpBillHD  WHERE FTBilDocNo = @doc
UNION ALL
SELECT 'TPSTHoldHD'    AS tbl, FTHodDocNo, FDDateIns FROM TPSTHoldHD    WHERE FTHodDocNo = @doc
```

---

## Broad Scan If Receipt Number Is Unavailable

```sql
-- Find any new row in ALL TPS/TACT tables today
SELECT 'TPSTSalHD'    AS tbl, COUNT(*) AS cnt, MAX(FDDateIns) AS latest FROM TPSTSalHD    WHERE FDDateIns >= CAST(GETDATE() AS DATE)
UNION ALL
SELECT 'TACTmpBillHD', COUNT(*), MAX(FDDateIns) FROM TACTmpBillHD WHERE FDDateIns >= CAST(GETDATE() AS DATE)
UNION ALL
SELECT 'TPSTHoldHD',   COUNT(*), MAX(FDDateIns) FROM TPSTHoldHD   WHERE FDDateIns >= CAST(GETDATE() AS DATE)
UNION ALL
SELECT 'TACTVatHD',    COUNT(*), MAX(FDDateIns) FROM TACTVatHD    WHERE FDDateIns >= CAST(GETDATE() AS DATE)
UNION ALL
-- Buddhist Era safety net: look for any row with today's Buddhist year (2569)
SELECT 'TPSTSalHD_BE', COUNT(*), MAX(FDDateIns) FROM TPSTSalHD
WHERE YEAR(FDDateIns) = 2569
```

---

## Buddhist Era Date Safety Check

```sql
-- If any rows have year 2569, this instance uses Buddhist Era dates
SELECT TOP 3 FDDateIns, FDShdDocDate, FTShdDocNo
FROM TPSTSalHD
ORDER BY FDDateIns DESC

-- Also check the absolute latest row regardless of date
SELECT TOP 1 FDDateIns, FDShdDocDate, FTShdDocNo, FTBchCode, FTPosCode
FROM TPSTSalHD
ORDER BY FDDateIns DESC
```

---

## What To Tell The Watcher

Once the real table is found, update the watcher's SQL to poll that table instead of (or in addition to) `TPSTSalHD`.

If the answer is "hold table" → the watcher needs to also monitor `TPSTHoldHD` and detect when a hold row MOVES to `TPSTSalHD` as the "completed" event.

If the answer is "Buddhist Era dates" → all date comparisons in the watcher need `DATEADD(year, 543, GETDATE())` for the threshold.

---

## Known Machine Topology At This Branch

| Machine | Role | Notable |
|---|---|---|
| `POSSRV` (`192.168.0.127`) | Branch SQL Server + AdaPosBack | `DESKTOP-TQ7J8HJ\SQLEXPRESS`, 227 MB AdaAcc |
| `FRONT2` | Cashier terminal | Runs AdaPosFront + AdaPosBack |
| `NB-005-01` (`192.168.0.231`) | Back-office laptop | No AdaPosFront |

SCCRMonPOS watcher appears to be running on `POSSRV` (watches `.\SQLEXPRESS`).
AdaPosFront active on both `POSSRV` and `FRONT2` during the test.

---

## Open Questions (resolved in follow-up below)

1. What is the printed receipt number from the test transaction? → `S2606005001-0000645`
2. Does `TPSTHoldHD` exist? → Yes but doc not there
3. Is FDDateIns 2026 or 2569? → 2026 (Gregorian)
4. Was the transaction completed? → Yes — receipt printed, PromptPay confirmed

---

## Follow-Up Findings — Same Session

### Receipt Found In Unexpected Tables

`S2606005001-0000645` located in:
- ✅ `TSHD001` — sale header (complete, `FTShdStaPaid='3'`, `FCShdGrand=2`, `FDDateIns=2026-06-03`)
- ✅ `TSDT001` — sale detail (product `630020242`, `ปกติ ทัมใจ 1 ซอง`, qty 1, net 2)
- ✅ `TSRC001` — payment row (`FTRcvCode='013'`, `FTRcvName='พร้อมเพย์'`, `FTSrcRef=0603094445...`, `FCSrcNet=2`)
- ✅ `TPSTmpFSlipDT` — temp full-slip detail (also present)

NOT in: `TPSTSalHD`, `TPSTSalDT`, `TPSTSalRC`, `TPSTHoldHD`, `TPSTmpFSlipHD`

### Root Cause — Per-Register Physical Tables

**AdaPos uses per-register physical table families, not one shared sale table.**

| POS | Header | Detail | Payment |
|---|---|---|---|
| 001 | `TSHD001` | `TSDT001` | `TSRC001` |
| 002 | `TSHD002` | `TSDT002` | `TSRC002` |

`TPSTSalHD/DT/RC` appears to be a centralized or processed view, not the live local write target for individual POS registers.

**This was NOT discovered in the NB-005-01 expedition because that machine only observed back-office data from POS terminal 002. Terminal 001 (FRONT2) uses TSHD001.**

### Watcher Fix Applied By Codex

`AdaPosWatcher.cs` updated to:
- Auto-discover live `TSHDxxx / TSDTxxx / TSRCxxx` table sets by POS code
- Fall back to `TPSTSal*` if per-register tables not found
- Each detected receipt carries its source table context for downstream fetches

`ReceiptWorkflowStore.cs` — durable queue serializer fixed (`receipt-queue.json` was failing).

Build: Release, 0 errors, 0 warnings.

### Watcher Now Working — But New Blocker

After fix:
- `runtime.log` shows: `Receipt detected: doc=S2606005001-0000647`, `...0648`
- `receipt-queue.json` persisting receipts correctly
- Retries running

**But backend returns: `Sale event not found`** on `/internal/crm/pos/claim-token`

---

## Root Cause Of "Sale event not found"

**This is an architecture gap, not a bug in SCCRMonPOS.**

The CRM backend (`sc-official-website.onrender.com`) validates sale events before issuing claim tokens. It does this by looking up the sale in its own database — which is populated by:

```
Branch POSSRV\SQLEXPRESS (local TSHD001)
    ↓ [NOT synced directly]
    ↓ AdaSky.exe FTP → central WIN-N8RL1PCFEDO\SQLEXPRESS
    ↓ adapos-sync reads central → SC-StockDay PostgreSQL
    ↓ CRM backend looks up sale here
```

The sale `S2606005001-0000645` is:
- ✅ committed locally on `POSSRV\SQLEXPRESS` in `TSHD001`
- ❌ NOT yet synced to central (FTP is manual, lag = hours to days)
- ❌ NOT in the CRM backend DB

**So the backend correctly says "Sale event not found" — it hasn't received the sale yet.**

This gap was known in the expedition: *"Central sync is manual and laggy by design"* and *"Branch-local SQL after commit = seconds; central after FTP sync = hours to days."*

---

## What Must Change

The CRM claim-token flow needs to be decoupled from the central-sync lag.

**Option A (recommended): SCCRMonPOS pushes sale data directly to CRM backend before claiming.**

```
SCCRMonPOS detects receipt in TSHD001
    ↓
POST /internal/crm/pos/sale-event  ← NEW endpoint
  { docNo, branchCode, posCode, grand, tender, items[], timestamp }
    ↓
Backend stores the sale event locally (not waiting for FTP)
    ↓
POST /internal/crm/pos/claim-token  ← existing endpoint
  { docNo, memberCardId }
    ↓
Backend finds the sale → issues token → shows popup
```

**Option B: Remove sale-event validation from claim-token.**
Backend trusts SCCRMonPOS's assertion. Lower safety but simpler. Suitable if fraud risk is acceptable.

**Option C: Make FTP sync automatic/scheduled.**
Reduces lag but doesn't solve the real-time problem (minutes vs seconds).

---

## Next Debug Step

Inspect the exact payload SCCRMonPOS sends to `/internal/crm/pos/claim-token`:
- What fields does it send?
- What does the backend expect?
- Is `docNo` in the format `S2606005001-0000645` or stripped/reformatted?
- Does the backend try to look up by `docNo` alone, or `docNo + branchCode + posCode`?

Check `ApiClient.cs` claim-token method and compare with backend route handler.
