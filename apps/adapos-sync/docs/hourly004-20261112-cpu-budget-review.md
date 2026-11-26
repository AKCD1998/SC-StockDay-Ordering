# Hourly004 09:00 CPU budget incident — review candidate only

This note supersedes the original PR description's proposed 30-second guard.
The installed CPU-v5 guard and this candidate both use **12,000 ms**. Upload
recovery remains OFF. This change is not installed, merged or deployed.

## Verified evidence

Read from SCPRODUCTDEV using the existing identity and authorized SMB/remote
Task Scheduler path on 12 November 2026, 12:50–12:53 Asia/Bangkok. No Task,
SQL, capture, upload, replay, configuration or permission change was requested.
This path does not establish Ozymandias cloud source authorization.

| Evidence | Result |
| --- | --- |
| 09:00 Task | Started 09:00:01; last result 1 |
| Durable failed attempt | 09:00:01.718–09:02:51.992; stopped-no-partial-capture |
| Progress retained in receipt | 4,600 products observed; accepted unknown; pending 0 |
| Inner guard | stage cpu; BUDGET_EXHAUSTED; elapsed 11,345 ms; budget 12,000 ms; no retry |
| Enclosing diagnostic stage | capture-lock |
| 12:00 source | 6,835 products, 35 batches, accepted 6,835, ACK 1, pending 0; Task result 0 |
| Central monitor at 12:21:33 | 09:00 capture 0; 10:00/11:00/12:00 each one capture, declared/actual/distinct 6,835 |
| Source code baseline | Guard process, PowerShell guard, CPU provider, failure history and protected runtime match PR81 CPU-v5; runner differs only in line endings |

The capture lock wraps the complete SQL/collection callback. A failure unwinds
through that outer stage, so its name does **not** prove lock contention. The
inner guard ran out of usable time for a fresh CPU observation after partial
collection. It did not produce a partial acknowledged capture. No stock values
or product identities were inspected for this investigation.

CPU sampling requires at least 1,250 ms before entering/after initializing and
before its one-second interval. At the recorded parent failure only 655 ms
remained. The old evidence cannot distinguish time spent starting PowerShell,
reading Task/process providers, compiling the native binding, or the exact CPU
sampling subphase. High CPU, WMI corruption and a lock deadlock are unproven.
Later successful slots do not repair the 09:00 delivery gap.

## Confirmed diagnostic defects and proposed mitigation

1. The child used ConvertTo-Json's default depth 2. Nested native error entries
   could become strings; the parent correctly rejected them, losing the codes.
   Use depth 8 while preserving the existing bounded output and whitelist.
2. Failure history chose the last enclosing failure event. Prefer the validated
   inner guard stage, so a CPU failure is recorded as cpu-provider. Historical
   receipts are not rewritten or retroactively reinterpreted.
3. Retain only enumerated CPU subphases and bounded remaining/initialization
   milliseconds through the existing sanitized error/receipt path. No new log,
   scheduled task, evidence collector, database table or schema is introduced.
4. Replace per-child C# compilation with in-memory declarations of the same
   three kernel32 APIs. FILETIME remains two sequential uint32 fields and native
   error capture is preserved. No compiler process or generated binding file is
   needed. This is a setup-cost mitigation, **not proof of the original cause**.

Five alternating fresh PS5.1 processes per implementation on SCPRODUCTDEV measured
binding initialization only (no CPU sampling): baseline median 144.565 ms
(139.219–216.049); candidate median 51.118 ms (50.177–54.408). A separate local
native smoke read returned a valid fresh two-point GetSystemTimes observation.
These development-host results cannot predict SERVER004's SYSTEM run or prove
that this saving alone covers the missing sampling budget.

## Preserved boundaries and validation

No guard/CPU threshold, sampling interval/freshness rule, provider fallback,
CPU cache, retry, collection window, batch size, cohort, Task, Full Sync, Delta,
credential, ACL, backend or production flag is changed. CPU >=70%, unavailable,
stale, denied and deadline cases continue to stop collection.

Regression coverage includes the 4,600-product failure with the real collector,
runner and receipt writer against synthetic SQL/HTTP; it must close SQL, enqueue
nothing, acknowledge nothing and preserve pending 0. Native PS5.1 fixtures cover
655 ms remaining at CPU entry/after initialization, interval exhaustion, native
error codes through actual JSON serialization, and unchanged CPU boundaries.
Later successful receipt/restart cases must retain the earlier failure.

An independent local reviewer found no blocking defect in the code candidate.
The full Agent suite passed locally: 398 tests, zero failures/skips, including
the native PS5.1 fixtures. PR CI must still be checked on the pushed revision.
Actual SERVER004 SYSTEM/natural acceptance of this patch has not occurred.

## Release, rollback and remaining work

This is a code-review update in existing PR81. Do not run the old CPU-v5 updater
to install it, and do not overlay the immutable installed v5 release directory.
After code approval, a separately reviewed release must pin the **installed v5**
before-image, stage a distinct immutable candidate, preserve existing config,
ACLs, Tasks, queues/receipts and provide Update/Status/Rollback/Recover coverage.
Production installation still requires the user's approval.

Before installation, rollback means reverting this candidate commit in the PR;
production stays on the installed CPU-v5. After an approved installation, use
only that new release's verified rollback to the installed-v5 before-image.
Do not reuse v5's older rollback-to-v4 as the rollback for this candidate.

Acceptance must compare the next **natural** SYSTEM attempts with their Task,
guard, complete read/ACK/pending and independent central aggregate. Preserve
the original 09:00 gap and stop at any denied access. No compensation/replay or
manual Task/capture/upload is part of this change. If another guard fails, use
its retained subphase/provider evidence; do not increase 12 seconds or relax
CPU/freshness checks to make a test pass.
