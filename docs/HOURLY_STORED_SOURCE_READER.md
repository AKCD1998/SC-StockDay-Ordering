# Hourly stored source reader — draft, OFF

This candidate changes the standalone intraday Hourly reader for branch 004.
It adds provenance for the stored estimate; it does not implement a verified
live-stock formula or authorize another pilot. Backend support for
`clientMeta.sourceRead` must be released before this Agent candidate is used.

## Evidence and unresolved source contract

The supplied source metadata shows `STP_PRCxUpdQtyNow` assigning master
`FCPdtQtyNow` from retail, wholesale and `TCNTPdtQtyNotApv.FCPdtDayEnd`.
An independent read-only B50 reconciliation matched that stored formula for
all selected products. The table also has a separate current pending field.
Do not add that field to the estimate without reviewing the complete source
getter, its full movement-view union, posting conditions, units and signs.
Selected sanitized fragments and current values cannot reconstruct historical
posting events or establish that an outstanding component is legitimate.

The user supplied the successful metadata-only v3 inspection from SERVER004
at 2026-10-18 14:29:31 +07:00: 24 sanitized modules, no truncation, followed by
the narrow active-contract inspection at 15:15:04. The latter verifies the
ordinary 16-view getter/full-refresh variant and exact SI eligibility settings.
Independent B50 SELECTs reconcile 8 eligible SI documents / 35 lines with the
six nonzero cached components and observe 11 stored estimates differing from
the active getter at 15:19. These are current diagnostic observations, not
historical reconstruction or a consistent-snapshot/freshness certification. See
[the source formula review](HOURLY_SOURCE_FORMULA_REVIEW.md) for the recovered
writer/getter differences, independent aggregate probes and remaining gates.
A live derived estimate is deliberately not selected.

## Reader behavior

- The existing Hourly OFF check returns before SQL/files/network work.
- The new reader accepts only branch 004 and an explicit unique cohort of
  1–500 products. A single parameterized SELECT reads master and pending-cache
  components; a 10-second cancellation bound limits the request.
- Missing, duplicated or unexpected product rows reject the capture. Missing
  retail is not converted to zero. Nullable stored estimates remain nullable.
- Only the existing two quantity fields enter capture records and shadow
  processing. Component quantities, stock-code aliases and per-product
  diagnostics are stripped before transport/logging.
- `clientMeta.sourceRead` contains bounded aggregate counts and operational
  read/refresh timestamps. It never supplies a business cutoff or a freshness
  PASS. SQL failures are reported with fixed codes, not raw source messages.
- Formula checks apply only to master stock codes with available components.
  The `1e-6` tolerance addresses floating-point arithmetic, not an approved
  business drift threshold. No estimate is recalculated or written to SQL.

`FDPdtDayEnd` was observed as a local SQL datetime. Its diagnostic conversion
uses the verified branch 004 +07:00 clock, and rejects an unverified source
offset. Operational refresh time says when a component was refreshed; it does
not establish the time through which all business movements were processed.
`sourceEventAt` therefore remains null. Backend source freshness remains
non-qualifying until a business-cutoff contract and age policy are approved.
The wire value `stored-master-day-end` names a stored formula component; it
does not assert that the value is a completed end-of-day balance.

## Scope and review gates

Full Sync queries, morning-anchor logic, Transfer Delta, feature defaults,
credentials, Scheduled Tasks, cleanup and migrations are unchanged. Morning
anchors retain their authoritative Full Sync receipt and original projection.
The existing capture lock and durable replay still preserve original bodies.

Before rollout: preserve the verified active variant, resolve remaining branch
and temporary scope, posting/cutoff and read-consistency contracts; validate
pending-component lifecycle and historical transitions; test returns/voids, signed base units and double
counting; measure the selected query under read-only access; agree
freshness/drift criteria. Do not fix vendor views or change database isolation
options as part of this Hourly candidate. Keep all flags OFF and Tasks Disabled.
Merge, deploy and a new pilot require their own authorization.
Any proposed derived live estimate must have a reviewed separate source
basis/contract; the existing canonical retail and stored-estimate meanings
must remain intact, and reports must distinguish the evidence series.
