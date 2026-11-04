# PDA whole-number entry policy — 4 November 2026

The user confirmed Render's “My Workspace” for a read-only check of stock behind `https://sc-stockday-ordering.onrender.com/#/`. No fractional stock was found in the inspected current tables or retained snapshots. New count entry in the existing branch-001 PDA candidate now accepts nonnegative whole numbers, pending a future business-rule change.

## Production evidence

Admission confirmed database `sc_drug_db`, `transaction_read_only=on`, at `2026-11-04T09:44:02.6029Z` (16:44 Bangkok). Queries used Render's read-only PostgreSQL connector. Exact SELECT statements and sanitized results are in [the evidence JSON](evidence/PDA_STOCK_PRECISION_2026-11-04.json). No production values were changed.

| Checked source | Coverage | Nonzero fractional parts |
| --- | --- | --- |
| `ada.branch_stock_snapshots` | 6,861 product rows × six branch columns: 000–005 | 0 |
| Same table, all-branch total | 6,861 values | 0 |
| `ada.stock_snapshots`, branch 001 | 739,573 `qty_on_hand` snapshots; 22 July–4 November 2026 | 0 |
| Same history, all retained branches | 3,925,796 `qty_on_hand` snapshots | 0 |

The check is `quantity <> trunc(quantity)`, so `3.0000` is correctly classified as an integer. All current branch quantities and historical `qty_on_hand` values in these results are nonnull. The total includes one retained row for branch 900; its business role was not inferred. The five regular branch groups contribute 3,925,795 rows. History has no branch-002 group.

The frontend's two-decimal formatting can display `3.00` without stock having a fractional part. Numeric schema precision and synthetic ingestion examples containing `3.5` are not evidence of actual fractional stock. The two supplied June workbook examples likewise had no fractional values in the inspected stock-reference/count columns.

This establishes the inspected retained data only, not that fractions never existed before retention or in deleted records. Branch 001's retained interval starts 22 July. Regular branch `qty_base` is null, so canonical smallest-unit completeness is unverified. This audit does not independently validate every Hourly/Shopee projection or the live Ada database. A logged-in website browser session was not inspected; the production database behind the site was queried instead.

## Implemented scope

`quantity-policy.mjs` names the temporary `whole-number-v1` entry rule. The current `/pilot-001.html` frontend requests a numeric keypad and validates each lot before review and payload creation. It accepts zero and integers within the existing nine-digit per-lot bound. Decimal, signed, exponential and malformed text is rejected with Thai guidance and focus on the field. It does not strip a decimal point or round a value. Integral totals, confirmations and history display without trailing `.000`.

The request remains the existing exact three-place decimal-string contract: entering `3` produces `"3.000"`. Only the user-input validation call in the payload builder changed; fields, identities, lot/date semantics, scope/round, correction linkage and source references did not. Unit choice is still explicit. No conversion to a smallest unit is inferred.

Stored records retain their exact quantity. A stored integral `"3.000"` opens for correction as `3`; historical `"2.500"` remains visible as `2.5`. A fractional unfinished draft or correction requires an explicit revised count before new submission. Existing immutable queued requests are not rewritten, revalidated with the new entry rule, or rounded: retry still submits the original stored JSON through the unchanged outbox and transport. Database numeric types and server validation remain unchanged. This is a PDA input policy, not server-wide enforcement.

The worker caches the new policy module as a public shell asset; the existing preparation script fingerprints it. API/auth responses are still excluded. No API route, token/PIN/refresh behavior, storage namespace, backend, website stock display, scanner, torch default, auth/CORS or production deployment changed. The old R2 app and hosted v4 remain unchanged.

## Verification

Targeted parser checks cover whole/zero bounds, rejected decimal/signed/exponential input, and lossless display of stored fractions. A local Chromium check uses explicitly synthetic read-API fixtures and a fake camera. It checks rejection of `2.5` without changing the field, correction to `2`, total `3+2=5`, S/M unit labels, integral wire quantities, legacy fractional history, and an actual offline shell/draft cold reload with the new module. Its pending requests are inspected in IndexedDB; it does not submit counts to a backend. Prior HTTP/PostgreSQL evidence remains separate and was not rerun for this input change.

Prepared assets and screenshots are local review artifacts only. ScProductDev, physical Android, HTTPS staging and production acceptance are not established by these browser checks. No publication or official-stock write occurred.
