# R3 Stock Request Characterization — Tech Lead Review Packet

## 1. Status

**READY FOR TECH LEAD REVIEW — local-only**

This candidate is a behavior-characterization safety net for the existing Stock Request UI. It does not extract the components yet and does not change Reservation, availability, TTL, submit, approval, rejection, cancellation, partial fulfillment, or HTTP 409 behavior.

## 2. Baseline and rebase

- Branch: `candidate/r3-stock-request-characterization-2026-09-15`
- Baseline after rebase: `origin/main@d39ca8d7506ac7d52be537ccb240e03b7c5d2f4d`
- Baseline contains merged R3 Track A / PR #52.
- Rebase completed without conflicts.
- Candidate remains uncommitted and unpushed.

The pre-rebase changes were preserved through an include-untracked stash. The characterization test retained Git blob `bc99a0a8644ccad2092136977e04fe65d21fc926`; the temporary stash was dropped only after successful restoration.

## 3. Candidate changes

- `apps/admin-web/src/App.jsx`
  - Adds a three-line named-export seam for `IncomingRequestsTab`, `MyRequestsTab`, and `StockRequestsPanel`.
  - Runtime ownership remains in `App.jsx`.
  - No existing component implementation or call site is changed.
- `apps/admin-web/src/StockRequestsPanel.characterization.test.jsx`
  - Adds seven behavior-characterization tests.

Current `App.jsx` is 4,670 lines including the three-line test seam. The merged main baseline is 4,667 lines.

## 4. Behaviors covered

The characterization suite covers:

1. Non-admin default tab, draft persistence across tab switches, and incoming badge.
2. Admin default tab and loading without a selected branch.
3. Fail-closed behavior for a non-admin without a selected branch.
4. Submit lifecycle callbacks, disabled state while submitting, and draft preservation after an error.
5. Draft hydration and save-state feedback.
6. Incoming-request loading followed by a successful empty result.
7. Existing empty-state fallback after an incoming-request failure.

## 5. Verification after rebase

- Focused characterization: **7/7 passed**.
- Full Admin Web: **98/98 passed** across 20 test files.
- Production build: **passed**.
- `git diff --check`: **passed**.
- Build emitted only the existing Vite large-chunk advisory.

The first focused invocation could not locate `vitest` because this isolated worktree had no usable root dependency link. A temporary verified junction to the already-installed dependency tree was used for testing and removed afterward; the dependency source remains intact.

## 6. Scope boundaries

This review does **not** authorize:

- extracting or relocating the Stock Request components;
- changing API routes, payloads, CSRF handling, draft persistence, notification counts, or tab behavior;
- adding Reservation behavior or choosing between competing migration `071` candidates;
- changing TTL, availability formulas, submit semantics, or `409 AVAILABILITY_CHANGED` handling;
- commit, push, PR, merge, deploy, environment change, or branch-PC change.

## 7. Proposed next step

After Tech Lead approval, use these tests as the safety net for a separate exact-movement extraction of the Stock Request UI. Keep Recommendation and Reservation changes out of that extraction slice.

## 8. Mutation declaration

PR #52 was merged separately and its Render deployment was observed live before this rebase. This Track B candidate itself has no commit, push, PR, merge, deploy, environment/config change, database access, Scheduled Task change, or branch-PC mutation.
