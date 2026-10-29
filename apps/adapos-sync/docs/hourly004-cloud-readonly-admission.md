# Cloud source access admission — preparation, not executed

This checks read access to the already-existing SERVER004 Hourly evidence and
Tasks. It does not authorize device access, install a reader, change a flag or
activate the prepared recovery. Main-laptop SMB success is not cloud proof.

## Admission order

1. In the existing cloud task, inspect its currently exposed connected-computer
   metadata. Match SERVER004 from trusted inventory. Establish the platform's
   actual task-execution authorization; Connected/online alone does not qualify.
   If false, missing or unknown, stop the source part and report NOT_AUTHORIZED
   or UNKNOWN. Do not grant access, change identity/account/ACL, install another
   remote channel or route through another computer. Central READ ONLY SQL and
   journal health remain independent.
2. Only on the authorized device perform a single bounded read-only identity
   check: actual hostname, timezone and existing Windows identity/role. The host
   must be SERVER004 and timezone SE Asia Standard Time. Mismatch stops source
   inspection; do not open another machine's SMB share as a substitute.
3. Read only the known file
   `C:\ProgramData\SC-StockDay-Ordering\hourly-stock-evidence-004\complete-on-20261022\latest-slot-result.json`.
   Check regular/non-reparse file and bounded size before reading. Return file
   access and a whitelisted aggregate, never raw JSON, filenames from a folder
   scan, stock quantities, IDs, env, tokens or logs. A readable corrupt JSON file
   means file access passed but evidence validation failed; it is not access
   denied or a zero capture. Distinguish denied, not-found, offline and timeout.
4. Connect Schedule.Service locally and GetTask for the eleven exact Hourly
   names ending0900 through1900. Read enabled/state/LastRunTime/LastTaskResult and
   verify expected action/principal/limit in RAM if needed. Do not return XML,
   arguments or SDDL. Record read success count, running count and whether a
   Task is queued/unknown. Do not call Run/RunEx/Stop/RegisterTaskDefinition,
   alter settings or read unrelated task definitions.
5. If the already-reviewed CPU-v5 owner kit is actually present, its existing
   controller may be invoked once with `-Action Status`, native PowerShell5.1,
   NoProfile and RemoteSigned. No Preflight/Update/Rollback/Recover action in
   this cloud admission job. Missing kit/reader is NOT_FOUND, not permission
   failure; do not download/install or search for credentials. A future reviewed
   successor Status adds sourceObservation; absent that contract, cloud access
   can pass while integration remains PARTIAL. Do not fabricate the new fields.
6. Use a bounded tool deadline and no retry loop. Report safe failing stage and
   whitelisted native error only. Do not change guard12s, recovery OFF, Tasks,
   credentials, ACL, SQL, services, clock, source cohort, Full Sync or Delta.

## Required receipt

Return a small aggregate with checkedAt, actual execution host verified,
deviceTaskAuthorization (authorized/denied/unknown), fileRead (passed/denied/
not-found/timeout/unverified), taskReadsExpected11/taskReadsPassed, controller
Status available/unknown and sourceObservationContract present/absent. Include
sqlQueries0, taskRuns0, configurationChanges0 and permissionChanges0 only from
the actual performed read-only scope. Keep actual tool execution provenance in
the trusted audit. These fields are evidence, not a mechanism to grant access.

Access PASS requires an authorized SERVER004 invocation and actual successful
file/Task reads. It does not certify current Hourly delivery, CPU-v5 natural
behavior, broader filesystem access or business freshness. Source integration
acceptance additionally requires the reviewed Status contract and exact-slot
source/ACK/central comparison. Any UNKNOWN remains unknown.

Do not change the existing cloud schedule as part of this admission test. Save
one sanitized receipt to the existing native journal with revision precondition
and exact readback. Reuse the current incident owner and remain quiet for an
unchanged blocked permission. Browser/UI changes remain on hold while the
separate Chrome profile backup coordinator's hold is active.
