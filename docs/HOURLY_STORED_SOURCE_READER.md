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

Complete source definitions remain pending the authorized metadata-only
inspection on SERVER004. A live derived estimate is deliberately not selected.

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

## Scope and review gates

Full Sync queries, morning-anchor logic, Transfer Delta, feature defaults,
credentials, Scheduled Tasks, cleanup and migrations are unchanged. Morning
anchors retain their authoritative Full Sync receipt and original projection.
The existing capture lock and durable replay still preserve original bodies.

Before rollout: recover and review the complete source formula; explain the
remaining pending components; test posting transitions, returns/voids, signed
base units and double counting; measure the selected query under read-only
access; agree freshness/drift criteria. Keep all flags OFF and Tasks Disabled.
Merge, deploy and a new pilot require their own authorization.
