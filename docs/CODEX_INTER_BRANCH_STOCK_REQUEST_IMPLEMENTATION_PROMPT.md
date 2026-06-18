# Codex Prompt — Inter-Branch Stock Request Implementation

Copy everything below the line into Codex as the task instruction.

---

You are implementing the **Inter-Branch Stock Request** feature for the SC StockDay system.

## Read first (do not skip)
1. Read `SC-StockDay-Ordering/docs/INTER_BRANCH_STOCK_REQUEST_IMPLEMENTATION_PLAN.md`
   in full. It is the source of truth for architecture, schema, APIs, state machines,
   security, and work packages (WP-00 … WP-14).
2. Before editing any file named in a work package, **re-open and re-read that file** to
   confirm it still matches the plan (the codebase may have changed since planning).

## Ground truth about this workspace (verify, don't assume)
- The **deployed backend is `PaaSRTSM-project/apps/admin-api`** (Express, CommonJS, `pg`),
  NOT `SC-StockDay-Ordering/server` (legacy — do not touch it). Mount new routes in
  `PaaSRTSM-project/apps/admin-api/src/server.js`.
- Both web apps (`SC-StockDay-Ordering/apps/order-web` and `.../apps/admin-web`) call
  `https://paasrtsm-project.onrender.com` via their `.env`.
- Build the request UI in **`order-web`** (it currently has no router/auth/tests — add
  them). Leave the admin-web monolith branch-stock view intact; copy the comparison table
  into order-web rather than importing across repos.
- Auth lives in `apps/admin-api/src/auth/` (session token `{ sub, role, csrf }`, roles
  `admin`/`staff`, CSRF via `x-csrf-token`). There is **no branch identity yet** — WP-00
  adds it. All branch scope must be derived server-side from `req.auth`, never from the
  request body.
- DB schemas in use: `core`, `ordering`, `ada`, `analytics`, `ingest`, `admin`, `public`.
  Stock source is the wide table `ada.branch_stock_snapshots`.
- Migrations: add new numbered files in `PaaSRTSM-project/migrations/` (next is `033_…`);
  run with `npm run db:migrate`. Tests: `node --test` + `supertest` in
  `PaaSRTSM-project/tests/`; run with `npm test`.

## Verify before starting WP-00 (assumptions A1–A5 in the plan, §5.2)
- A1 order-web deployment target/host. A2 branch-login credential model. A3 multi-source
  per product allowed. A4 Phase-1 has no stock decrement. A5 integer smallest-unit
  quantities. If any is wrong, stop and report before coding.

## Rules of engagement
- Implement **one work package at a time**, in order. WP-00 (branch identity) and WP-01
  (migration) come before any dependent API. Create migrations **before** the APIs that
  use them.
- **Run the applicable tests after every work package** and paste the results. Never claim
  success without running tests. If you add a frontend test runner, run it too.
- Do **not** make unrelated refactors. Preserve existing coding conventions (CommonJS +
  `requireAuth`/`requireCsrf`/`auditLog` patterns on the backend; the existing React/Vite
  style on the frontend).
- Submission and response must be **transactional** and **idempotent** (use idempotency
  keys; reuse the pattern BranchSender already uses for `/api/branch-stock/upload`).
- Enforce **authorization in the backend** on every endpoint (branch scope from
  `req.auth`, CSRF on mutations). Frontend validation never replaces backend validation.
- **No destructive database operations.** Migrations are additive and wrapped in
  `BEGIN/COMMIT` with `IF NOT EXISTS`; provide a down/rollback note for each.
- Write a `stock_request_events` audit row inside the same transaction as each state
  change. Create notifications transactionally with the state change.
- Length-limit and safely render all free-text notes.
- Gate everything behind the `FEATURE_STOCK_REQUESTS` flag (read in `config.js`); default
  off.
- Update documentation (the plan's WP checklist + any README touched).
- **Stop at each phase boundary** (after WP-03, WP-06, WP-09, WP-12) and wait for review.

## After each work package, report
1. Files created and modified (exact paths).
2. Migrations added and whether `npm run db:migrate` succeeded.
3. Tests run (exact command) and their results.
4. Rollback notes for the work package (flag off + down migration if any).
5. Anything that deviated from the plan and why.

## Start now with WP-00 only
Implement server-side branch identity exactly as described in the plan §21 (WP-00):
extend `auth/session.js`, `auth/users.js`, `auth/middleware.js`, `routes/auth.js`,
`routes/me.js`, `config.js` to add a `branch` role and a `branch_code` session claim and a
branch login path, with admin/HQ branch-switch audited. Add/extend tests so `GET /admin/me`
returns `branch_code` and a branch user cannot act as another branch. Run `npm test`.
Then stop and report. Do not begin WP-01 until WP-00 is reviewed.
