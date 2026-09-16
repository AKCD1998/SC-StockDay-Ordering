# R4 Admin Account Actions — Tech Lead Review Packet

Status: **TECH LEAD REVIEW PASSED — AUTHORIZED FOR PR**

## Baseline and selected slice

- Baseline: `origin/main@6d98056d3aef61ba9b8baada8faaee865ebbce3b`
- Candidate worktree: `SC-StockDay-Ordering.r4-next-slice-2026-09-16`
- Selected the account/branch controls in the topbar as the next low-risk R4 app-shell slice.
- Extracted only the renderer and branch-label formatter into `AdminAccountActions.jsx`.

## Why this slice

- It follows the navigation extraction and has a narrow app-shell boundary.
- It does not overlap Purchase Receipts/OCR, Branch Stock, Recommendation, Stock Request/Reservation, Hourly Dual-Stock, or WP4.
- `App.jsx` continues to own all state, refs, effects, API calls, session mutations, outside-click/Escape behavior, and theme persistence.

## Files

- `apps/admin-web/src/App.jsx`
- `apps/admin-web/src/AdminAccountActions.jsx` (new)
- `apps/admin-web/src/AdminAccountActions.test.jsx` (new)

## Behavior preserved

- branch-context card visibility for staff without a branch
- allowed-branch filtering and immediate apply on selection
- busy/disabled branch-context controls
- dark/light theme callback and existing labels
- account avatar, role, open state, and logout callback
- `accountMenuRef` remains owned by `App` for outside-click handling

## Verification

- Focused account + navigation tests: **13/13 passed**
- Full Admin Web: **111/111 passed** across 23 files
- Production build: **passed** (`vite build`, 99 modules transformed)
- `git diff --check`: passed

The existing Vite chunk-size warning remains informational and outside this extraction.

## Size

- Baseline `App.jsx`: 2,519 physical lines
- Candidate `App.jsx`: 2,441 physical lines
- Reduction: 78 lines
- `AdminAccountActions.jsx`: 116 physical lines

This is an ownership extraction, not a claim that total source size decreased; focused tests were added.

## Explicit exclusions

- no Purchase Receipts/OCR change
- no Branch Stock, Recommendation, Stock Request/Reservation, Hourly Dual-Stock, or WP4 change
- no API, environment, Scheduled Task, database, branch-PC, Render, or production change
- integration remains gated by PR CI, main CI, and production health verification

Tech Lead authorized commit, push, PR, merge, and deployment on 2026-09-16, subject to the gates above.
