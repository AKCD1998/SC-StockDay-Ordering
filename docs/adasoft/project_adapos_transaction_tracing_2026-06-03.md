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

## Open Questions

1. What is the printed receipt number from the test transaction?
2. Does `TPSTHoldHD` exist in this DB, and does it have a row from today?
3. Does `SELECT TOP 1 FDDateIns FROM TPSTSalHD ORDER BY FDDateIns DESC` return `2026-...` or `2569-...`?
4. Is the watcher querying by `FDDateIns > threshold` or `FDShdDocDate`? If the cashier date is different from insert date, the filter could miss rows.
5. Was the transaction definitely completed (payment confirmed, receipt printed) or was it possibly left on hold?
