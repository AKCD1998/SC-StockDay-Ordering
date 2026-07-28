# Customer Preorder Implementation State

Last updated: 2026-07-28

## Production status (2026-07-28)

**Live in production for all branches.** Verified directly, not just claimed:

- Migration `062_add_customer_preorders.sql` confirmed applied in production (read-only query
  against `public.schema_migrations` and `information_schema.tables`): recorded
  2026-07-22T12:51:04Z, all 16 `customer_relations.*` tables exist. This section of the doc
  previously said migration 062 was "not applied to any production database" — that was wrong;
  it had already been applied, just never re-verified or recorded here.
- R2 bucket `sc-stockdays-images` confirmed live and correct (5 objects present); a
  separately-created bucket `fadapreorderimage` exists but is unused — Render still points at
  `sc-stockdays-images`, which is intentional (least disruptive, already has data).
- `FEATURE_CUSTOMER_PREORDERS=true` on `paasrtsm-project` (backend) and
  `VITE_FEATURE_CUSTOMER_PREORDERS=true` on `sc-stockday-ordering` (admin-web), both set via
  single-key Render API updates, confirmed live: `GET /api/customer-preorders/unread-count`
  returns `401 Unauthorized` (auth-gated, feature on) rather than `404 Not Found` (what it
  returns when the flag is off).
- Rollout scope: user explicitly chose **all branches at once**, not the staged
  admin+branch-003-then-005 pilot originally planned in this doc and in
  `docs/CUSTOMER_PREORDER_SYSTEM_DESIGN.md` §16. Reasoning: branch staff normally take preorders
  through a LINE chat app on their phones and won't use this web feature unless specifically told
  it's ready, so wider exposure carries little practical risk.
- **Known, deliberately deferred security item:** the R2 API token in
  `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` is account-wide (Admin Read & Write across the whole
  Cloudflare account, confirmed via HeadBucket against unrelated buckets), not scoped to
  `sc-stockdays-images` alone, and is shared with another workspace. User is aware and chose not
  to fix this now. Should be rotated to a bucket-scoped token before this feature sees meaningful
  real customer traffic.
- One operational gotcha hit during this rollout: flipping `FEATURE_CUSTOMER_PREORDERS` via the
  Render API and then restarting the service was **not enough** — the running process only
  re-reads env vars on an actual redeploy, not a plain restart. Needed one more redeploy (same
  commit, no code change) before the flag took effect. Worth remembering for any future flag
  flips on this backend service.

## Safety and scope

- Live API target confirmed: sibling `PaaSRTSM-project/apps/admin-api`; the local `server/` was not modified.
- No deployment, production environment change, or production migration was performed.
- PaaSRTSM worktree was clean at preflight. The SC worktree contained pre-existing modified/untracked files; they are preserved.
- `git fetch origin main` completed. Highest local and `origin/main` migration was `061`; preorder migration is `062`.

## Work packages

- [x] WP-00 safety preflight and baseline
- [x] WP-01 schema, transitions, ETA primitives (static migration verification; not applied)
- [x] WP-02 core authenticated API
- [x] WP-03 R2 attachments, conversation, activity
- [x] WP-04 staff frontend
- [x] WP-05 admin workflow and decision loop
- [x] WP-06 HQ receipt and ETA integration
- [x] WP-07 transfer evidence and arrival
- [x] WP-08 hardening and handoff

## Baseline evidence

- `npm test` in PaaSRTSM: most displayed tests passed; one pre-existing failure: `ordering and sync routes are available on the unified backend`.
- `npm test` at SC repo root: not available (`Missing script: test`); frontend verification must use `npm test -w apps/admin-web`.

## Implementation notes

- R2 integration is dedicated to preorder attachments and does not alter video storage.
- Feature flags default off. R2 configuration is backend-only and validated when the provider is constructed.
- Migration is implementation-only and has not been applied to any production database.

## Focused verification after implementation

- `node --test tests/customer_preorders_primitives.test.js tests/customer_preorders_api.test.js`: 15 passed, 0 failed.
- `node --test tests/customer_preorders_primitives.test.js tests/customer_preorders_api.test.js tests/customer_preorders_wp03.test.js`: 22 passed, 0 failed.
- `npm test -w apps/admin-web`: 10 passed, 0 failed.
- `npm run build -w apps/admin-web`: passed (Vite production build).
- WP-05 focused preorder verification: 23 backend tests passed; 11 frontend tests passed; Vite production build passed.
- WP-06 focused preorder verification: 27 backend tests passed; 12 frontend tests passed; Vite production build passed.
- WP-07 focused preorder verification: 31 backend tests passed; 13 frontend tests passed; Vite production build passed.

## WP-07 implementation

- Added admin-only transfer candidates from `reconciliation.transfer_cases` and `transfer_case_lines`, scoped to the case destination branch and exact product code after HQ receipt evidence.
- Candidate DTOs distinguish outbound-only, processed inbound, unprocessed inbound, ambiguous matches, and sources older than 48 hours.
- Admin explicitly links outbound or processed-inbound evidence to one case item and quantity. Links use stable case/line document keys and immutable snapshots without foreign keys to delete/rebuild reconciliation rows.
- Transfer source and case-target quantities are bounded independently; unit mismatch requires an explicit equivalence note. Partial multi-item coverage does not advance the whole case.
- Complete outbound coverage advances `RECEIVED_AT_HQ` to `IN_TRANSIT_TO_BRANCH`. Only complete explicitly linked processed-inbound coverage advances to `ARRIVED_AT_BRANCH`; ambiguous or unprocessed evidence cannot confirm arrival.
- Admin can unlink transfer evidence with a reason and recalculated status. Staff or admin can separately confirm physical arrival through the existing authorized transition, producing an event without modifying Ada data.
- Staff detail surfaces outbound/inbound progress, source state, and sync freshness. All transfer writes are CSRF-protected, optimistic-versioned, transactional, audited, and notify the destination branch.

## WP-06 implementation

- Added admin-only candidates from exact product-code matches in approved receipt lines owned by branches where `core.branches.is_hq=true`; candidates include source sync freshness.
- Receipt evidence is linked explicitly to one case item with separate source and target quantities. Source quantity and target requirement are both bounded to prevent over-allocation.
- Unit mismatches never convert silently: the admin must provide both quantities and an allocation/equivalence note, which is retained with the immutable evidence snapshot.
- Multi-item coverage is calculated per line. Partial evidence leaves the case `ORDERED`; only complete coverage advances it to `RECEIVED_AT_HQ`.
- Complete HQ coverage creates a versioned ETA using active database delivery schedules and the first scheduled Bangkok date strictly after receipt evidence. Admin overrides require a date and reason and remain versioned.
- Staff detail shows coverage, source-sync time, approximate ETA, and its basis without exposing supplier/admin-only snapshot fields. Link, unlink, status, ETA, event, and notification writes use transactions and optimistic versions.

## WP-05 implementation

- Admin all-branch queue now has search, branch, status, and actionable filters; first-read behavior and automatic review assignment remain transactional.
- Added optimistic-locking workflow endpoints for review, request/provide info, immutable quote versions and lines, immutable customer decisions and quantities, ordered/unavailable outcomes, cancel, reopen, arrival, notification, and completion.
- Every workflow mutation appends an event and a recipient notification in the same database transaction. Stale versions return a conflict without applying a partial mutation.
- Admin can match a free-form request item to a catalog SKU. Staff sees only current-state customer decision and fulfillment actions.
- Detail UI shows quote/outcome history, action-specific forms, public/internal conversation, and event notes. Admin-only notes are omitted from staff API detail queries.
- Full PaaSRTSM `npm test`: 378 tests, 366 passed, 2 failed, 10 skipped. The failures are outside preorder code: the pre-existing `ordering and sync routes are available on the unified backend`, plus `cipdata kpis endpoint computes counts from Supabase content-range totals`. Focused preorder tests remain green.

## WP-04 rendered UI verification

- Playwright CLI with mocked authenticated `staff003`/branch `003` API responses.
- Desktop and 390x844 mobile viewport checked in the existing dark theme.
- Verified masked own-branch table, summary cards, five-step dialog, keyboard `@vi` autocomplete + Enter selection, quantity controls, Escape close/focus restoration, explicit-read detail drawer, and timeline rendering.
- Browser console after the completed list/detail flow: 0 errors, 0 warnings.

## Remaining definition-of-done work

- Operator-authorized production rollout and pilot verification described below. These are deliberately not performed by Codex.

## WP-08 verification evidence

Commands run on 2026-07-22:

```powershell
cd "C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project"
node --test tests/customer_preorders_primitives.test.js tests/customer_preorders_api.test.js tests/customer_preorders_wp03.test.js tests/customer_preorders_wp06.test.js tests/customer_preorders_wp07.test.js
npm test

cd "C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering"
npm test -w apps/admin-web
npm run build -w apps/admin-web
```

Results:

- Focused preorder backend after WP-08: 32 passed, 0 failed, including the server-time admin stuck-queue regression test.
- Full backend: 394 tests; 382 passed, 2 failed, 10 skipped. Both failures pre-date and are outside preorder code:
  - `ordering and sync routes are available on the unified backend`: expected product code field, received `undefined`.
  - `cipdata kpis endpoint computes counts from Supabase content-range totals`: expected `5`, received `18`.
- Admin-web: 13 passed, 0 failed.
- Admin-web Vite production build passed. The existing bundle-size warning remains (`index` JavaScript above 500 kB); it is not introduced solely by preorder and does not fail the build.
- `git diff --check` and Node syntax checks passed. CRLF conversion warnings are informational.

### Local browser E2E

Playwright CLI ran against local Vite plus a local mocked authenticated API; no production URL, database, R2 bucket, or Ada source was contacted.

- Admin desktop dark: all-branch queue, masked list PII, filters, detail drawer, HQ coverage, approximate ETA basis, outbound/inbound progress, manual arrival action.
- Admin transfer candidate states: ambiguous/stale candidate is visibly labelled and disabled for inbound; processed inbound is selectable.
- Admin light theme at desktop and 390x844 responsive table were rendered.
- Staff003 mobile dark: no admin branch/filter controls; own-branch label, receipt/transfer progress, approximate ETA, and physical-arrival action rendered.
- Detail and five-step create dialogs focus their close button. Escape closes each dialog and restores focus to its launcher.
- Browser console for the completed staff list/detail flow: 0 errors, 0 warnings. The only earlier local-mock error was an invalid mock dashboard response and was corrected before verification.
- Reduced-motion behavior is present in `preorder.css` under `@media(prefers-reduced-motion:reduce)`; dialogs/drawers avoid animated scrolling.
- Screenshots: `output/playwright/wp08-admin-dark-desktop.png`, `wp08-admin-light-desktop.png`, `wp08-admin-light-mobile.png`, and `wp08-staff-dark-mobile.png`.

## Rollout order — manual steps not taken

1. Re-fetch PaaSRTSM `origin/main` and re-check the highest migration number immediately before merge/push. Renumber `062` if another migration has claimed that number.
2. Create a private Cloudflare R2 bucket and bucket-scoped Object Read & Write S3 credentials. Do not enable a public bucket URL.
3. Set the six backend-only `R2_*` variables in Render and keep `FEATURE_CUSTOMER_PREORDERS=false`. Do not add `VITE_R2_*`.
4. Because the production migration ledger uses Linux-style separators and Windows runner paths differ, do not run the general migrator from Windows. Follow `PaaSRTSM-project/AGENTS.md`: dry-run the single migration with a rollback copy, then apply only the new SQL file with `psql -v ON_ERROR_STOP=1`, and record the filename using the existing ledger separator/style.
5. Verify the new `customer_relations` tables, reason seed, branch schedules, constraints, indexes, and a safe migration re-run against the target database.
6. Manually deploy PaaSRTSM backend with the feature flag still false. Git push alone does not deploy this backend.
7. Deploy admin-web with `VITE_FEATURE_CUSTOMER_PREORDERS=false`; its Render service auto-deploy behavior must be accounted for before merge.
8. Enable backend and frontend for a controlled admin + branch 003 pilot. Verify real R2 upload/presigned download/orphan cleanup, branch scoping, quote/decision, HQ receipt link, ETA, transfer link, arrival, notification, and completion.
9. Add branch 005 to verify Tue/Thu/Sat ETA behavior, then widen only after pilot evidence is clean.

Rollback is exposure-only: set both feature flags false, redeploy the affected services, retain additive tables and audit history, and fix forward. Do not drop customer data or R2 objects as an operational rollback.

## Known limitations and blockers

- Migration 062 was not applied locally or in production, so real-Postgres syntax/re-run and database-backed E2E remain operator gates. Static migration and service tests pass.
- Real Cloudflare R2 credentials/bucket were intentionally unavailable; SDK behavior is covered with fake clients, but pilot durability must be verified after secret setup.
- Receipt/transfer candidates depend on freshness and completeness of the existing Ada/reconciliation sync. UI exposes source timestamps and ambiguity rather than claiming certainty.
- The full backend suite retains the two unrelated failures listed above. Preorder-focused suites are green.
- Production metrics/alert export is not added; WP-08 adds an admin `ค้างเกิน 48 ชั่วโมง` queue filter using database server time. Broader observability should follow pilot traffic.
