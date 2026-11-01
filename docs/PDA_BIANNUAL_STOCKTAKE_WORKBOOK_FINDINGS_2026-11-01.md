# Twice-yearly stocktake — supplied workbook findings

Date: 2026-11-01, Asia/Bangkok. Same SC StockDay PDA project and owner. The user supplied two branch-001 Excel examples and confirmed that stocktaking occurs **twice per year**. The user explicitly clarified that **นับ1 / นับ2 / นับ3 are independent recounts of the same stock**. These columns must be compared, never added together.

This is a read-only workbook review and an architecture update. No spreadsheet content was treated as agent instructions. Neither original workbook was modified, imported into an operational database, or used to create a live stock/count record. The previous R2 and branch-001 candidate archives remain unchanged. The clarification is not production activation approval.

## Verified workbook structure

Inputs: `กรอกข้อมูล 001 2026-06-16.xlsx` and `กรอกข้อมูล 001 2026-06-17.xlsx`. Original hashes and sheet-level counts are retained in the separate `pda-workbook-review/workbook-structure.json` artifact. Cell values/formulas were inspected without executing spreadsheet formulas or following external links.

Both templates have product-code, product-name, barcode, unit, quantity/reference and category columns, plus `นับ1`, `นับ2`, `นับ3`. PRINT sheets also contain `รวมนับช่องนี้`; RD sheets have a differently labelled `รวมเงินช่องนี้`. Those two labels are not assumed to have the same meaning or unit. No lot/manufacture/expiry columns were found in the reviewed headers.

The June-17 PRINT sheets contain:

| Section | Product rows | Filled numeric combined-count cells | Explicit zeros within those cells |
|---|---:|---:|---:|
| 001 PRINT เภสัช | 987 | 403 | 36 |
| 001 PRINT สามัญ | 1,407 | 324 | 54 |
| 001 PRINT ปกติ | 633 | 205 | 22 |
| Total | 3,027 | 932 | 112 |

There are 3,027 distinct barcode/unit pairs across those PRINT sheets. The 2,095 unfilled combined-count cells are **not evidence of zero stock**. All three separate round columns are empty in the supplied examples. The 932 entered combined values therefore cannot be assigned to a particular round, authenticated counter, observation time or approved final result without further evidence.

RD15/RD16/RD17 contain corresponding reference/catalog rows; they must not be counted again as additional physical stock. All inspected product barcode cells in these sheets were strings. Preserve them as strings in every subsequent import/export.

## Revision and identity findings

- The June-16 and June-17 RD15, PRINT เภสัช and RD16 cell values/formulas are identical.
- All 1,407 PRINT สามัญ rows changed position. Matching by barcode/unit shows identical product-code and reference quantities, and no entered-count difference after treating empty string and absent cell as the same **unentered** state. Raw row comparison alone would falsely suggest thousands of stock changes.
- June-17 adds RD17 and supplies 633 complete product identities in PRINT ปกติ. The June-16 PRINT ปกติ has no product names/barcodes in the expected columns, although its unlabelled code column and four zero cells contain values. Those zeros cannot be assigned to verified product identities from that sheet alone.
- The June-16 sheet named `001 PRINT ปกติ` has the title **สาขา 003**. This must be an import-review exception, not an automatic branch correction based on the filename.
- PRINT sheets include an extra unlabelled B code column. Many B values differ from the labelled C code. In the complete June-17 sheets, C matches the corresponding RD code by exact barcode for all 3,027 rows; B almost never does. This establishes workbook correspondence, not authority over the current live product catalog. Keep both raw values and verify against the shared catalog; do not infer an old/new-code mapping.
- Filenames are source provenance, not proof of two distinct stocktakes, count-observation timestamps or an approved final revision. Adjacent daily files must not become two additive counts.

## Target workflow for the twice-yearly count

```mermaid
flowchart LR
  Session[Create branch stocktake session] --> Scope[Review catalog/reference and assign areas]
  Scope --> Rounds[Independent counts 1 / 2 / 3]
  Rounds --> Compare[Compare the same scope]
  Compare --> Resolve[Recount and resolve exceptions]
  Resolve --> Final[Finalize evidence and export]
```

Each twice-yearly event gets its own session ID, branch, scope and cutoff; dates/round requirements are configured rather than inferred from workbook filenames. The three workbook sections are product groupings, not proof of physical floors/locations.

Each observation belongs to **session + branch + physical location + product identity + explicit unit + round/task + operator/device**. Within that scope, lots are child rows containing printed lot identity, quantity, manufacture/expiry metadata and uncertainty. Lot quantities sum within one round and compatible unit; independent round totals are compared. Different locations may be added only after coverage and duplicate scope are verified. Matching first/second counts of 3 represent 3, not 6.

The required-round policy is explicit. The supplied files do not establish whether a third count is mandatory for every item or only for exceptions. Disagreement needs reconciliation with a reason; neither averaging nor an automatic majority vote constitutes acceptance. Blind recount entry is a recommended mode: previous counts/reference quantities are withheld until the counter's result is locked, while the existing ad hoc discrepancy-confirmation workflow remains available separately.

Corrections append a new revision to the affected round/task and preserve its original evidence. A different counter's round 2 is a separate observation, not a correction to round 1. Correcting a round invalidates reconciliation/finalization based on its old revision. A later delivery is a movement/later observation, not another independent check of the original cutoff.

## Smartphone responsibilities

The operator sees the session, branch, assigned area, section and count round before scanning. Scan the product, explicitly select the real counting unit, enter quantities per lot, save, and proceed to the next item. Existing deliberate camera capture and Bluetooth keyboard input feed the same selection flow; a repeated scan never increments stock automatically.

Known lot identities/printed dates can reduce retyping, but the next counter still verifies the physical lot and enters an independent quantity. Quantity completion and metadata completeness are separate states: unknown dates/lot code are explicit and reviewable, never invented or silently defaulted. Production date metadata needs original printed text and day/month/unknown precision; the current candidate's full-date-or-null parser does not yet implement month-only printed dates.

The immutable outbox retains task/round/assignment revision and original observation time. A server receipt means evidence was stored; it does not mean a session was reconciled, finalized or published to website stock. Offline late uploads cannot overwrite a reassigned task or silently create duplicate stock.

## Website responsibilities

StockDay needs a stocktake-session workspace showing the scoped product list, assigned counters/areas, not-started/received/recount/finalized states, count 1/2/3 totals, accepted total, comparable reference and coverage. A product expands into lot rows for a selected location/round and original/correction history.

The web and phone must use the same backend and evidence records. An accepted finalization links the exact count revisions, coverage and reconciliation decision. Expiry review shows last-observed lot quantities and timestamps, not invented real-time remaining balances when sales lack lot allocation. Existing Full Sync/Hourly refreshes must not erase lot observations.

A compatibility export should retain the familiar product summary/round columns and add separate **Lots** and **Audit** sheets, with source rows/identities and evidence IDs. The old combined-count column needs an explicitly approved meaning before export/import mapping; it is not automatically a sum of independent recounts. Preserve blanks versus explicit zeros.

## Backend boundary and current gap

The shared backend retains the existing product catalog and adds session/location/task/round observations, child lot/date records, idempotent receipts, resolutions and immutable finalizations. Source-file imports, if later requested, belong in a review/staging layer with workbook hash, sheet, cell/row, raw codes, unit and unknown observation time; legacy values must not masquerade as authenticated phone observations.

The already prepared branch-001 candidate implements durable **ad hoc product observations**, lots, receipts, corrections and a queue. Its count-history head is currently keyed by branch/product/unit. It does **not** implement sessions, areas, three independent rounds, blind recounts, verification, finalization or the main website's stocktake workspace. Those require explicit contract and schema extensions; adding a round number to a note is insufficient. The existing source-selection gate remains unchanged.

Consequently, activating that earlier candidate alone would not replace these twice-yearly workbooks. The next implementation priority is session/area/round scope and web reconciliation/export around the shared evidence model. Official-stock publication remains a separate accepted unit/identity/coverage/cutoff policy. A stocktake from months ago must not remain the current human stock source indefinitely without verified later movements/freshness rules.
