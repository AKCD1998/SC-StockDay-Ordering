# Hourly Stock hardening — 2 October 2026

Status: APPROVED FOR DRAFT PUBLICATION / NOT ACTIVATION APPROVED.
Human continuation authorizes commit/push and refreshing Draft PR #61,
not merge/deploy or production configuration.

## Contract and safety

- Canonical stock remains FCPdtQtyRet. Nullable FCPdtQtyNow is evidence only.
- Agent runner, durable Full anchor and Backend ingestion/retention defaults
  remain OFF. No production token or Scheduled Task is configured by this change.
- Selected fixed cohort only, 1–500 unique products, <=256 KiB request body.
- The standalone runner accepts intraday slots 09:00–19:00 only.
- A morning anchor is queued inside the authoritative Full success path,
  including CP4 APPLIED and the terminal success run-log. It uses the actual
  stock-read timestamp, explicit morning_anchor/08:20 classification and a
  central Full run receipt. Backend validates branch/date/full/success/apply.
- Morning capture must be 08:20 inclusive to 09:00 exclusive Bangkok time.
  This classification guard does not approve lateness or QtyNow accuracy.
- The local outbox atomically persists/fsyncs exact bodies before delivery,
  replays without SQL reads or rewriting capturedAt, and removes a capture only
  after matching branch/count/capture-time acknowledgement. It stores no token.
- Capture mutex excludes Full/intraday overlap. Hourly releases SQL and the
  capture lock before HTTP retries. Full waits at most 120 seconds; malformed
  or live-process locks are not automatically age-evicted.
- Queue cap: 168 files including orphan temp captures. No unacknowledged data
  is silently evicted. A full/corrupt queue requires operator review.
- Explicit recovery: node src/hourlyStockRunner.js --replay-only.
  Maximum 12 uploads per runner/replay; post-Full drain maximum 1.
- Dedicated random per-branch tokens and a protected local cache directory
  require separate rollout approval. Windows ACLs must be checked; mode 0600
  alone does not establish Windows protection.

## Verification and remaining gates

- Full Agent local suite: 227/227 passed.
- PaaS focused suite: 18/18; separate guarded PostgreSQL integration: 1/1.
- Prior final full Backend suite: 690 tests, 503 pass, 187 environment skips,
  0 fail. The initial unrelated video timing failure is preserved in the
  Backend review packet; its isolated and full reruns passed.
- Intraday and receipt-bound morning payload identities matched across repos.
- PaaS CI is being refreshed to run Hourly's real integration in a disposable
  database isolated from CP4. CI for this published patch must be checked anew.
- Release dependencies: PaaS Draft #26 (migration 074) before SC Draft #61;
  Transfer canary release gate, policy decisions and explicit activation
  authorization still required.
- Approve scheduling lateness, retention/cohort/ACL/cleanup ownership, actual
  Task wiring and corruption response before any one-branch collection trial.
- Seven qualifying windows/three movement days, drift thresholds/fallback,
  Reservation TTL and WP4 remain unapproved decisions.

## Refactor consideration

Outbox/mutex and Full morning anchor are isolated modules. Entry-point wiring
is narrow; no App.jsx/UI/Reservation or broad legacy/backend refactor is included.

## Continuity

Detailed review: PaaS Draft #26 / HOURLY_STOCK_HARDENING_REVIEW_2026-10-02.md.
Earlier local evidence: CLAIM-X-296. Published SHA/CI results must be appended
to the ledger/Gantt and PR conversations after they actually occur.
