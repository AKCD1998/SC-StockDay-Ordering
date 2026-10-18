# Hourly source formula review — 2026-10-18, draft and OFF

This review concerns branch 004 / B50 only. It does not authorize a new pilot,
source posting/recalculation, database changes, or changes to Full Sync or
Transfer Delta. It contains only structural metadata and aggregate evidence.

## Evidence boundaries

- Supplied evidence: the user ran the metadata-only v3 helper on SERVER004 at
  14:29:31 Asia/Bangkok. Its output contains 5 procedures and 19 views, with
  complete sanitized lines and no truncation. It reports zero business rows
  read and no configuration, permission, Task or source-data changes.
- Independently checked: existing `readonly_pilot` SELECT access from
  SCPRODUCTDEV to SERVER004 / AdaAcc; 18 movement views selectable; aggregate
  B50 observations at 14:37–14:38 and database consistency options at 14:39.
  This identity still lacks definition access. No alternative identity or
  permission grant was used.
- The helper redacted configuration keys, warehouse constants, empty/status
  literals and other multi-character SQL literals. Consequently the source
  structure is recovered, but a complete executable live-stock contract and
  the active configuration variant are not certified.

## What FCPdtDayEnd means in the recovered writer

`STP_PRCxUpdQtyNow` sums signed stock movements selected by the source views
into `TCNTPdtQtyNotApv.FCPdtDayEnd`. It resets that table's separate current
pending field to zero and sets `FDPdtDayEnd` to the SQL clock. It then assigns
master-stock `TCNMPdt.FCPdtQtyNow` as:

```text
stored estimate = stored retail + stored wholesale + cached pending sum
```

Its date parameter is not applied as a cutoff on that movement union. The
document-scoped writer can refresh selected products between full refreshes.
This makes a midday cache refresh possible, but is not evidence that a
particular procedure executed at the historical midday observation.

The name DayEnd therefore does not establish a completed close of business,
and its refresh timestamp is not a business-through timestamp. Formula
agreement proves arithmetic agreement with the stored writer, not the
legitimacy, age or completeness of the pending documents.

## The getter is a different read basis

`STP_PRCxGetQtyNowByPdt` reads retail plus wholesale plus the current movement
view union. The ordinary variant uses 16 views. The duty-free option `'2'`
uses 17: it replaces the sale view with its extended version and includes an
additional transfer view. The active option was not recovered from redacted
configuration keys. Observational agreement cannot select that option.

Other differences matter before choosing a replacement reader:

- The getter declares a branch parameter but does not use it to filter its
  unions. The full refresh writer filters branch, with a separate fixed local
  scope for the POS temporary view. A new reader must verify these scopes
  rather than copying an unused parameter or guessing the temporary branch.
- `STP_PRCxUpdQtyNowByPdt` omits the PICK component included by the getter and
  full refresh writer. Similarly named procedures are not interchangeable.
- Procedures that appear to SELECT can write an error log in CATCH. Do not
  EXEC them using the read-only inspection path.
- The separate current pending field is not an independently certified
  additive correction. Its agreement with the union at one time does not
  justify adding it to stored quantities in production.

## Independently observed current components

At 14:37, the complete ordinary and extended unions were observed using the
existing views, branch 004 for branch-scoped components, and the existing
local POS-temporary view scope. Both queries were bounded; combined query
time was approximately 7.8 seconds. No capture, upload or Sync was requested.

| Current aggregate | Ordinary variant | Extended variant |
| --- | ---: | ---: |
| Selected products | 50 | 50 |
| Nonzero movement totals | 14 | 7 |
| Movement total agrees with cached DayEnd | 40 | 49 |
| Movement total agrees with DayEnd plus separate pending field | 50 | 41 |
| Stored master estimate agrees with current movement formula | 40 | 49 |

Nonzero component groups were ordinary sale (9 products), POS temporary sale
(1 product), and SI sales invoice (6 products). The cached DayEnd component
was nonzero for 6 products. The separate pending field was nonzero for 10 at
this observation, compared with 9 at the earlier 12:46 probe. These are
current observations with different times, not immutable pilot evidence.

A second aggregate reconciliation at 14:38 established:

| Original pilot comparison group | Products | Nonzero current DayEnd agreeing with current SI component |
| --- | ---: | ---: |
| Forward comparison matched | 32 | 0 |
| Retail changed later, no closing field gap | 11 | 0 |
| Persistent field gap | 5 | 5 |
| Mixed movement | 2 | 1 |

Thus the 5 persistent gaps and 1 residual mixed gap have a current source
component explanation in the SI view. This does not prove when those
documents were posted or whether their outstanding status is correct.
The other 11 and the remaining mixed movement still require the previously
observed sales/posting transition evidence; no historical reconstruction was
performed by these probes.

## Read consistency and date risks

All 19 supplied views contain NOLOCK. Such reads can include uncommitted data
and missing or duplicated records; changing only the caller's isolation
level does not remove explicit table hints. See Microsoft's
[table hints documentation](https://learn.microsoft.com/en-us/sql/t-sql/queries/hints-transact-sql-table)
and [isolation-level rules](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql).
The aggregate probes inherit those hints and are not certified snapshots.

Seventeen views contain a date predicate of the form
`documentDate > DATEADD(month, -2, documentDate)`. Its right-hand side refers
to the same document date, not the inspection clock, so it does not limit
ordinary non-null document dates to the preceding two months. Do not silently
replace it or drop old pending documents without a reviewed business policy.

The existing source database reports snapshot isolation OFF and read-committed
snapshot OFF. No option was changed. Turning either on, adding stronger locks
or changing vendor views could affect POS traffic and is outside this task.
A read-only query alone is not proof of zero operational load or a consistent
business snapshot.

## Follow-up: SI status and posting-time evidence, 2026-10-18

Read-only SELECTs at 14:55–15:02 used the existing source identity and B50
scope. All quantities and document identifiers stayed inside the query or
process; only aggregate results were retained.

- For the six B50 stock codes with nonzero current SI components, 8 candidate
  documents / 35 lines had blank-or-null header and line processing states,
  no recorded approval actor, and no matching primary stock-card row by branch,
  document, stock code and warehouse. Their signed line totals agree with the
  current SI view for all six products; all candidate lines are level zero.
- The same candidate search also found 7 documents / 20 lines with processing
  states `'1'`, an approval actor and a matching primary stock-card row for
  every line. These groups must remain distinct. Code `'1'` and the presence
  of a stock-card row are observations, not independently certified lifecycle
  semantics. The exact warehouse/level predicate is still awaiting the narrow
  source-contract lookup, and current matches cannot establish history.
- For business date 17 October, the primary stock card contains 27 sale-type
  rows across 16 B50 products. Their stored creation/update audit date is
  18 October, with clock values from 07:46:22 to 07:46:30 local +07:00.
  No actual per-document posting timestamp is certified by this observation.
- The user confirms that the POS application was opened or its day started
  around 07:44–07:47 on 18 October. This is supplied operator context and is
  consistent with the observed refresh/card-writing period; it is not proof
  that opening the application caused every stock change.

The supplied full `STP_DOCxTPSTSalDT1Day` body assigns the temporary stock-card
audit date from `@ptDateTo` and its audit clock from `@ptTime`. Thus at least
this intermediate audit date can represent a processing/business date rather
than the wall-clock insertion date. The final stock-card writer must be
reviewed before treating its generic audit fields as a posting watermark.
Do not concatenate these fields into `sourceEventAt` or claim a business cutoff.

The existing source reports product version `10.50.1600.1`, database
compatibility level 80. A diagnostic query using TRY_CONVERT was stopped;
its corrected read-only form uses supported operations and returns the
aggregate clock/date components separately. No database setting was changed.

The assistant still lacks VIEW DEFINITION. A tested local helper was prepared
for the administrator's existing Windows identity. It verifies that getter
and full-refresh writer select the same configuration key, reads only that
formula setting plus the SI line-level setting, and returns narrow operational
enums and sanitized writer metadata. It never executes a source procedure or
enumerates other configuration values. Its output is still pending.

## Proposed Hourly-only correction

Keep the current draft OFF and preserve the stored retail/estimate fields
with explicit provenance. Report posted retail, the stored estimate, current
pending components and source freshness as separate concepts; do not label
the cross-time/cross-field comparison as stock accuracy.

After the active contract is recovered, a proposed live Hourly adapter should
use the selected POS movement formula and expose the inclusion of pending SI
in its interpretation. Implement it only as a bounded, parameterized,
read-only Hourly query after agreeing read consistency and posting transitions.
Do not add the pending field blindly, discard SI to force retail agreement,
run source approval/posting procedures, or change shared database options.
An unknown business cutoff remains non-qualifying even when collection and
stored arithmetic pass. Full Sync and Transfer Delta keep their current paths.

## Safe next implementation gates

1. Keep the current draft as a stored-source diagnostic adapter. Preserve the
   existing quantities, reject incomplete cohorts, label operational refresh
   separately, leave `sourceEventAt` null and freshness non-qualifying. This
   avoids turning a recent refresh or matched formula into a freshness PASS.
2. Obtain a narrowly scoped, sanitized contract for the active variant,
   warehouse/status constants, branch/POS temporary scope, kit/base-unit signs,
   and authoritative posting watermark. Do not enumerate configuration values,
   increase the read-only account's rights or infer constants from results.
3. Before implementing a live adapter, agree how to obtain a consistent
   read without changing shared database options or impeding POS writers.
   Review the SI outstanding components and posting/return/void transitions.
   Add only an Hourly-specific SELECT adapter after those decisions; do not
   execute source procedures or alter shared Full Sync/Delta queries.
4. Test each transition with synthetic fixtures, compare bounded read-only
   aggregates, measure load, and agree freshness age and drift acceptance
   criteria. The transport delay allowance is not a source-age criterion.
5. Release the compatible Backend diagnostics before the Agent only after
   review and authorization. Recheck flags OFF and Tasks Disabled. A new pilot
   needs a separate approved window and stop/rollback plan.

Status: source formula structure recovered; stored-source diagnostic draft
prepared; historical attribution and a safe live-source contract remain
PARTIAL. Hourly stays OFF.
