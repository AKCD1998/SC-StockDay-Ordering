# Hourly004 direct source read R2 — 12 November 2026

Actual deadline proof passed on SERVER004 after30049ms. The initial exact Task
lookup returned NOT_FOUND before any file read. Current follow-up behavior and
limits are in `hourly004-direct-read-r2-followup.md`; no source admission yet.

Review version: `H004-DIRECT-READ-20261112-R2`. This supersedes the R1 access
onboarding steps; it does not replace the Hourly runtime or the PR87 full-policy
controller contract. PR81, guard12s and upload recovery OFF stay unchanged.

## Verified starting point

The existing Ozymandias context observed an authorized native SERVER004
connection on 11 November. Harmless metadata ran on SERVER004 as the existing
`CodexSandboxOffline` caller under PowerShell7. File/Task reads were not attempted:
R1 required Administrator and an external deadline that the tool's yield timer
could not establish. A yield is not cancellation. The native workspace is
read-only. These facts did not establish source access or a missing capture's
cause.

R2 recognizes the two already-observed existing callers, owner and native
sandbox, while leaving their Windows tokens untouched. Actual access must still
succeed. A recognized name is neither an access grant nor proof of readable
protected files. Access denied stops without RunAs, token switching, ACL or
credential changes, or an alternate route through the main laptop.

## Bounded, memory-only execution

`hourlyDirectReadSupervisor.cjs` uses only the installed Node and native Windows
PowerShell5.1. The cloud context verifies approved artifact bytes, then builds a
fixed-mode command from those bytes. Reviewed public code is compressed and
expanded in RAM; no reader file is placed on SERVER004. No package installation,
new native Task, service, endpoint, observer or additional schedule is involved.

The Node parent starts exactly one PS5.1 child with `shell:false`, a minimal
environment, a 262144-byte output limit, `timeout:30000`, and `killSignal:SIGKILL`.
On Windows this unconditionally terminates its own child. `spawnSync` returns
after that child has closed. It does not find/kill a PID from source state, scan
business processes or terminate POS/Hourly/Full Sync/Delta. PS code and output
stay within the existing native execution policy; no policy is weakened.

Run `DeadlineSelfTest` once in the authorized SERVER004 context first. It starts
only an owned sleeping PS5.1 fixture, reads no source file/Task/SQL and must return
`PASS_DEADLINE_ONLY`, owned child closed, and about30 seconds. It does not invoke
Hourly. Then run `Status`, which invokes the reviewed read-only reader. The
30-second monitor deadline is separate from Hourly's unchanged12-second guard.

If a parent/runtime is interrupted before a complete termination result, treat
the invocation as UNKNOWN and do not retry or add recurring source calls. R2
does not claim a power-loss/parent-crash guarantee or general process recovery.
Do not kill a business process to clear uncertainty.

## Actual acceptance before changing the existing monitor

Use the existing dedicated native read context `/root/verify_direct_read_access`
owned by Ozymandias; do not create or reuse an unrelated repair worker. Refresh
trusted native inventory and task authorization, verify actual SERVER004 and
existing caller, and retain native invocation provenance. Main-laptop SMB is
not this path. One local JSON report cannot establish cloud authorization.

Record the real deadline selftest and Status results in the existing journal
using revision preconditions and exact readback. Require fileRead passed,
eleven actual Task reads with verified definitions, known queue counts, cpu-v5
pointer and zero source writes/Task runs/SQL/config/permission changes. Preserve
denied/missing/invalid/stale/unknown states. The admission helper additionally
binds timestamps, native context, reviewed bytes and Node version. The full
release/policy contract and business freshness remain independently unverified.

Only after these gates pass, update source calls in the existing cloud
automation `6ae1e857b364819198f844902670d3c2`, owner Ozymandias, with its existing
09:25–19:25 Bangkok schedule and central query/journal preserved. Keep local
hourly-004 PAUSED. Do not create a substitute schedule or replay a stock slot.
Keep source access and central delivery as separate statuses. Validate the next
natural scheduled reuse; an access test alone is not that scheduled reuse.

## Rollback and validation limits

Remove only this source-call step if needed; keep the central/journal monitor
and schedule. No Hourly release rollback, native file removal, queue cleanup or
grant revocation is part of R2. Preserve existing grants used by other work.

Regression fixtures cover recognized/foreign callers, denied access, killed or
unconfirmed owned child, bounded/invalid/sensitive output, no native workspace
writes, queue unknown, Task mismatch, replayed timestamps and independent cloud
authorization. Native PS5.1 and local sleep termination are simulations until
repeated through the authorized SERVER004 connection. Tests cannot certify a
future natural Hourly run.

Node behavior: [spawnSync](https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options)
and [Windows signals](https://nodejs.org/api/process.html#signal-events).
