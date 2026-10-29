# Hourly004 recovery and cloud-source inspection — review only

This candidate builds on PR #81's CPU-v5. It does not install a release, enable
recovery, update the cloud schedule, grant device access or change production.
The approved CPU-v5 ZIP and its source worktree are unchanged. Do not build this
candidate into another ZIP named CPU-v5: a separately pinned successor package
and explicit release review are required after v5's natural SYSTEM acceptance.

## Verified starting point, 29 October 2026

- Main execution host: SCPRODUCTDEV, existing scgro identity, Bangkok time.
- At 14:43 the actual SERVER004 launcher still matched approved checkpoint-v4;
  Hourly/complete ON, anchors OFF, Delta apply ON, upload recovery OFF.
- Actual 09/10 Task result1 and central capture0; WMI CPU query cancellation
  events align with the guard. The preserved 13:00 result explicitly records
  CPU_UNAVAILABLE before SQL; underlying Windows cause remains unproven.
- Actual 11/12/14 delivery: one capture per slot, declared/actual/distinct6835.
  The 14:00 source ACK6835/pending0/Task0 agrees with independent central SQL.
- Cloud checks labelled12:25 and13:25 queried central and persisted native Docs
  journal records. Trigger provenance is UNKNOWN; labels do not certify trigger
  type. Dot's direct source execution authorization remains UNVERIFIED.

Fixtures below are not natural SYSTEM or cloud-device results.

## Change and ownership

The existing controller's Status adds an allowlisted source observation: check
time, expected-host/timezone booleans and the actual latest Hourly Task start,
enabled/running state, result and definition-verification boolean. Definition
checks compare the exact launcher, working directory, SYSTEM principal and
20-minute limit in RAM. Arguments, SDDL, credentials, raw errors and quantities
are never returned. Status does not query CPU, SQL, invoke a runner or run/alter
a Task. Existing Task access failure returns unknown.

`hourlyCloudInspection.js` reconciles a fresh Status observation with a separate
read-only central aggregate for an exact date and slot. No import-time I/O.
The stdin adapter performs no file/network/config/SQL access; inputs are bounded
to64KiB. It is a validator, not authentication: the cloud orchestrator must set
deviceAccessVerified only after the platform's actual execution authorization
and target SERVER004 are established. Never trust that field from a source file
or let a payload's host claim grant access.

Source observation freshness here is a monitor-age bound, not stock business
freshness or proof of synchronized clocks. PASS means source ACK, Task and one
central capture agree for the same slot. Multiple captures require review; do
not sum them into one success. Historical success stays labelled historical.
Unknown source or SQL counts stay null. Journal persistence is independent, so
a journal outage cannot suppress a fresh central query or erase its evidence.
All timestamps require an explicit timezone, accepting native PowerShell's seven
fractional digits. Impossible calendar values and a completed attempt longer
than the existing20-minute Task limit are unverified. A current failure code
contradicting an alleged success cannot certify delivery.

The existing review-only upload recovery retains original primitive delivery
inputs before calling its provider. One explicit ECONNRESET can produce at most
one additional POST with the exact body/identity, after500ms and a fresh guard,
within the original30-second delivery budget. A provider cannot mutate the body,
branch, token or destination of that second POST. A receiver-commit/connection-
reset fixture verifies a duplicate receipt produces one simulated insertion.

Timeout alone, HTTP429/5xx, auth/ACL, SQL, storage, bad ACK, unknown guard/CPU and
high CPU are not eligible for this first recovery phase. No collection retry,
partial-read resume, replay, backfill, new worker or Task is introduced. The
protected runtime still passes enabled:false; there is no new env switch and
the runtime summary remains recovery OFF.
An inner ECONNRESET never overrides an outer application error or HTTP status.
Only a plain reset, or a fetch wrapper with no outer stop code and an explicit
reset cause, can enter this review-only path.

## Acceptance sequence

1. Owner installs the already-reviewed CPU-v5 locally using its existing
   Status/Preflight/Update controller. Main must not retry previously refused
   remote writes or change identity/channel/ACL. Keep guard12s, CPU70stop,
   recovery OFF,6835/batch200/read60s/collection15min/Task20min.
2. Compare a natural SYSTEM slot's observed6835,35batches,ACK6835,pending0 and
   Task0 with one independent central capture6835/6835/6835. No manual run or
   catch-up. Preserve failure evidence before the next slot overwrites v4 views.
3. Review this additive Status contract, validator, nativePS5.1 fixtures and
   recovery fault tests. After v5 acceptance, produce a separately versioned,
   pinned successor package; do not overwrite the approved v5 bundle or its
   installed directory. This preparation PR alone is not a release approval.
4. Verify the cloud task can execute on SERVER004 through its existing approved
   device connection. Connected/online is insufficient. If task authorization is
   unavailable/false or access denied, report that dimension and continue central
   READ ONLY SQL. Do not use SCPRODUCTDEV as a proxy, change account/ACL, add an
   alternate remote channel or expose a new public endpoint.
5. On the authorized target use only the reviewed controller's `-Action Status`
   via native PowerShell5.1/RemoteSigned. One request with a bounded tool timeout;
   do not request Preflight, Update, Run, Sync, capture, upload or recovery from
   the cloud monitor. The check reports completed cached evidence and reads Task
   metadata; it does not take another stock sample.
6. Roll the reviewed cloud-source check into the EXISTING hourly25-minute
   automation only after permission and readback acceptance. No new schedule.
   Keep recovery OFF until a separate decision on the narrowly defined recovery
   phase and a pinned release. Successful simulations alone do not authorize ON.

The existing CPU-v5 rollback returns the pinned v4 runtime and reintroduces its
CIM CPU dependency. This preparation is rolled back by dropping its branch or
reverting its commit; no production rollback action has been run. A future
successor release must have its own Update/Status/Rollback/Recover acceptance.

## Existing cloud runbook delta, not applied

Keep the existing cloud automation and its current notification policy. Resolve
its identity from the established trusted configuration, not an invented ID.
Central query and source read are independent of journal availability. Use the
native Render connector's READ ONLY transaction and the existing native Docs
journal, resolving its exact reference through the authorized connector. No local
`/workspace/shared` path or laptop file is a prerequisite for central checking.

Calculate expected slots in Asia/Bangkok09:00–19:00 on the requested date.
Read counts grouped PER CAPTURE before aggregating per slot. Central input is
`{readOnlyVerified:true,branchCode:'004',observedAt,slot,captures,declaredRecords,actualRows,distinctProducts}`.
Bind the branch from the query's actual branch predicate/group, not by copying
another branch's totals. `observedAt` is the database statement snapshot time
(for example statement_timestamp formatted explicitly as UTC), not the later
time the caller received the response. Missing, stale or future query times
remain unknown. Take the independent checker `now` after both reads complete.
If a successful source finishes after the central snapshot, report PARTIAL /
CENTRAL_OBSERVATION_PRECEDES_SOURCE_COMPLETION. The orchestrator may perform at
most one fresh READ ONLY central query within the existing check budget, then
report the result or unknown. Do not run another capture or create a schedule.
Capture identity and stock rows stay private/in RAM; return counts only.
`readOnlyVerified` must come from the actual authorized connector execution on
the approved database, not from a source file's claim or a copied payload.

Source read admission must establish actual task execution authorization on
SERVER004 before invoking Status. No authorization means `deviceAccessVerified:
false`, not an attempt via another computer. A deployed successor Status returns
the additive `sourceObservation`; the current v5 installer alone may not contain
it, in which case source contract remains unknown. Send the original bounded
JSON to the pure validator or apply the reviewed contract; an unavailable
validator is another unknown dimension, never a reason to skip central SQL.

Append one sanitized parsable event at nativeDocs endOfSegmentLocation(tabt.0)
with revision precondition, then read back its exact event ID/payload. On an
uncertain write, read first; at most two revision-conflict attempts. Do not reset
or overwrite old events. Persist actual trigger provenance or UNKNOWN; do not
infer scheduled/manual from a planned-time label.

Reuse the current Ozymandias incident owner. Update the existing source-guard
incident for repeated failures; do not create a child/notification every hour
for unchanged evidence. Source/device/central/journal health are separate. A
new actionable failure, recovery, completion or owner action is meaningful;
unchanged ordinary checks remain quiet. No indefinite polling, Task Run,
backfill or automatic threshold/code/credential/permission change.

Official platform boundary: cloud execution does not automatically inherit
local files, apps, sessions or private-network access; connected-computer local
tools require approval and policy support.
https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security#security-at-a-glance

## Preserved scope

No backend/schema/migration/flags or public endpoint. No Full Sync/Delta
001/004/003/005 entrypoint, credentials, cohort, ACL, scheduled Task or automation
change. No POS SQL or business-document write. No production tool action by the
new validator. The Chrome backup hold is respected; no browser/UI is needed for
this preparation.
