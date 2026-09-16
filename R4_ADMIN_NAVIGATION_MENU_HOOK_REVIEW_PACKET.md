# R4 Admin Navigation Menu Hook — Tech Lead Review Packet

Status: **TECH LEAD REVIEW PASSED — AUTHORIZED FOR PR**

## Baseline and scope

- Baseline: `origin/main@3e684b272057eee420d3a7617ec9b876eea4f8f2`
- Candidate worktree: `SC-StockDay-Ordering.r4-navigation-menu-hook-2026-09-16`
- Extract open-group state, the navigation DOM ref, focus cycling, navigation callbacks, and outside-dismiss behavior from `App.jsx` into `useAdminNavigationMenu.js`.
- Keep the `AdminNavigation` renderer, role guards, feature routing, badge polling, session behavior, and account menu behavior unchanged.

## Files

- `apps/admin-web/src/App.jsx`
- `apps/admin-web/src/useAdminNavigationMenu.js` (new)
- `apps/admin-web/src/useAdminNavigationMenu.test.jsx` (new)

## Behavior preserved

- disabled or viewless navigation items are ignored
- valid navigation updates the view and closes the menu
- ArrowDown opens a group and focuses its first enabled item
- ArrowUp/ArrowDown cycle enabled items while Home/End move to boundaries
- Escape closes the group and restores trigger focus
- outside pointer closes an open group
- event listeners are installed only while a group is open and cleaned up afterwards

## Verification

- Focused app-shell/navigation tests: **22/22 passed**
- Full Admin Web: **120/120 passed** across 25 files
- Production build: **passed** (`vite build`, 101 modules transformed)
- `git diff --check`: passed

The existing Vite chunk-size warning remains informational and outside this extraction.

## Size

- Baseline `App.jsx`: 2,397 physical lines
- Candidate `App.jsx`: 2,313 physical lines
- Reduction: 84 lines
- `useAdminNavigationMenu.js`: 113 physical lines

This is an ownership extraction; focused tests were added and total source size is not claimed to decrease.

## Explicit exclusions

- no account-menu, role/access-guard, feature-router, Purchase Receipts/OCR, Branch Stock, Recommendation, Stock Request/Reservation, Hourly Dual-Stock, or WP4 change
- no API, environment, Scheduled Task, database, branch-PC, or backend change
- integration remains gated by PR CI, main CI, Render deploy, and production health verification

Tech Lead authorized commit, push, PR, merge, and deployment on 2026-09-16, subject to the gates above.
