# Supplemental Hourly derived observation — Draft, OFF

Branch 004 only. No merge, deployment or new pilot is authorized by this draft.

The canonical capture retains retail `FCPdtQtyRet` and nullable stored estimate
`FCPdtQtyNow`. A separate `derivedObservation` uses schema
`adapos-ordinary16-derived-v1`, basis `retail-plus-wholesale-plus-ordinary16`:

```text
observed derived quantity = retail + wholesale + signed current ordinary16 views
```

The 16 views include PICK and pending SI; no separate cached pending quantity
is added. This is the ordinary getter variant established by the supplied
15:15 local metadata checkpoint, not a promise that future source settings
cannot change. Existing views retain their own signs, units and eligibility.
There is no guessed business-date filter or discarded pending SI correction.

## Reading and consistency

The intraday reader validates branch, explicit unique cohort, source machine
SERVER004, database AdaAcc and SQL +07:00. Metadata plus both samples share a
10-second cancellation deadline measured with a monotonic clock, so a Windows
wall-clock adjustment cannot extend the read budget. Each sample selects
primary/cache fields before and after all 16 movement sums/counts/null
counts/foreign-scope counts. Parameterized
cohort joins avoid the slow old-optimizer plan observed with an IN-based scope.
No procedure, source write, explicit source lock or isolation-option change is
used. SQL Server 2008-compatible syntax is required.

Comparison includes retail, wholesale, stored estimate, stock alias, both
cached pending fields, cache refresh and each movement component's sum/count.
A changed product has a null derived quantity and `changed-between-reads`.
This includes a change between either sample's opening and closing master/cache
projection, even if both opening samples match. Closing evidence must contain
the complete cohort; missing evidence fails the read without a fallback.
Missing/invalid components, aliases or non-POS foreign branch rows also withhold
the derived quantity. Missing movement rows alone mean zero, as in the getter.
The fixed local POS temporary scope is preserved, not filtered to branch 004.
The second sample supplies the unchanged canonical fields and stored provenance.

All vendor views contain NOLOCK; snapshot options are OFF. Two identical
samples can still be dirty, torn or miss ABA transitions. Therefore consistency
is always `unverified`, qualifying is false and businessCutoffAt is null.
The SQL read window is operational only. A source clock ahead of capturedAt
remains accepted as evidence but is explicitly reported invalid; no time is
silently corrected and no clock tolerance is invented.

The reader also returns aggregate-only `sourceClockDiagnostics` in the local
operational result. Existing SQL timestamps are bracketed by observer wall and
monotonic times; the result records a SQL-minus-observer interval, request
latency and wall/monotonic discrepancy. Host context distinguishes measurements
on SERVER004 from a remote inspection machine. Remote clock offset is not an
Agent clock defect. Quantization/discrepancy widens measurement uncertainty;
it is not a business tolerance. Non-overlapping intervals are inconsistent.
All clock results remain non-qualifying, carry no business cutoff, do not
certify NTP synchronization and never correct source or capture timestamps.
These diagnostics are not added to the uploaded payload, identity, outbox or
Backend schema. The existing timestamp checks remain strict.

`installer/inspect-hourly004-time-readonly.ps1` checks only local host/timezone
and Windows Time service/status metadata. Run it on SERVER004 with the existing
identity. It does not start services, resync time, read configuration/secrets,
change permissions or run Agent tasks. Failure stops that query and returns
sanitized JSON; the raw time-service output is withheld. This separate local
inspection is required when a remote Windows Time query is unavailable.

## Wire, persistence and reporting

The optional top-level observation has a bounded exact cohort, operational
window, sampleCount 2, fixed non-qualifying claims and per-product nullable
derived quantity plus allowlisted reason. It participates in capture identity.
Old and morning payloads retain their original builder and identity. Durable
outbox validation recognizes the new identity and replays the exact original
body without SQL re-reading or recomputation. Shared Full Sync queries, morning
projection/receipt, Delta, flags, Tasks and credentials are unchanged.

The Backend validates the separate observation, rejects it outside 004 intraday,
and persists it in a dedicated client_meta JSONB namespace. No migration or
canonical numeric column changes. Clients cannot inject that namespace through
clientMeta. Summary fetches its product array once per capture and exposes only
counts/status/window and a separately labeled derived-versus-stored comparison.
It never substitutes derived values into existing cross-time metrics. Historical
captures without it are missing, not zero or retrospectively calculated.

## Verification and remaining gates

Synthetic tests cover before/after posting invariance, torn reads, rollback/ABA,
identical dirty reads, equal-total component changes, counts, signed movements,
nullable components, aliases, branch scope, timeout/denial, identity tampering,
exact-body replay, original morning bytes, persistence and aggregate reporting.
Additional tests cover posting within either individual sample, missing closing
cohort evidence, observer/source clock context, bounded clock intervals,
contradictory samples and a backward wall-clock step during the query deadline.
These tests do not reproduce or certify the vendor's complete posting lifecycle.

The B50 bounded source probe is read-only and does not enqueue, capture, Sync,
upload or write stock. Current arithmetic observations are not historical proof.
Before any new pilot: review the consistency limitation and SI lifecycle,
confirm the active variant/scope has not changed, agree source-cutoff/freshness
and business-drift criteria, review measured load and clock diagnostics, then
approve a separately bounded pilot and rollback plan. Keep Hourly OFF throughout.
