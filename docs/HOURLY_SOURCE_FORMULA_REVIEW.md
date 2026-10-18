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
