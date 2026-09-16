# R4 Navigation Foundation — Tech Lead Review Packet

Status: **TECH LEAD REVIEW PASSED — AUTHORIZED FOR PR**

## Baseline and scope

- Baseline: `origin/main@2374562cba70169485f6fe13d1af3e7fced2aca3`
- Candidate worktree: `SC-StockDay-Ordering.r4-navigation-foundation-2026-09-16`
- Extract navigation configuration, route/hash helpers, and the topbar navigation renderer from `App.jsx`.
- Keep navigation state, refs, keyboard orchestration, route updates, authentication, account controls, notification polling, and feature rendering in `App.jsx`.

## Files

- `apps/admin-web/src/App.jsx`
- `apps/admin-web/src/AdminNavigation.jsx` (new)
- `apps/admin-web/src/AdminNavigation.test.jsx` (new)
- `apps/admin-web/src/adminNavigation.js` (new)
- `apps/admin-web/src/adminNavigation.test.js` (new)

## Behavior preserved

- admin versus branch-user menu visibility
- online-marketing dashboard hiding through the existing `hideDashboard` input
- canonical route/hash mapping and default receipts view
- active/open menu classes
- mouse and keyboard callbacks
- disabled “เร็วๆนี้” items
- Stock Request, Sync failure, and Preorder badges, including `99+` capping

## Verification

- Focused navigation tests: **9/9 passed**
- Full Admin Web: **107/107 passed** across 22 files
- Production build: **passed** (`vite build`, 98 modules transformed)
- JSX/module parse: passed
- `git diff --check`: passed

The existing Vite chunk-size warning remains informational and is outside this extraction.

## Size

- Baseline `App.jsx`: 2,716 physical lines
- Candidate `App.jsx`: 2,519 physical lines
- Reduction: 197 lines
- `AdminNavigation.jsx`: 133 physical lines
- `adminNavigation.js`: 126 physical lines

This is an ownership extraction; it does not claim an equivalent reduction in total source size because focused tests were added.

## Explicit exclusions

- no Hourly Dual-Stock or `apps/adapos-sync` change
- no Reservation, TTL, migration, or WP4 behavior
- no authentication/account-menu behavior change
- no API, environment, Scheduled Task, database, branch-PC, Render, or production change
- integration remains gated by PR CI, main CI, and production health verification

Tech Lead authorized commit, push, PR, merge, and deployment on 2026-09-16, subject to the gates above.
