# R2 Stock Cost Audit Panel Extraction — Tech Lead Review Packet

## 1. Status

**RELEASE AUTHORIZED — publication in progress on 2026-09-12.**

The human explicitly authorized commit, push, PR, CI, merge, and deploy after
the Transfer Content Capture 003 gate closed. This candidate extracts only the
existing Stock Cost Audit panel.

## 2. Baseline and worktree

- Original extraction baseline: `origin/main@fb3cbd208340f601e2be2efe1dc7960a58b08396`
- Release baseline after rebase: `origin/main@af2978c477cc4174acafc0770a01d2f3f3b4e0d9`
- Branch: `candidate/r2-stock-cost-audit-panel-2026-09-09`
- Worktree:
  `C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering.r2-stock-cost-audit-panel-2026-09-09`
- The baseline includes merged SyncLogPanel extraction and DELTA_SYNC_STATUS.
- The dirty canonical SC worktree was inspected but not edited, reset, cleaned,
  checked out, or staged.

## 3. Scope and gate

- Scope is R2 behavior-preserving extraction of `StockCostAuditPanel` only.
- Transfer Content Capture 003 completed natural Round 0, Round 1/2, and Round
  2/2 and was closed as `PASS 2/2, ACCEPTANCE CLOSED` on 2026-09-12. The
  release hold recorded when this candidate was prepared is therefore cleared.
- No Branch Stock, Recommendation, Request, OCR/receiving, adaPOS Agent,
  PaaS Reservation, database, migration, environment, or dependency files were
  changed.

## 4. Extraction boundary

- Added `apps/admin-web/src/StockCostAuditPanel.jsx`.
- `App.jsx` imports the component and retains the existing call:
  `<StockCostAuditPanel branchCode={branchCode} />`.
- The original component body moved byte-for-byte, including DOM structure,
  CSS classes, Thai copy, state defaults, endpoint, query parameters, search,
  refresh, pagination, loading/error handling, comparison mode, and summaries.
- Small private dependencies moved with the component: React hooks/Fragment,
  API base and cookie fetch wrapper, number/date formatters, and stock-cost
  branch option constants.
- The stock-cost branch constants remain in `App.jsx` because Branch Stock's
  existing request-target logic still uses them. That unrelated behavior was
  not refactored.

## 5. Exact equivalence evidence

- Baseline component SHA-256:
  `1e8b9e805a0f9ede080a6b7af68e45d8a9b2ace9c7ba22650944916e279a58a8`
- Extracted component SHA-256:
  `1e8b9e805a0f9ede080a6b7af68e45d8a9b2ace9c7ba22650944916e279a58a8`
- Case-sensitive text comparison: `True`
- Production import count: 1
- Production call count: 1

## 6. Characterization tests

Added `apps/admin-web/src/StockCostAuditPanel.test.jsx` covering:

- initial branch selection and exact inventory-value query contract;
- cookie credentials;
- summary and branch table rendering;
- trimmed search query;
- explicit refresh;
- next-page offset;
- all-branches comparison table and branch summary;
- bounded HTTP error display.

Focused result: **3/3 passed**.

## 7. Full verification

- Full Admin Web suite: **17 files, 85/85 tests passed**.
- Production build: passed, **92 modules transformed**.
- JSX syntax transform: **3/3 files passed**.
- `git diff --check`: exit 0.
- The existing Windows LF-to-CRLF warning for `App.jsx` remains informational.
- The existing Vite main-chunk-size warning remains; this extraction introduces
  no new dependency or chunk.

## 8. App.jsx size

- Baseline: 8,643 physical lines.
- Candidate: 8,323 physical lines.
- Reduction: **320 physical lines**.
- Extracted module: 363 physical lines, including its private imports/helpers.

## 9. Files changed

- `apps/admin-web/src/App.jsx`
- `apps/admin-web/src/StockCostAuditPanel.jsx`
- `apps/admin-web/src/StockCostAuditPanel.test.jsx`
- `R2_STOCK_COST_AUDIT_PANEL_REVIEW_PACKET.md`

No package, lockfile, CSS, backend, migration, env, Agent, or ledger file changed.

## 10. Dependency observation

`npm ci` was required because the new isolated worktree had no `node_modules`.
It reported the repository's existing audit findings (22 total) but changed no
tracked package or lockfile and no audit-fix command was run.

## 11. Remaining risk and review focus

- Review the intentionally duplicated small private helpers/constants; this
  follows the previously approved SyncLogPanel extraction pattern and avoids a
  wider shared-utility refactor.
- Confirm the exact component hash and unchanged admin-only router gate.
- Require PR CI, main CI, and the production static-site health check to pass
  before declaring the release complete.

## 12. Mutation declaration

Before the explicit 2026-09-12 publication authorization, no stage, commit,
push, PR, merge, deploy, Render/config/env change, database query/write,
migration, Scheduled Task change, branch-PC change, cache change, or ledger
append was performed. Publication is restricted to the four files listed in
section 9; the dirty canonical SC worktree and every PaaS worktree remain out
of scope.
