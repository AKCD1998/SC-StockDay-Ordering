# R3 Stock Request Panel Extraction — Tech Lead Review Packet

Status: **READY FOR TECH LEAD REVIEW (local-only)**

## Scope

- Baseline: `origin/main@e2bb8b2424a0bac3223c4bf7f3da068efe917267`
- Candidate worktree: `SC-StockDay-Ordering.r3-stock-request-panel-2026-09-16`
- Move the complete Stock Request UI family from `App.jsx` to `StockRequestsPanel.jsx`.
- Preserve the existing exports from `App.jsx` as a compatibility seam.
- Preserve all existing runtime behavior, API paths, CSRF handling, draft/autosave ownership, submit lifecycle, idempotency ownership, acknowledgement flow, regulated-drug markers, and `409` handling.

## Files changed

- `apps/admin-web/src/App.jsx`
- `apps/admin-web/src/StockRequestsPanel.jsx` (new)

The existing characterization test remains byte-for-byte unchanged and continues importing the three public components from `App.jsx`; this verifies the compatibility re-export as well as the extracted implementation.

## What moved

- `StockRequestsPanel`
- `MyRequestsTab`
- `IncomingRequestsTab`
- incoming request detail/action and packing/document modals
- Stock Request-only filters, search helpers, status chips, regulated-drug badges, and labels

App-level draft hydration, autosave, idempotency-key generation, submit orchestration, navigation, notification polling, and API authentication remain in `App.jsx`.

## Size

- Baseline `App.jsx`: 4,670 physical lines
- Candidate `App.jsx`: 2,716 physical lines
- Reduction: 1,954 lines
- New `StockRequestsPanel.jsx`: 1,984 physical lines

This is an ownership extraction, not a claim that total application source decreased by the same amount.

## Verification

- Stock Request characterization: **7/7 passed**
- Full Admin Web: **98/98 passed** across 20 files
- Production build: **passed** (`vite build`, 96 modules transformed)
- Babel JSX parse: `App.jsx` and `StockRequestsPanel.jsx` passed
- `git diff --check`: passed

The existing Vite chunk-size warning remains informational and is outside this exact-movement slice.

## Explicit exclusions

- no Reservation behavior or TTL
- no migration `071`
- no API, submit, payload, idempotency, acknowledgement, or `409` contract change
- no R4 app-shell/navigation/hooks refactor
- no feature flag or environment change
- no branch-PC, Scheduled Task, database, Render, or production change

## Git state

No commit, push, PR, merge, or deploy has been performed. Stop for Tech Lead review.
