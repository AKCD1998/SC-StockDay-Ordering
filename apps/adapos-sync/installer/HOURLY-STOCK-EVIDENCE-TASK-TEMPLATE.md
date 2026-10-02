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


## Incremental update — 2 October 2026 self re-review

The earlier undecided-morning section records the old candidate. The current
paired Drafts implement a post-authoritative-Full receipt-gated anchor inside
the Full success path (including CP4 APPLIED), with the actual stock-read time.
A separate fixed-time 08:20 evidence trigger is still prohibited.

During future rollout, the morning Full invocation must be explicitly classified
morning_anchor/08:20; intraday invocations override it with their own slot/kind.
Do not modify the existing natural Full Task in this design-only phase.
Recovery runs cannot qualify as morning and fail the before-09:00 guard.

Pilot Task settings still need authorized installation/verification:
disabled initially, IgnoreNew, no StartWhenAvailable/catch-up, explicit slots
09:00–19:00, bounded execution, inspect non-zero Last Result and missed slots.
Use npm.cmd on Windows to avoid unrelated PowerShell npm.ps1 policy failures.
Replay-only sends stored evidence without SQL or backdating; it is not a
replacement capture for a missed slot.

Capture lateness 300 seconds and retention 30 days remain recommended choices
awaiting the human's submitted selection. Do not set production env from this
document. See docs/workstreams/HOURLY_EVIDENCE_COLLECTION_POLICY_2026_10_02.md.
Transfer gate and operational ACL/cohort/Task approvals still precede activation.
No Task/config/flag/branch-PC/Git or production change was made by this addendum.

## Human policy approval — 2 October 2026, 11:59 ICT

The human selected 5 minutes capture lateness and 30 days evidence retention.
Future pilot backend values are HOURLY_STOCK_EVIDENCE_MAX_SLOT_DELAY_SECONDS=300
and HOURLY_STOCK_EVIDENCE_RETENTION_DAYS=30. The preceding pending-selection
statement is historical; no production configuration is changed by this update.
This does not authorize retention cleanup, Task installation/enabling, catch-up,
merge/deploy or Hourly activation. The template remains disabled/design-only.
Commit/push to Draft PR #61 and fresh CI are separately authorized now; Transfer
Delta acceptance and operational cohort/ACL/Task gates still precede rollout.
