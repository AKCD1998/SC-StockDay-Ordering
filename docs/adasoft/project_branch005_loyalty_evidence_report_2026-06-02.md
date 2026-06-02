---
name: branch005 loyalty evidence report 2026-06-02
description: "Read-only Branch 005 loyalty evidence run from NB-005-01. Proves live sales, payment, VAT, and refund document shapes in local AdaAcc; identifies branch-local capture as the earliest reliable loyalty event source; lists cashier-flow gaps that still require the cashier PC."
type: project
originSessionId: codex
---

# Branch005 Loyalty Evidence Report

Date: 2026-06-02
Machine investigated: `NB-005-01` (`192.168.0.231`)
Scope: read-only only

## Executive Summary

Branch 005 local `AdaAcc` on `POSSRV\SQLEXPRESS` is a viable v1 loyalty event source, but this specific laptop can only prove the database and back-office side, not the live cashier UI flow.

What is now proven from live Branch 005 evidence:

- Normal POS sales are written to `TPSTSalHD` + `TPSTSalDT` and paid tenders are written to `TPSTSalRC`.
- Customer-linked VAT sales are written to `TACTVatHD` and link cleanly to `TCNMCst`.
- Returns are recorded as separate `R...` documents in `TPSTSalHD/DT` with `FTShdDocType='9'`, linked back to the original sale by `FTShdPosCN`.
- The original sale is not deleted or overwritten; it remains as `FTShdDocType='1'` and flips to `FTShdStaRefund='2'`.
- Partial returns are proven. Refund docs can contain only the returned subset of lines while the original sale keeps all original line detail.
- The earliest reliable loyalty capture point is branch-local SQL after commit, using `TPSTSalHD/DT` plus `TPSTSalRC`, and later correction events from refund docs.

What is not proven from this laptop:

- Whether AdaPosFront has an existing member-entry field, scan box, or hidden cashier shortcut for zero-window-switch identification.
- Whether void-before-payment persists anywhere in SQL at all.
- Whether refund tender selection follows a fixed rule or is cashier-chosen case by case.

## Known With Evidence

### A. Machine role and integration boundary

- `AdaPosBack.exe` is running on this laptop.
- `AdaPosFront.exe` is not running here.
- This machine is therefore back-office, not a cashier terminal.
- `POSSRV` resolves to `192.168.0.127`.
- The local branch sync agent connected successfully on 2026-06-02 to local `AdaAcc` using branch read-only credentials and read `1373` sales rows for branch `005`.
- SQL Server identifies itself as `DESKTOP-TQ7J8HJ\SQLEXPRESS`; the branch apps treat it as `POSSRV\SQLEXPRESS`.

Implication:
Zero-window-switch cashier behavior is not provable from this laptop alone. The cashier PC or POSSRV screen-side session still has to be observed.

### B. Source-of-truth sales tables

Live Branch 005 sales tables discovered in `AdaAcc`:

- `TPSTSalHD` = sale header
- `TPSTSalDT` = sale lines
- `TPSTSalRC` = payment/tender rows
- `TACTVatHD` = VAT/customer invoice header
- `TACTVatDT` = VAT/customer invoice lines
- `TACTVatRC` = VAT/customer invoice tender rows
- `TCNMCst` = customer master
- `TSysUser` = user/cashier master
- `TCNMBranch` = branch master

Real joins proven locally:

- `TPSTSalHD` -> `TPSTSalDT` on `FTBchCode + FTShdDocNo`
- `TPSTSalHD` -> `TPSTSalRC` on `FTShdDocNo`
- `TACTVatHD` -> `TCNMCst` on `FTCstCode`
- Refund doc -> original sale on `LOWER(refund.FTShdPosCN) = LOWER(original.FTShdDocNo)`

### C. Normal sale record shape

Recent live examples on 2026-06-02 show:

- `FTShdDocType='1'`
- `FTShdStaPaid='3'`
- `FTShdStaDoc='1'`
- `FTShdStaRefund='1'`
- `FTShdStaPrcDoc` and `FTShdStaPrcStk` can still be `NULL` immediately after sale completion
- `FDDateIns` and `FTTimeIns` match checkout time closely
- `TPSTSalRC` tender rows appear within seconds of header insert

Recent examples:

| Doc | Date/Time | POS | User | Grand | Tender |
|---|---|---:|---|---:|---|
| `S2606005002-0001688` | 2026-06-02 13:24:32 | `002` | `dao1` | `775` | `พร้อมเพย์` |
| `S2606005002-0001687` | 2026-06-02 13:23:00 | `002` | `dao1` | `704` | `พร้อมเพย์` |
| `S2606005002-0001686` | 2026-06-02 13:17:51 | `002` | `dao1` | `65` | cash |
| `S2606005002-0001685` | 2026-06-02 13:15:48 | `002` | `dao1` | `72` | cash |
| `S2606005001-0000626` | 2026-06-02 12:00:50 | `001` | `b00101` | `84` | cash |

### D. Payment/tender record shape

`TPSTSalRC` stores tender rows with:

- `FTShdDocNo`
- `FNSrcSeqNo`
- `FTRcvCode`
- `FTRcvName`
- `FTSrcRef`
- `FCSrcAmt`
- `FCSrcNet`
- `FCSrcChg`
- `FTSrcRetDocRef`
- `FCSrcRetAmt`

Proven tender examples:

- `FTRcvCode='001'` / `FTRcvName='เงินสด'`
- `FTRcvCode='013'` / `FTRcvName='พร้อมเพย์'`

This is enough to compute points on paid amount and to preserve tender mix in the external event model.

### E. Customer identity in normal sales vs VAT sales

Normal POS sales:

- `2325` total sales found for Branch 005
- `1786` have a non-empty `FTCstCode`, but almost all are generic customer code `0`
- only `20` have a nonzero customer code
- common values are `FTCstCode='0'`, `FTShdCstName='ลูกค้าทั่วไป'`, `FTShdCstAddr='ลูกค้าทั่วไป'`
- `FTCtrCardID` was `0` populated rows in live Branch 005 `TPSTSalHD`
- `FTShdRefSaleTax` appeared on only `11` rows, all tied to refund-linked activity

Conclusion:
Normal sales do not currently prove meaningful customer identity capture. They mostly capture a generic customer placeholder.

VAT/customer docs:

- `TACTVatHD` has `508` Branch 005 rows
- all `508` have `FTCstCode`
- all `508` have `FTXihCstName`
- `8` have `FTCstTaxNo`
- `0` had `FTCtrCardID` in the sampled VAT docs, but `TCNMCst` does contain at least one `AR005-...` customer with `FTCstCardID`

Example VAT customer docs:

- `S26005-000507` -> `AR005-000009` -> Bangkok Bank branch customer with tax ID
- `S26005-000506` -> `AR005-000008` -> company customer with tax ID
- `S26005-000499` -> generic customer `0`

Conclusion:
Branch 005 captures real customer identity today in VAT/customer invoice flow, not in ordinary walk-in POS flow.

### F. Return / cancellation / exchange workflow

Live refund behavior is proven:

- refund docs use `FTShdDocType='9'`
- refund docs have their own receipt numbers beginning with `R...`
- refund docs link to the original sale via `FTShdPosCN`
- original sale remains in place and changes to `FTShdStaRefund='2'`
- refund docs keep item-level detail in `TPSTSalDT`
- partial returns are supported

Proven examples:

| Refund Doc | Original Doc | Refund Grand | Original Grand | Refund Lines | Original Lines | Result |
|---|---|---:|---:|---:|---:|---|
| `R2606005002-0000009` | `S2606005002-0001588` | `550` | `1049` | `1` | `5` | partial return |
| `R2605005002-0000008` | `S2605005002-0001463` | `38` | `72` | `1` | `2` | partial return |
| `R2605005002-0000007` | `S2605005002-0001152` | `35` | `35` | `1` | `1` | full return |
| `R2605005001-0000001` | `S2605005001-0000222` | `349` | `349` | `6` | `6` | full return |

Latest proven partial return:

- Original `S2606005002-0001588` had 5 sale lines totaling `1049`
- Refund `R2606005002-0000009` had 1 refund line for product `IC-001572` totaling `550`
- Original sale remained present with `FTShdStaRefund='2'`

Refund tender example:

- Original sale paid by `พร้อมเพย์`
- Refund doc paid out as `เงินสด`

Conclusion:
The loyalty ledger should treat returns as separate correction events, not as edits to the original earn event.

### G. Void-before-payment / void-after-payment / exchange

Not proven locally:

- No Branch 005 rows were found with `FTShdStaPaid <> '3'` or `FTShdStaDoc <> '1'`
- No persisted unpaid or draft sales were found in `TPSTSalHD`
- No SQL evidence from this laptop proves how void-before-payment is persisted, or whether it is persisted at all
- No SQL evidence from this laptop proves an explicit exchange document type; current evidence is consistent with “sale + refund” handling instead

Next machine to inspect:

- Branch 005 cashier PC

### H. Earliest stable capture point

Best proven v1 capture point:

- branch-local `POSSRV\SQLEXPRESS` after sale commit
- read `TPSTSalHD` + `TPSTSalDT`
- join `TPSTSalRC` for tender confirmation
- then watch for later `R...` refund docs as reversal events

Why this is proven:

- local branch sync connected successfully today and read live sales
- sale headers and payment rows are visible locally on the same day, immediately after completion
- central sync is manual and laggy by design
- this branch laptop itself cannot prove the cashier UI, but it can prove the branch-local database is current enough for near-real-time event capture

Latency comparison:

| Capture path | Expected latency | Reliability | Verdict |
|---|---|---|---|
| Local SQL after commit | seconds | high | best v1 source |
| File/export detection | minutes to operator-dependent | medium | fallback only |
| Central aggregated SQL after FTP sync | hours to days | low for instant points | not acceptable for “instant-feel” |
| Companion helper observing local committed docs | seconds | high if built carefully | good adjunct to local SQL |

### I. SCCRMMVP / backend fit

Minimum proven event model:

- `sale_completed`
  Source: `TPSTSalHD` where `FTShdDocType='1'` and `FTShdStaPaid='3'`
- `sale_line_item`
  Source: `TPSTSalDT`
- `sale_tender`
  Source: `TPSTSalRC`
- `sale_refund_marked`
  Source: original `TPSTSalHD` where `FTShdStaRefund='2'`
- `return_completed`
  Source: refund `TPSTSalHD` where `FTShdDocType='9'`
- `return_line_item`
  Source: refund `TPSTSalDT`
- `vat_sale_completed`
  Source: `TACTVatHD`
- `points_earned`
  Derived externally from paid sale events
- `points_reversed`
  Derived externally from refund docs
- `manual_adjustment`
  Not proven from sales docs; must remain an external backend event

## Still Unknown / Must Verify On Central Or Cashier PC

Not proven from this laptop:

- whether AdaPosFront has any member-entry field, scan box, or hotkey usable without leaving the cashier window
- whether a scanner wedge or local tray helper can inject customer identity into the real checkout flow safely
- whether void-before-payment creates any persisted SQL record
- whether void-after-payment uses only the proven `R...` refund flow or has another hidden path
- whether explicit exchange UX exists in AdaPosFront or whether staff always perform refund + new sale
- whether refund tender rules are fixed by software or chosen by cashier
- whether Thai ID reader data can be injected directly into AdaPosFront instead of only back-office/VAT/customer workflows

Exact next machines:

- Branch 005 cashier PC
- Branch 005 POSSRV with AdaPosFront visible
- HQ workflow/operator only if VAT/refund policy rules differ from what SQL shows

## Proposed Source-Of-Truth Table Map

| Domain | Tables | Notes |
|---|---|---|
| Sales headers | `TPSTSalHD` | normal POS sale receipts |
| Sales lines | `TPSTSalDT` | line items, qty, price, lot, expiry |
| Sales tenders | `TPSTSalRC` | cash, PromptPay, other tender rows |
| Refund headers | `TPSTSalHD` (`FTShdDocType='9'`) | separate `R...` docs |
| Refund lines | `TPSTSalDT` joined to refund docs | item-level return detail |
| VAT/customer headers | `TACTVatHD` | invoice/customer-linked sales |
| VAT/customer lines | `TACTVatDT` | VAT line items |
| VAT/customer tenders | `TACTVatRC` | VAT doc payment rows |
| Customer references | `TCNMCst` | `FTCstCode`, `FTCstTaxNo`, `FTCstCardID` |
| Users/cashiers | `TSysUser` | `FTUsrCode` maps to sale header `FTUsrCode` |
| Branches | `TCNMBranch` | branch metadata and names |

## Return-Handling Truth Table

| User action | AdaSoft record shape | Loyalty consequence |
|---|---|---|
| Normal sale | `TPSTSalHD` doc type `1` + `TPSTSalDT` + `TPSTSalRC` | earn points |
| Full return | original sale flips to `FTShdStaRefund='2'`; separate refund doc `R...` with `FTShdDocType='9'`; refund lines mirror returned items | reverse all earned points for returned items |
| Partial return | same as full return, but refund doc contains only subset of original lines/amount | reverse only returned-item points |
| Void before payment | not proven | not proven |
| Void after payment | likely same refund-doc path, but exact UI workflow not proven | reverse according to refund doc |
| Exchange | not proven; likely refund + new sale pattern | reverse old item points, then earn new item points |

## Recommended Capture Architecture For V1

Use a branch-local read model.

- Primary source: local `POSSRV\SQLEXPRESS\AdaAcc`
- Poll or tail newly committed rows in `TPSTSalHD`, `TPSTSalDT`, and `TPSTSalRC`
- Treat refund docs (`FTShdDocType='9'`) as separate reversal events
- Optionally pair with a cashier-PC companion helper only for identity capture UX, not as the financial source of truth

Recommendation:

- branch-local read model: high confidence
- central read model: low confidence for instant-loyalty UX due to manual FTP lag

## Appendix A: Exact Read-Only SQL Queries Used

```sql
SELECT @@SERVERNAME AS server_name, DB_NAME() AS db_name;
```

```sql
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE 'TPS%Sal%'
ORDER BY TABLE_NAME;
```

```sql
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME='TPSTSalHD'
ORDER BY ORDINAL_POSITION;
```

```sql
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME='TPSTSalDT'
ORDER BY ORDINAL_POSITION;
```

```sql
SELECT TOP 10
  FTBchCode, FTShdDocNo, FTShdDocType, FDShdDocDate, FTShdDocTime,
  FTUsrCode, FTCstCode, FTShdCstName, FTShdCstAddr, FTCtrCardID,
  FTPosCode, FTWahCode, FTShdStaPaid, FTShdStaRefund, FTShdStaDoc,
  FTShdStaPrcDoc, FTShdStaPrcStk, FCShdTotal, FCShdDis, FCShdVat,
  FCShdGrand, FCShdReceive, FCShdChn, FCShdMnyCsh, FCShdMnyCrd,
  FCShdMnyCpn, FCShdPaid, FTShdPosCN, FTShdRefSaleTax,
  FDDateIns, FTTimeIns, FDDateUpd, FTTimeUpd
FROM TPSTSalHD
WHERE FTBchCode='005'
ORDER BY FDShdDocDate DESC, FTShdDocTime DESC;
```

```sql
SELECT TOP 20
  h.FTBchCode, h.FTShdDocNo, h.FDShdDocDate, h.FTShdDocTime,
  r.FNSrcSeqNo, r.FTRcvCode, r.FTRcvName, r.FTSrcRef,
  r.FCSrcAmt, r.FCSrcNet, r.FCSrcChg, r.FTSrcRetDocRef, r.FCSrcRetAmt,
  r.FDDateIns, r.FTTimeIns
FROM TPSTSalRC r
JOIN TPSTSalHD h ON h.FTShdDocNo = r.FTShdDocNo
WHERE h.FTBchCode='005'
ORDER BY h.FDShdDocDate DESC, h.FTShdDocTime DESC, r.FNSrcSeqNo;
```

```sql
SELECT TOP 50
  FTBchCode, FTShdDocNo, FTShdDocType, FDShdDocDate, FTShdDocTime,
  FTUsrCode, FTCstCode, FTPosCode,
  FTShdStaPaid, FTShdStaRefund, FTShdStaDoc, FTShdStaPrcDoc,
  FCShdGrand, FCShdReceive, FCShdPaid, FCShdGndCN, FCShdGndDN,
  FTShdPosCN, FTShdRefSaleTax, FDDateIns, FTTimeIns, FDDateUpd, FTTimeUpd
FROM TPSTSalHD
WHERE FTBchCode='005'
  AND (FTShdDocType <> '1' OR FTShdStaRefund <> '1' OR ISNULL(FTShdPosCN,'') <> '')
ORDER BY FDShdDocDate DESC, FTShdDocTime DESC;
```

```sql
SELECT TOP 20
  FTBchCode, FTXihDocNo, FTXihDocType, FDXihDocDate, FTXihDocTime,
  FTUsrCode, FTCstCode, FTXihCstName, FTXihCstAddr, FTCtrCardID, FTCstTaxNo,
  FTXihStaPaid, FTXihStaRefund, FTXihStaDoc, FTXihStaPrcDoc,
  FCXihGrand, FCXihPaid, FTXihPosCN, FTXihRefSaleTax,
  FDDateIns, FTTimeIns
FROM TACTVatHD
WHERE FTBchCode='005'
ORDER BY FDXihDocDate DESC, FTXihDocTime DESC;
```

```sql
SELECT TOP 20
  v.FTXihDocNo, v.FTCstCode AS vat_cust_code, v.FTXihCstName AS vat_name,
  c.FTCstCode AS master_cust_code, c.FTCstName AS master_name,
  c.FTCstTaxNo, c.FTCstCardID, c.FTCstBchHQ, c.FTCstBchCode
FROM TACTVatHD v
LEFT JOIN TCNMCst c ON c.FTCstCode = v.FTCstCode
WHERE v.FTBchCode='005'
ORDER BY v.FDXihDocDate DESC, v.FTXihDocTime DESC;
```

```sql
SELECT TOP 20
  r.FTShdDocNo AS refund_doc,
  r.FTShdPosCN AS original_doc,
  r.FDShdDocDate AS refund_date,
  r.FTShdDocTime AS refund_time,
  r.FCShdGrand AS refund_grand,
  o.FCShdGrand AS original_grand,
  (SELECT COUNT(*) FROM TPSTSalDT d WHERE d.FTBchCode=r.FTBchCode AND d.FTShdDocNo=r.FTShdDocNo) AS refund_line_count,
  (SELECT COUNT(*) FROM TPSTSalDT d WHERE d.FTBchCode=o.FTBchCode AND d.FTShdDocNo=o.FTShdDocNo) AS original_line_count
FROM TPSTSalHD r
JOIN TPSTSalHD o
  ON o.FTBchCode=r.FTBchCode AND LOWER(o.FTShdDocNo)=LOWER(r.FTShdPosCN)
WHERE r.FTBchCode='005' AND r.FTShdDocType='9'
ORDER BY r.FDShdDocDate DESC, r.FTShdDocTime DESC;
```

## Appendix B: Passive File Paths And Logs Used

- `D:\AdaSoft\AdaPos4.0HpmFhn\AdaSky\SkyConfig.INI`
- `D:\AdaSoft\AdaPos4.0HpmFhn\AdaSky\Sky.mdb`
- `D:\AdaSoft\AdaPos4.0HpmFhn\AdaLog\AdaLog20260602.TXT`
- `D:\AdaSoft\AdaPos4.0HpmFhn\AdaLog\AdaImportExport260602.Log`
- `D:\AdaSoft\AdaPos4.0HpmFhn\AdaTools\AdaIni.ada`
- `apps/adapos-sync/.env`
- `apps/adapos-sync/logs/sync-20260602-075832.log`

## Appendix C: Key Passive Command Findings

- `Get-Process` showed `AdaPosBack.exe` running and no `AdaPosFront.exe` on this laptop.
- `Resolve-DnsName POSSRV` returned `192.168.0.127`.
- `SkyConfig.INI` confirmed Branch 005 FTP inbox path `httpdocs/scgroup/005`.
- `AdaImportExport260602.Log` still shows the daily `FTShdStaPrcDoc` export error on this laptop.
