# Complete-cohort guard diagnostics and bounded startup

The 24 October 09:00 source run stopped after 12.143 seconds with
`HOURLY_SOURCE_GUARD_UNAVAILABLE`, before a product capture. The previous
wrapper allowed 12 seconds for PowerShell startup and all Task Scheduler/CIM
checks together, discarded stderr, and collapsed timeout, provider failure,
busy work and invalid output into that same code. The retained result cannot
identify which stage failed. A deadline is plausible, not proven.

The unchanged 10:00 natural run subsequently delivered 6,835 products in 35
batches. One central capture contained 6,835 rows and 6,835 distinct products;
the source queue was empty and its task returned zero. This is evidence about
that existing run, not validation of the new guard under SYSTEM.

The replacement keeps CPU below 70%, the 15-minute Full Sync exclusion,
unreadable-process rejection and host checks. It adds:

- A 30-second ceiling including child startup, capped by the remaining approved
  collection budget. An unsuccessful child is terminated, with at most two
  additional seconds to wait for closure; collection then aborts.
- Eight-second CIM operation timeouts. The parent process remains the outer
  bound because a provider's operation timeout is not an end-to-end guarantee.
- Flushed, bounded JSON-line progress for host, tasks, processes and CPU.
- Whitelisted failure summaries with stage, reason, duration and budget. Raw
  child output, command lines, stderr and exception messages are excluded.
- No automatic retry, partial capture, compensating task or upload after guard
  failure.

SQL batch deadlines, collection/Task limits, cohort, schedules, credentials,
Full Sync and Transfer Delta are unchanged. The read-only guard does not prove
stock snapshot atomicity, business freshness or Windows clock synchronization.

Validation includes fault-injected child processes; native Windows PowerShell
5.1 provider fixtures; a native child delayed 13 seconds; a stalled native
child terminated with its last stage retained; and existing collector, runner
and Full Sync wiring regression fixtures. These are simulations on the
development host. The next natural SYSTEM run must be checked separately.

SERVER004 currently uses an owned, protected complete-cohort launcher that
injects its guard. A repository merge alone does not update that launcher.
The separately reviewed owner repair patches only its guard/module and local
safe summary adapter, verifies unchanged configuration/task definitions/ACLs,
and retains original script bytes for rollback. It refuses a changed baseline,
running work, or installation within five minutes of a scheduled Hourly run.
