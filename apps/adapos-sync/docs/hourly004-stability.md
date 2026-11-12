# Hourly 004 diagnostics and reviewed release boundary

PR #81 originally proposed a thirty-second guard. The receiving owner has not
approved that production criterion. This revision keeps the installed twelve
seconds, including PowerShell startup and all providers, capped by the remaining
collection budget. CIM calls have eight-second operation bounds inside that
outer deadline. Termination receives at most two further seconds, then the
attempt stops. No SQL or guard retry follows a timeout.

On 24 October, the retained 09:00 result reports guard unavailability after about
12.143 seconds without a failing-stage record. The cause is still unproved.
Independent central aggregate queries confirm one capture each at 10:00 and
11:00, with 6,835 declared rows, actual rows and distinct products. No 09:00
capture exists. The installed source at 11:00 reports 35 batches, one validated
acknowledgement, an empty outbox and 107.011 seconds total. These are observations
of the previous code, not validation of this candidate under SYSTEM.

The old 12:00 natural attempt later stopped with
HOST_CPU_AT_OR_ABOVE_70_PERCENT after 17.351 seconds and created no central
capture. Its failed CPU value was not retained: the recorded maximum of 62
contains only successful guard samples. The old guard also collapses invalid
numeric CPU values into that code, so the exact stopped value is unknown.
Development and packaging were active on the same host at the time; this is
not evidence of a typical production load or the cause of the 09:00 failure.
The candidate distinguishes invalid CPU values and retains the bounded failed
CPU sample when available.

The read-only takeover confirmed SERVER004, Administrator, UTC+7, installed
agent version 0.1.0, the protected complete-cohort launcher, and SYSTEM tasks
from 09:00 through 19:00 with PT20M limits. SQL metadata, using only the existing
runtime credential, identifies SERVER004/SQLEXPRESS/AdaAcc and rejects writer,
owner and sysadmin permissions. The Administrator probe does not establish
SYSTEM's provider or SQL state at 09:00. POS1's relationship to this host is
unconfirmed. The named thirty-second repair was absent from Downloads; the
installed launcher/core/guard match the original twelve-second baseline.

The candidate reports whitelisted stages for launch, PowerShell startup, host
and SYSTEM identity, Task Scheduler, processes, CPU provider, capture/delivery
locks, SQL connect and readonly boundary, each source batch, payload, durable
enqueue, upload and acknowledgement. Events contain only enumerated codes and
bounded numeric aggregates. SQL text, command lines, exception messages,
stderr, credentials, payload identities, hashes, product codes, quantities and
business documents never enter diagnostic evidence. The protocol's progress
records separate child startup from provider time; neither is SQL duration.

The existing latest-slot-result.json also retains lastSuccess with its age.
An incomplete or failed attempt keeps the previous receipt, represents unknown
counts as null, and never certifies current stock. Checkpoints retain the last
twelve events to bound disk IO; the final record contains a ring of at most 768
events and reports dropped records. Existing own-session SQL metrics remain
aggregates; sampled host CPU and process CPU are explicitly limited measurements.
The collection budget includes launch, guard, SQL connection and own-session
metric reads. The verified 11:00 handoff receipt supplies an explicitly labeled
older success if the old runner already overwrote its result with a failure;
a newer locally retained success always wins. This does not reconstruct a
complete history or certify current stock.

The default production path keeps guard/SQL-connect attempts at one. A separately
tested upload recovery candidate permits one explicit connection reset retry
after 500 ms and another successful resource guard, with exactly the original
body and identity and all time charged to the original delivery budget. The
protected launcher sets enabled:false. It cannot be enabled through an env var.
Timeout alone, HTTP overload, access denial, invalid acknowledgement, CPU/Full
Sync/host/identity/readonly failure and incomplete reads do not qualify. Outbox
and server idempotency provide restart safety; batches are never resumed or
combined across attempts. No LLM is called at runtime.

An exclusive child lease survives an unconfirmed termination and prevents
another invocation from accumulating children. Only positively dead parent and
child PIDs permit reclamation. Denied probes, malformed leases and uncertain
ownership stop and require review; foreign processes are never killed.

The single offline owner package supplies Preflight, Update, Status and Rollback.
It checks exact original bytes before staging a complete, locked release inside
the existing protected area, then atomically replaces only the Task's current
launcher pointer. The shared checkout, .env, cohort, task definitions/principals/
schedules/permissions, timezone and Full Sync/Delta code remain untouched. A
different or thirty-second installed baseline is refused, never overwritten.
Rollback accepts only this candidate and its verified original backup, preserves
queues/evidence, and refuses a foreign intervening change.

Validation uses actual collector/runner/outbox/core code with synthetic SQL and
upload dependencies, native Windows PowerShell 5.1 provider and update fixtures,
and real disposable PowerShell children for delayed startup/provider stalls.
The fixture entrypoints cannot invoke production SQL, network or tasks. Existing
Full Sync and Delta regression suites also run. These simulations do not certify
a future natural attempt. Deployment still requires review of this complete
package and owner approval, then observation of a natural SYSTEM run and an
independent central aggregate check; no compensating run is authorized.
