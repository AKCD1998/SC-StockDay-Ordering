# Goal Prompt — Customer Preorder / Price Inquiry

Copy the prompt below into Sol as one persistent implementation goal.

---

You are implementing the production-ready **Customer Preorder / Price Inquiry** feature
for the SC Group StockDay system. Work persistently through the work packages until the
definition of done is met. Do not deploy, change production environment variables, or run
migrations against production; implementation, local verification, and deployment
documentation are in scope.

## Read first — mandatory

Read these files in full before changing code:

1. `SC-StockDay-Ordering/docs/CUSTOMER_PREORDER_SYSTEM_DESIGN.md` — source of truth for
   product behavior, state machine, data model, APIs, integrations, UX, security, tests,
   rollout, and acceptance.
2. `SC-StockDay-Ordering/docs/ARCHITECTURE.md` — current multi-repo topology.
3. `SC-StockDay-Ordering/docs/SESSION_2026-06-19_STOCK_REQUESTS_AND_ADMIN_ALERTS.md` —
   reusable branch/auth/event/notification patterns.
4. `SC-StockDay-Ordering/docs/SESSION_2026-05-22_RECEIPT_SYNC_AND_VIEWER_BRANCH.md` —
   receipt ownership/viewer model and source fields.
5. `SC-StockDay-Ordering/docs/adasoft/VISION.md`, especially event-driven integration,
   UX, sync lag, and security constraints.
6. `PaaSRTSM-project/AGENTS.md` — mandatory migration and deployment safety instructions.

Then inspect the current versions of every file you plan to edit. The repositories may
have moved ahead since the design was written; current code and `AGENTS.md` safety rules
win over stale filenames or migration numbers. If behavior has changed, preserve the
design intent and document the smallest necessary deviation.

## Ground truth

- Frontend feature surface:
  `SC-StockDay-Ordering/apps/admin-web`.
- Live backend and production schema:
  sibling repo `PaaSRTSM-project/apps/admin-api` and
  `PaaSRTSM-project/migrations`.
- `SC-StockDay-Ordering/server` is legacy and is not called by the live frontends. Do not
  implement this feature there.
- The existing `admin-web` navigation already has
  `ลูกค้าสัมพันธ์ → พรีออเดอร์` and a placeholder view. Replace that placeholder through a
  dedicated feature folder; do not add thousands of lines to `App.jsx`.
- Roles in scope are `admin` and `staff`. Staff identity is scoped by
  `req.auth.effectiveBranchCode`; admin may see all branches. Never trust a staff-supplied
  branch in query/body.
- Existing `ordering.stock_requests` is the inter-branch inventory request workflow. Do
  not overload it with customer PII or preorder states. Create the dedicated
  `customer_relations` domain from the design.
- AdaAcc is read-only. Never add AdaAcc INSERT/UPDATE/DELETE/EXEC or a write-back path.
- Approved receipts and transfer reconciliation are evidence sources. Never auto-link a
  customer case solely because a product name/code happens to match.
- Current video local storage is not durable on Render and must not store customer
  preorder images. Use a private Cloudflare R2 bucket through a dedicated backend provider;
  PostgreSQL stores attachment metadata/authorization, not image bytes.
- Backend deployment is manual. A Git push does not deploy PaaSRTSM. Deployment is not
  authorized by this goal.

## User outcome

Staff can create a case by entering:

- customer phone;
- customer name;
- one or more products and quantities;
- optional note;
- up to three supporting images total;
- intent: `สอบถามราคา` or `สั่งสินค้า`.

Typing `@IC-xxxxx`, `@630xxxx`, a Thai product name, or an English/generic name produces
ranked product rows. Staff can select a result and adjust quantity with minus/plus. If the
product does not exist, staff can deliberately switch to a free-form, letter-like product
description and attach images.

Staff sees only cases from their own effective branch and can track:

- whether/when admin first opened the case;
- admin reply or structured quote;
- customer accept/decline and final quantity;
- ordered or unavailable result and reason;
- HQ receipt, estimated branch delivery, transfer progress, branch arrival, notification,
  and completion.

Admin sees all branches, receives an actionable queue, and can quote, request information,
mark ordered/unavailable, link read-only receipt/transfer evidence, override ETA with a
reason, and close/reopen according to the state machine.

## Non-negotiable implementation rules

1. Feature flags:
   - backend `FEATURE_CUSTOMER_PREORDERS`, default false;
   - frontend `VITE_FEATURE_CUSTOMER_PREORDERS`, with a safe placeholder/off state.
2. Every API route requires authentication. Every mutation requires CSRF.
3. Staff scope is derived server-side. Add negative cross-branch tests for list, detail,
   search, attachment bytes, messages, and every action.
4. Case creation uses an idempotency key. State mutations use `expectedVersion` and return
   409 on stale writes.
5. Workflow change, structured side record, domain event, and badge-driving activity are
   one database transaction.
6. Events are append-only. Published quotes/decisions/evidence snapshots are not silently
   overwritten.
7. Do not put customer phone/name in console logs, generic audit metadata, request IDs,
   error bodies, or attachment keys. Mask phone in list DTOs.
8. Images:
   - maximum 3 total per case;
   - JPEG/PNG/WebP only, no SVG;
   - maximum 5 MB each and 15 MB total;
   - validate magic bytes as well as MIME;
   - upload from authenticated Express to private Cloudflare R2 after validation;
   - store opaque R2 key/checksum/metadata in Postgres, never PII in object keys;
   - authorize through the parent case and issue only short-lived presigned GET URLs.
9. Product suggestion ranking is deterministic: exact code/barcode, prefix, then
   substring/name. Strip a leading `@`; bound result count. Reuse canonical product tables,
   never create a second product master.
10. Receipt/transfer candidates may be ranked but require explicit admin confirmation
    before a link or status advance. Snapshot linked evidence, allocate it to a specific
    case item/quantity, prevent source over-allocation, and show source sync time. A
    multi-item case reaches `RECEIVED_AT_HQ` only when every required quantity is covered;
    partial coverage must not overstate the whole case.
11. ETA uses `Asia/Bangkok` and database schedules:
    - branches 001/003/004: Mon/Wed/Fri;
    - branch 005: Tue/Thu/Sat;
    - until cutoff is confirmed, choose the first scheduled day strictly after the HQ
      receipt/evidence date;
    - label it approximate and preserve admin override.
12. Keep raw state transitions in one backend service map and mirror only display labels
    client-side. Do not let free-form chat implicitly change a business status.
13. Preserve existing light/dark design language, Thai-first copy, responsive behavior,
    visible focus, keyboard autocomplete/dialog behavior, and reduced motion.
14. Do not make unrelated refactors or discard existing/user changes in either worktree.
15. Do not run production migrations from Windows. Follow `PaaSRTSM-project/AGENTS.md`
    exactly for migration numbering and separator safety. During implementation, create
    and test migrations locally only.
16. R2 credentials are backend-only. Never add `VITE_R2_*`, return credentials to clients,
    commit `.env`, or require a public bucket. Use the exact environment contract from the
    design and fail clearly when the feature is enabled but required R2 config is missing.

## Required architecture

Implement the tables and behavior from the design, including:

- cases/items;
- versioned quotes and quote lines;
- customer decisions and decision lines;
- public messages/admin-internal notes;
- read cursors plus first-admin-view timestamp;
- private attachments;
- append-only events;
- extensible reason codes;
- external receipt/transfer links with immutable snapshots;
- branch delivery schedules and versioned ETA projections.

Mount authenticated APIs under `/api/customer-preorders` and keep business rules in a
service module rather than route handlers.

Create a frontend feature folder under:

```text
SC-StockDay-Ordering/apps/admin-web/src/preorders/
```

`App.jsx` should only provide integration glue: session/role/branch/CSRF props, render the
panel, connect the badge, and add `preorder` to persisted/hash routing. Do not duplicate
the feature separately for admin and staff; share components with role-specific actions.

## Work packages

Complete work in this order. After each package, run the focused tests and record results
in `SC-StockDay-Ordering/docs/PREORDER_IMPLEMENTATION_STATE.md`. Continue automatically
unless a genuine blocker requires new user authority or a product choice that materially
changes the design.

### WP-00 — Safety preflight and baseline

- Read all required sources and current target files.
- Record `git status` in both repos and preserve all existing changes.
- In PaaSRTSM, `git fetch origin main`, then determine the next migration number from both
  local and `origin/main` exactly as `AGENTS.md` requires. Do not hardcode the number from
  this prompt.
- Run practical baseline tests/builds and record pre-existing failures separately.
- Create the implementation state document with package checklist and evidence.

Acceptance: correct repos/targets confirmed; no production write/deploy; baseline known.

### WP-01 — Schema, transitions, and ETA primitives

- Add one safely numbered, re-runnable migration for the designed domain, indexes,
  constraints, reason seed, and delivery schedules.
- Add pure backend transition authorization and ETA calculation modules.
- Add migration/transition/ETA tests, including re-run safety and all branch weekdays.

Acceptance: invalid combinations/transitions fail; timezone/weekdays pass; flag remains off.

### WP-02 — Core authenticated API

- Add config flag, service, router, and server mount.
- Implement product suggestions, multipart idempotent create, scoped list/detail,
  explicit read, and unread/actionable counts.
- Implement DTO masking and no-PII logging discipline.
- Test admin-all/staff-own/cross-branch-negative behavior.

Acceptance: staff tampering cannot expose another branch; duplicate create produces one
case; admin first-read is explicit and visible.

### WP-03 — Attachments, conversation, and activity

- Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` in PaaSRTSM.
- Add backend-only R2 config and a dedicated CommonJS provider for Put/Head/Delete and
  short-lived presigned Get; do not alter active video local-storage behavior.
- Add strict multipart validation and a retry-safe pending → R2 upload → finalized flow.
- Add best-effort rollback, orphan cleanup, and authorized presigned download URLs.
- Add public replies, admin-internal notes, read cursors, timeline, and badge semantics.
- Test fourth image, oversize, SVG/fake MIME, unauthorized URL requests, duplicate
  idempotency/checksum, and partial R2 failures with a fake S3 client.

Acceptance: 0–3 valid images work durably in private R2, secrets never reach frontend,
partial failures are recoverable, and messages do not change status.

### WP-04 — Staff frontend

- Replace the placeholder with extracted feature components.
- Implement field-by-field create flow, mention autocomplete, keyboard behavior,
  catalog/free-form items, quantity stepper, image previews/remove/count, review/submit.
- Implement own-branch table/detail/timeline/status/ETA and empty/loading/error states.
- Fix `preorder` persisted/hash routing and add the frontend feature flag.
- Add pure helper/state tests and build.

Acceptance: Staff003 can create and track a case; UI has no branch selector or leakage.

### WP-05 — Admin workflow and customer decision loop

- Add all-branch queue, filters, actionable grouping, admin-read behavior, and detail actions.
- Implement start review, request info, structured quote versions, customer accept/decline
  quantities, mark ordered, unavailable reason, cancel, reopen, and notifications.
- Show only actions valid for the current state.
- Add complete transition/API/frontend helper tests.

Acceptance: both inquiry and direct-order paths reach the correct terminal/fulfillment
states with immutable history.

### WP-06 — HQ receipt and ETA integration

- Add admin-only exact-code receipt candidates from approved HQ receipts.
- Add explicit item/quantity allocation, link/unlink, snapshot, and events. Do not silently
  convert incompatible units; require an admin allocation and note when equivalence is not
  proven.
- Advance to `RECEIVED_AT_HQ` only after confirmed coverage of every required item
  quantity; show partial coverage without advancing the whole case.
- Calculate/store/display explainable ETA and admin override.
- Add stale-source timestamp and tests.

Acceptance: branch 003 uses M/W/F, branch 005 uses Tue/Thu/Sat, and staff sees `ประมาณ`
with basis—not a guaranteed promise.

### WP-07 — Transfer evidence and arrival

- Add admin-only transfer candidates using reconciliation/raw read models.
- Link stable case/document keys without FK to delete/rebuild derived rows.
- Surface outbound, processed inbound, ambiguous, and stale states.
- Implement admin/staff physical-arrival confirmation without overwriting Ada evidence.
- Test ambiguous matches and derived refresh resilience.

Acceptance: transfer evidence improves tracking while AdaAcc remains strictly read-only.

### WP-08 — Hardening and handoff

- Run focused and full backend tests.
- Run admin-web tests and production build.
- Run or add the relevant E2E scenarios from the design without touching production.
- Check light/dark, desktop/mobile, keyboard/focus, reduced motion, and Thai error copy.
- Regression-check existing stock requests, receipts, movement, login, and navigation.
- Update `docs/ARCHITECTURE.md` only to describe code that now exists.
- Finish the implementation state document with exact commands/results, migration/deploy
  order, feature-flag rollback, known limitations, and manual production steps not taken.

Acceptance: all definition-of-done items are evidenced or a precise blocker is recorded.

## Verification commands

Use current package scripts after inspecting them. At minimum, expect equivalents of:

```powershell
cd "C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project"
node --test tests/<focused-preorder-test>.test.js
npm test

cd "C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering"
npm test -w apps/admin-web
npm run build -w apps/admin-web
```

Do not claim a test passed unless you ran it and saw a successful exit. If the full suite
has a pre-existing failure, prove focused tests pass and report the exact unrelated
failure without hiding it.

## Definition of done

- Staff can submit catalog/free-form inquiry or order cases with up to three images.
- `@` search works for exact/partial code, barcode, Thai, and English/generic names.
- Staff sees only own branch; admin sees all; negative authorization tests pass.
- Staff can see whether/when admin opened the case.
- Quote → customer accept/decline → procurement path works with final quantities.
- Ordered/unavailable outcomes and reason history work.
- Conversation, read cursors, badges, events, idempotency, and optimistic concurrency work.
- HQ receipt and transfer evidence are explicitly linked, immutable, source-timestamped,
  and never write to AdaAcc.
- Branch ETA is explainable and follows configured schedules.
- Attachments are in private R2, type/size/count bounded, authorized by the parent case,
  and exposed only by short-lived presigned GET URLs.
- Existing flows regress cleanly; frontend and backend tests/builds pass.
- Feature is default-off and rollback is a flag change that preserves history.
- No deployment, production migration, or environment change was performed.

When finished, report:

1. outcome by user role and workflow;
2. files/migrations created and modified in each repo;
3. exact test/build commands and results;
4. deployment order and manual actions still required;
5. rollback procedure;
6. known limitations, especially source-data lag, presigned URL lifetime, and R2 orphan
   cleanup/monitoring.

Begin now with WP-00 and continue through WP-08 unless genuinely blocked.
