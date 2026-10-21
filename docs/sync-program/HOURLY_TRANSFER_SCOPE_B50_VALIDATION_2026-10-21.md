# Hourly transfer branch scope: B50 validation, 2026-10-21

## Problem and change

The Hourly intraday movement projection included transfer groups whose
stock-affecting branch was outside 004. A real B50 product had one such TNF42
group, so the existing foreign-branch safeguard suppressed its derived quantity.
The stored retail and estimate remained intact.

Filter the six transfer components by their projected `FTBchCode = '004'`
before aggregation. The recovered source definitions project these branches:

| Components | Projected branch |
| --- | --- |
| TNF41 | Receipt destination (`FTPthBchTo`) |
| TNF42 | Issue origin (`FTPthBchFrm`) |
| TNF31, TNF32 | Document branch (`FTBchCode`) |
| TNF7, TNF8 | Destination (`FTPthBchTo`) |

NULL, blank and whitespace-only transfer branch identities remain visible to
the existing safeguard and suppress the derived quantity. They are not silently
treated as movements from another branch or as zero stock movement.

Signed quantities still come from the existing vendor views. Other movement
components retain their foreign-branch safeguard, and the local POS temporary
view retains its existing scope. Posting-change suppression, deadlines, schema,
canonical quantities, Full Sync queries, morning anchors and Transfer Delta paths
are unchanged. This adapter still accepts only branch 004.

## Actual read-only B50 comparison

On 2026-10-21 at approximately 09:16 Asia/Bangkok, the final candidate ran from
SCPRODUCTDEV against SERVER004 using the existing technically read-only SQL
account. The candidate was not installed on SERVER004.

Independent opening and closing references read source stock/cache rows and
movement groups by branch, without reusing the candidate query builder. Each
candidate quantity was compared in memory with:

1. Retail + wholesale + the independently branch-scoped movement sum.
2. Stored estimate + current pending cache, as a separate source reference.

Only aggregate results were retained; no product identities, quantities,
document contents, credentials or raw result rows are included here.

| Check | Result |
| --- | --- |
| Selected / returned products | 50 / 50 |
| Retail matches, opening and closing references | 50 / 50 each |
| Stored-estimate matches, opening and closing references | 50 / 50 each |
| Derived matches, independent movement formula | 50 / 50 each |
| Derived matches, independent cache formula | 50 / 50 each |
| Reference products unchanged across the comparison | 50 / 50 |
| Derived quantities available | 50 / 50 |
| Previously suppressed transfer case reconciled | 1 / 1 |
| Excluded foreign transfer groups | 1 |
| Missing source fields | 0 |
| Candidate reader duration | 624.129 ms |
| Opening / closing reference duration | 216.869 / 200.230 ms |

An earlier completed candidate read also matched all 50 opening references, but
took 2247.530 ms. It stopped further reads under the unchanged 2000 ms load guard
and did not collect a closing reference. That slower observation is preserved;
the later comparison does not establish a latency guarantee. The reader deadline
remains 3000 ms for these checks.

## Regression coverage and limits

All 273 Agent tests pass locally, including transfer signs, local and foreign
groups, foreign-only groups, missing-branch rejection, local posting changes, retained
foreign non-transfer rejection, payload compatibility, Full Sync and Delta tests.

This is a current-source arithmetic and mapping check. Vendor NOLOCK views still
do not prove an atomic snapshot or exclude ABA changes. Physical stock counts,
business freshness, committed posting transitions and time synchronization are
not certified. Derived observations remain `observed-unverified`, with
`qualifying = false` and no business cutoff timestamp.

Hourly remains OFF. No source configuration, Task, code, stock data, Full Sync or
Delta settings were changed. No Sync, capture, upload, deployment or pilot was
requested by this validation.
