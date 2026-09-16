# R3 BranchStockPanel Extraction — Review Packet

## 1. Status

**READY FOR PR** after Tech Lead local review. This candidate is limited to a
behavior-preserving UI ownership extraction. It does not implement Reservation,
WP4, hourly stock behavior, or any API/database/configuration change.

## 2. Baseline and worktree

- Baseline: `origin/main@0356f01f3b04eed48592ebff0bf4ecaf120a86f3`
- Branch: `candidate/r3-branch-stock-panel-2026-09-15`
- Worktree: `SC-StockDay-Ordering.r3-branch-stock-panel-2026-09-15`
- Baseline `App.jsx`: 6,808 physical lines
- Candidate `App.jsx`: 4,667 physical lines

Remote main was rechecked immediately before publication preparation and still
matched the baseline SHA.

## 3. Change boundary

The candidate moves the existing `BranchStockPanel` component from `App.jsx`
to `apps/admin-web/src/BranchStockPanel.jsx` and imports it back into `App.jsx`.
A compatibility re-export remains in `App.jsx` so current tests and any existing
internal imports continue to resolve.

The moved component body is 1,968 lines and is identical to the baseline after
normalizing line endings:

```text
SHA-256 182649d67bfb85415283a002cec783530847d78909857d4df295aeb990358cde
```

Private imports, constants, and helpers required by the component are colocated
with the new owner. Helpers still needed by `App.jsx` or the Stock Request
family remain there as exact copies for this extraction. Consolidating those
shared helpers is intentionally deferred to a separate tested slice so this PR
does not mix ownership cleanup with behavior changes.

## 4. Files

- `apps/admin-web/src/App.jsx`
- `apps/admin-web/src/BranchStockPanel.jsx`
- `apps/admin-web/src/BranchStockHeaderLayout.test.js`
- `apps/admin-web/src/RequestSummaryPanel.test.js`
- `R3_BRANCH_STOCK_PANEL_REVIEW_PACKET.md`

The two static-source tests now inspect the component's new owning module. The
existing React integration tests continue through the compatibility re-export.

## 5. Preserved behavior

No intentional behavior change was made to:

- Branch Stock data loading, filtering, sorting, pagination, and export;
- branch/user scope and permissions;
- request mode, draft-line creation, dialog, and request-summary display;
- Recommendation priority, modal, and suggestion composition;
- API paths, credentials, CSRF handling, payloads, copy, DOM, or class names.

No CSS, package, lockfile, backend, Agent, environment, migration, or service
file is changed.

## 6. Verification

The Tech Lead reran the following on the candidate:

- focused Branch Stock/Recommendation/layout/request-summary suite: 41/41;
- full Admin Web suite: 91/91;
- production build: passed;
- tracked and untracked whitespace checks: no finding;
- component exact-movement comparison: equal, 1,968/1,968 lines;
- secret/package/config scope audit: no addition.

The build retains only the pre-existing large-chunk advisory.

## 7. Risks and sequencing

Module-local copies of shared formatting/request/API helpers are a deliberate
short-term drift risk accepted for behavior preservation. A future utility
consolidation must be its own reviewed slice.

The separate Stock Request characterization candidate was created from the
same baseline. This Branch Stock candidate must integrate first. The Stock
Request candidate must then be rebased and fully retested before any PR; the
two diffs must not be combined unchanged.

## 8. Explicit exclusions

This candidate does not authorize or include:

- Stock Request component extraction;
- draft hydration/autosave/submit ownership changes;
- `409 AVAILABILITY_CHANGED` behavior;
- Reservation holds, TTL, or either conflicting migration `071`;
- R4 App-shell work;
- WP4 implementation or production activation.

No commit, push, PR, merge, deploy, environment/config change, database action,
Scheduled Task change, or branch-PC mutation had occurred when this packet was
prepared.
