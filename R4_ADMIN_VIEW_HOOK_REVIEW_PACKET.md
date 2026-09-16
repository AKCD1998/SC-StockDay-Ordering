# R4 Admin View Hook — Tech Lead Review Packet

Status: **TECH LEAD REVIEW PASSED — AUTHORIZED FOR PR**

## Baseline and scope

- Baseline: `origin/main@a4606546131012afe075a8295ba5f06d3b8f5849`
- Candidate worktree: `SC-StockDay-Ordering.r4-admin-view-hook-2026-09-16`
- Extract the admin view initialization, persistence, canonical URL synchronization, and browser navigation listeners from `App.jsx` into `useAdminView.js`.
- Keep role/access guards, navigation focus and keyboard behavior, feature routing, session state, and API behavior in `App.jsx`.

## Files

- `apps/admin-web/src/App.jsx`
- `apps/admin-web/src/useAdminView.js` (new)
- `apps/admin-web/src/useAdminView.test.jsx` (new)

## Behavior preserved

- supported location/hash view takes precedence over local storage
- supported saved view is used when the location has no view
- unsupported location/storage falls back to `receipts`
- view changes persist to `sc-stockday-admin-view`
- canonical hashes continue to use the existing `adminNavigation.js` helpers
- `hashchange` and `popstate` update the active view

## Verification

- Focused hook + navigation/account tests: **18/18 passed**
- Full Admin Web: **116/116 passed** across 24 files
- Production build: **passed** (`vite build`, 100 modules transformed)
- `git diff --check`: passed

The existing Vite chunk-size warning remains informational and outside this extraction.

## Size

- Baseline `App.jsx`: 2,441 physical lines
- Candidate `App.jsx`: 2,397 physical lines
- Reduction: 44 lines
- `useAdminView.js`: 57 physical lines

This is an ownership extraction; focused tests were added and total source size is not claimed to decrease.

## Explicit exclusions

- no role/access-guard or navigation focus/keyboard change
- no feature-router, Purchase Receipts/OCR, Branch Stock, Recommendation, Stock Request/Reservation, Hourly Dual-Stock, or WP4 change
- no API, environment, Scheduled Task, database, branch-PC, Render, or production change
- integration remains gated by PR CI, main CI, and production health verification

Tech Lead authorized commit, push, PR, merge, and deployment on 2026-09-16, subject to the gates above.
