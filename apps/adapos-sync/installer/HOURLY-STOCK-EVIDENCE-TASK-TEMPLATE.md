# Hourly Dual-Stock Evidence — disabled scheduling template

Status: **DESIGN ONLY — NOT INSTALLED / NOT ENABLED**

This document does not authorize a Scheduled Task, `.env` change, branch-PC
change, database write, or production upload. It records the future Task shape
so review can happen before installation.

## Intraday pilot shape

- Run the standalone `hourly-stock:evidence` command. Never invoke `start`,
  `RUN-ADAPOS-SYNC.bat`, or another Full Sync entry point from this Task.
- Create one disabled trigger per approved slot: `09:00`, `10:00`, `11:00`,
  `12:00`, `13:00`, `14:00`, `15:00`, `16:00`, `17:00`, `18:00`, `19:00`.
- Each invocation must pass its own explicit slot, for example:

  ```text
  npm run hourly-stock:evidence -- --hourly-kind=intraday --hourly-slot=09:00
  ```

- Use `IgnoreNew`, a bounded execution timeout, and a non-zero failure result.
  A missed slot remains missing; do not run Full Sync or backdate a replacement.
- The feature flag, selected product cohort and per-branch upload token remain
  empty/OFF until a separately approved canary activation.

## Morning anchor remains undecided

The durable `08:20` anchor must run only after that branch's natural Full Sync
has reached terminal success. A safe cross-task dependency has not yet been
selected. Do not create a fixed-time morning evidence trigger: it could race a
slow or retried Full Sync. This remains **UNKNOWN / ACTIVATION BLOCKER**.

Possible orchestration designs for later review are an explicit success marker,
Task Scheduler event trigger, or a backend-confirmed run check. This candidate
implements none of them.
