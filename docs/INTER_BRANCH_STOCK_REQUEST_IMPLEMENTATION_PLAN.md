# Inter-Branch Stock Request — Implementation Plan

> Status: PLAN ONLY. No production code in this document. Evidence-based against the
> actual workspace `C:\Users\scgro\Desktop\FadaSoft-projects.code-workspace`.
> Last inspected: 2026-06-18.

---

## 1. Executive summary

We will add a complete **inter-branch stock request** lifecycle on top of the existing
SC StockDay system: a branch (e.g. `001`) discovers stock held by other branches, adds
products to a request cart grouped by **source branch**, submits one checkout that the
backend **splits into one child request per source branch**, each receiving branch is
notified and responds **line by line** (approve full / approve partial / reject, with
required reasons), the requester acknowledges each branch response, and the source branch
prints a **packing/transfer document** to attach to the parcel.

The single most important finding that shapes this plan:

- **The deployed backend is `PaaSRTSM-project/apps/admin-api`** (Express + `pg`), not
  `SC-StockDay-Ordering/server` (which is legacy). Both web apps point at
  `https://paasrtsm-project.onrender.com` via their `.env`.
- **There is no server-side branch identity today.** `order-web` is unauthenticated and
  sends `branchCode` freely in the request body. The auth session
  (`{ sub, role, csrf }`, roles `admin`/`staff`) carries no branch. Establishing
  trusted branch identity is the **foundational prerequisite (WP-00)** for this feature;
  every authorization rule depends on it.
- **There is no notification, no PDF, and no real-time infrastructure** in any repo. We
  build DB-backed notifications + polling (Phase 3) and a print view from immutable
  server data (Phase 4).

The work is phased so the database/backend foundation ships and is testable **before**
any UI is activated, behind a feature flag, piloted on branch pair **001 → 000**.

---

## 2. Workspace / repository architecture map

Workspace file: `FadaSoft-projects.code-workspace` → 4 folders under
`Desktop/Webapp training project/`.

| Repo | Role | Runtime | Deploy |
|---|---|---|---|
| `PaaSRTSM-project` | **Live backend + drug-DB admin** | Node/Express CommonJS, `pg` | `paasrtsm-project.onrender.com` |
| `SC-StockDay-Ordering` | `order-web` (branch staff) + `admin-web` (StockDay admin monolith) + legacy `server/` | Vite/React (ESM), legacy Express | `sc-stockday-ordering` Render service builds **admin-web only** (`render.yaml`) |
| `SC-StockDay-Ordering-BranchSender` | .NET console app on each branch PC; uploads branch stock | .NET 10 | Task Scheduler on branch PCs |
| `SCCRMonPOS` | C# POS loyalty companion | .NET 4.8 WinForms | POS machines (unrelated to ordering) |

### Backend (authoritative)
- Entry/mounting: `PaaSRTSM-project/apps/admin-api/src/server.js`
- Ordering routes: `PaaSRTSM-project/apps/admin-api/src/routes/ordering.js`
  (mounted at `/api`, `createOrderingRouter`)
- Branch stock routes: `PaaSRTSM-project/apps/admin-api/src/routes/branch-stock.js`
  (mounted at `/api`, `createBranchStockRouter`; serves `GET /api/branch-stock`)
- Auth: `apps/admin-api/src/routes/auth.js`, `routes/me.js`,
  `auth/middleware.js` (`requireAuth`, `requireRole`, `requireCsrf`),
  `auth/session.js` (`signSessionToken`, `verifySessionToken`, `generateCsrfToken`,
  `authCookieOptions`), `auth/users.js` (`resolveUserRole` → `admin`/`staff`)
- Audit helper: `apps/admin-api/src/audit.js`, `utils/audit-payload.js`
  (writes to `admin.audit_logs`, migration `010_add_audit_logs.sql`)
- DB pool/config: `apps/admin-api/src/db.js`, `config.js`
- Migrations: `PaaSRTSM-project/migrations/0XX_*.sql`; runner
  `PaaSRTSM-project/scripts/db_migrate.js` (`npm run db:migrate`)
- Tests: `PaaSRTSM-project/tests/*.test.js`, run with `npm test` (`node --test`),
  `supertest` available; smoke test `tests/admin_api_smoke.test.js`,
  branch stock `tests/branch_stock_routes.test.js`

### Frontend
- Branch staff app: `SC-StockDay-Ordering/apps/order-web/src/App.jsx`
  (+ `main.jsx`, `styles.css`); `.env` → PaaSRTSM. **No router, no auth, single file.**
- StockDay admin monolith (hosts the branch-stock comparison table + toolbar
  `branch-stock-toolbar` / `excel-export-button`): `SC-StockDay-Ordering/apps/admin-web/src/App.jsx`
  (+ `styles.css`); `.env` → PaaSRTSM.
- Separate drug-DB admin (NOT used here, but contains reusable patterns):
  `PaaSRTSM-project/apps/admin-web/src/components/` — `LoadingOverlay.jsx`,
  `ProgressOverlay.jsx`, `ConfirmModal.jsx`, `ToastViewport.jsx`, `RoleGuard.jsx`,
  `AppShell.jsx`, `ProductPickerModal.jsx`. These are reference implementations for
  overlays/modals/toasts to mirror, not import.

### Stock data flow
Branch PC → `SC-StockDay-Ordering-BranchSender` (.NET) →
`POST /api/branch-stock/upload` → merges single-branch `qty` into wide table
`ada.branch_stock_snapshots` (PK `product_code`, columns `qty_branch_000..005`,
`qty_total_all_branches`, one `synced_at`). Frontend reads `GET /api/branch-stock`.

---

## 3. Existing implementation evidence

- **Order requests already exist (single-branch only).**
  `ordering.js` → `POST /api/order-requests` inserts into
  `ordering.branch_order_requests` + `ordering.branch_order_request_items`
  (migration `014_add_shared_ordering_and_sync.sql`). Status CHECK =
  `('draft','submitted','reviewed','approved','rejected','fulfilled')`. There is **no
  source/destination branch concept, no per-line response, no events, no notifications**.
  Item unique key: `(order_request_id, product_code, requested_unit)`.
- **order-web cart UI already exists** in `apps/order-web/src/App.jsx`: `draftItems`
  state, search → `addProduct` → `.basket` rows → `submitRequest`. This is the seed we
  extend (multi-branch grouping, source branch per line).
- **Branch-stock comparison table + toolbar exist** in `apps/admin-web/src/App.jsx`
  (`branch-stock` view) reading `GET /api/branch-stock`; Excel export via
  `branch-stock.js` (`xlsx`). Columns match the task spec exactly.
- **Auth**: `auth/middleware.js` `requireAuth` sets
  `req.auth = { userId, role, csrf }`. `requireCsrf` checks `x-csrf-token` header.
  CORS allowlist + credentials in `server.js`. Login rate limiting present.
- **Audit log table exists** (`admin.audit_logs`) and is used by `auth.js`,
  `branch-stock.js`, etc. via `auditLog(db, auditBase(req, {...}))`.
- **Idempotency precedent**: `BranchSender` already sends `idempotencyKey` + `payloadHash`
  to `/api/branch-stock/upload` (README), so an idempotency-key pattern is established
  in this system and should be reused for request submission.
- **Branches**: `core.branches` (`branch_code` PK, `is_hq`, `is_active`). Known active
  branches across the code: `000` (HQ), `001`, `003`, `004`, `005` (`002` exists in some
  whitelists but is not in the display set).

---

## 4. Gap analysis

| Capability | Today | Needed |
|---|---|---|
| Trusted branch identity | None (body-supplied `branchCode`, order-web unauthenticated) | Server-derived branch from session (WP-00) |
| Source vs requesting branch | Single `branch_code` only | `requesting_branch` + `source_branch` per child request |
| Multi-branch checkout split | None | Batch → N child requests (one per source branch) |
| Per-line response | None | Approve full/partial/reject + reason + responder + timestamp |
| Request state machine | 6-value flat CHECK | Batch + child + line + response state machines |
| Notifications | None | DB-backed table + polling + unread badge |
| Requester acknowledgment | None | Distinct ack action/status (≠ physical receipt) |
| Printable packing doc | None (xlsx only) | Print view from immutable snapshot data |
| Audit/event history | Generic `admin.audit_logs` only | Domain event table `stock_request_events` |
| Concurrency / stock safety | None | Revalidation at approval; Phase-1 no stock decrement |
| order-web routing | Single-page, no router | Multi-tab/route app (ตะกร้า / รับคำขอ / สถานะคำขอของฉัน) |

---

## 5. Recommended architecture

### 5.1 Decisions (with rationale)
1. **Build all backend in `PaaSRTSM-project/apps/admin-api`** as a new
   `routes/stock-requests.js` + `services/stockRequests.js`, mounted at `/api` in
   `server.js`. Reuse `requireAuth`/`requireCsrf`/`auditLog`/`db` patterns. Keep
   legacy `SC-StockDay-Ordering/server` untouched.
2. **Build the request UI in `order-web`** because the task requires *all branches* to use
   the same app and a `รับคำขอ` tab there. order-web must gain (a) a client router, (b) a
   branch-scoped login, (c) the branch-stock comparison view (port the read-only table
   that already exists in admin-web, reusing `GET /api/branch-stock`). The
   admin-web monolith is admin-only and is **not** the branch-staff surface.
3. **Branch identity = new `branch` session claim (WP-00).** Add `branch_code` to the
   session token and a branch login path for order-web. `admin`/HQ may act for any branch
   via an explicit, audited branch switch; a `branch` user is locked to its own branch.
   Server **always** derives scope from `req.auth`, never from the body.
4. **New `ordering` tables, additive.** Do not overload the existing
   `branch_order_requests`; create dedicated `ordering.stock_request_*` tables so the
   legacy single-branch flow keeps working during rollout.
5. **Phase-1 = workflow only, no stock mutation.** Snapshots are stale by nature
   (per-branch uploads). Approval **revalidates** current snapshot and warns, but never
   decrements stock. Reservation/dispatch/receipt are later phases.
6. **Printing = server-provided immutable document JSON rendered by a dedicated print
   route + print stylesheet.** No PDF dependency exists; a browser print view keyed off a
   versioned `stock_request_documents` snapshot is deterministic and auditable. A
   server-side PDF renderer (e.g. `pdfkit`) is an optional later enhancement.
7. **Human-readable ID**: `SRQ-YYYYMMDD-<requestingBranch>-<seq>` for the batch and
   `SRQ-YYYYMMDD-<requestingBranch>-<seq>-<sourceBranch>` for child requests, alongside
   `bigserial` PKs. (No existing internal doc-number scheme to conflict with; AdaAcc doc
   numbers are external/source data only.)

### 5.2 Assumptions (Codex MUST verify before building — see §20)
- **A1** order-web will be deployed as its own static site (it is not in the current
  `sc-stockday-ordering` build). Rollout includes wiring its build/host.
- **A2** A branch-login credential model is acceptable (shared per-branch credential or
  per-user-with-branch). Default proposal: extend `auth/users.js` config with a `branch`
  role + `userId → branch_code` map; confirm with stakeholders.
- **A3** Same product may be requested from multiple source branches in one checkout
  (allowed). Same product + same source branch merges.
- **A4** Phase-1 ships with **no** automatic stock decrement; business accepts manual
  reconciliation until Phase 6.
- **A5** Quantities are in the product's smallest unit; integer-only unless the snapshot
  unit is fractional (the snapshot stores `unit` text only; default to positive integers).

---

## 6. User journeys

### 6.1 Requester (branch `001`)
1. Logs into order-web (branch `001` derived from session).
2. Opens **branch stock** view → clicks **ขอสินค้า** (orange) → table enters
   request-selection mode (leading `#` column with orange `+` per row).
3. Clicks `+` on a product → **product request modal** shows per-branch availability +
   `synced_at` + staleness warning. Picks source branch(es) + qty → **เพิ่มลงตะกร้าคำขอ**
   (add-to-cart animation + badge increment; badge = distinct request lines).
4. Opens **cart** (`/cart`) grouped by source branch; edit/remove lines →
   **สร้างคำขอสินค้า**.
5. **Final review** (`/cart/review`): one collapsible card per source branch
   (lines, total units, แสดงเพิ่มเติม/แสดงน้อยลง) →
   **ยืนยันการสร้างเอกสารคำขอสินค้า** (green) → confirmation modal explains N branch
   requests will be created and each notified → confirm (idempotency key) → blocking
   overlay → success.
6. Tracks under **สถานะคำขอของฉัน** (search by SRQ id; per-branch status
   รอตอบกลับ/ตอบกลับแล้ว). Opens a branch response → reviews requested/approved/rejected
   + reasons → **acknowledges**.
7. After source branch prints/dispatches, compares received goods vs record.

### 6.2 Receiver (branch `000`)
1. Sees unread badge on **รับคำขอ** tab.
2. **คำขอจากสาขาอื่น** → "คำขอจากสาขาอื่นมายังสาขา 000" list (id, requesting branch,
   submitted at, lines, status, new indicator).
3. Opens a request → responds **line by line** (approve full / approve partial+reason /
   reject+reason / other→mapped status+note) → review summary → submit transactionally →
   requester notified.
4. After requester acknowledges → prints packing document → (later) marks dispatched.

---

## 7. State machines

### 7.1 Batch (`stock_request_batches.status`)
`DRAFT` → `SUBMITTED` → `PARTIALLY_RESPONDED` → `RESPONDED` → `ACKNOWLEDGED` →
`COMPLETED`; plus `CANCELLED` (from DRAFT/SUBMITTED before any response).
Aggregate computed from children; batch never loses child detail.

### 7.2 Child branch request (`stock_requests.status`)
`SUBMITTED` → `RESPONDED` → `ACKNOWLEDGED` → (`READY_TO_DISPATCH` → `DISPATCHED` →
`RECEIVED`)* → `COMPLETED`; `CANCELLED` allowed only while `SUBMITTED`.
(* Phase 5.) Independent per source branch.

### 7.3 Request line (`stock_request_lines.status`)
`PENDING` → one of `APPROVED_FULL` / `APPROVED_PARTIAL` / `REJECTED` (set when the child
response is submitted). Reopen only via explicit amendment.

### 7.4 Response (`stock_request_line_responses`)
Draft rows allowed (`is_submitted=false`) but never shown to requester as final. On submit
the set becomes immutable; corrections require a new amendment row (audited), never
overwrite.

### 7.5 Notification read state
`unread` → `read` (per recipient branch/user).

For each transition the design records: current state, action, next state, allowed actor
(server-derived branch/role), validation, transaction boundary, audit event written,
notification generated, reversal policy. Edge cases handled: all-approved, mixed
partial/reject, one branch responds while another pending, requester cancels before
response, stale-version response (optimistic `version` check → 409), duplicate submit
(idempotency key), network timeout after server success (idempotent replay),
product-master change after submit (immutable snapshot fields), disabled branch
(`is_active=false` blocks new requests), reopen/amend (new audited rows), print/PDF
failure (document row marked failed, retriable), notification failure (state change still
commits; notification retried), delivered ≠ approved (recorded at receipt, Phase 5).

---

## 8. Database schema (new migration `033_add_stock_request_workflow.sql`)

All in schema `ordering`. Additive, backward-compatible, wrapped in `BEGIN/COMMIT`,
`CREATE TABLE IF NOT EXISTS`. FKs: branches → `core.branches(branch_code)`, product →
`public.skus(company_code)`.

**`ordering.stock_request_batches`** — one per checkout submission.
- PK `batch_id bigserial`; `public_id text UNIQUE` (`SRQ-YYYYMMDD-<branch>-<seq>`)
- `requesting_branch_code text NOT NULL REFERENCES core.branches`
- `status text NOT NULL DEFAULT 'SUBMITTED' CHECK (...)`
- `created_by text`, `note text`, `idempotency_key text UNIQUE`,
  `version integer NOT NULL DEFAULT 1`
- `created_at/updated_at/submitted_at timestamptz`

**`ordering.stock_requests`** — one child per source branch within a batch.
- PK `request_id bigserial`; `public_id text UNIQUE`
- `batch_id bigint NOT NULL REFERENCES stock_request_batches ON DELETE CASCADE`
- `requesting_branch_code`, `source_branch_code` (both FK), `status` CHECK,
  `responded_by`, `responded_at`, `acknowledged_by`, `acknowledged_at`,
  `version integer DEFAULT 1`, timestamps
- `CHECK (source_branch_code <> requesting_branch_code)`
- Indexes on `(source_branch_code, status)`, `(requesting_branch_code, status)`, `batch_id`

**`ordering.stock_request_lines`** — requested product per child request, with **immutable
snapshots**.
- PK `line_id bigserial`; `request_id` FK CASCADE
- `product_code` FK; snapshot fields `product_name_thai`, `product_name_eng`,
  `barcode`, `unit` (frozen at submit)
- `requested_qty numeric(14,4) NOT NULL CHECK (requested_qty > 0)`
- `snapshot_qty numeric(14,4)`, `snapshot_synced_at timestamptz` (what the requester saw)
- `status text DEFAULT 'PENDING' CHECK (...)`
- `UNIQUE (request_id, product_code, unit)`

**`ordering.stock_request_line_responses`** — receiver's answer (versioned/amendable).
- PK `response_id bigserial`; `line_id` FK CASCADE
- `response_status CHECK ('APPROVED_FULL','APPROVED_PARTIAL','REJECTED')`
- `approved_qty numeric(14,4) NOT NULL DEFAULT 0 CHECK (approved_qty >= 0)`
- `reason_code text`, `note text` (length-limited in app)
- `revalidated_snapshot_qty numeric(14,4)`, `is_submitted boolean DEFAULT false`
- `responded_by`, `created_at`, `superseded_by bigint NULL` (amendment chain)
- `CHECK (approved_qty <= ` requested qty `)` enforced in service (cross-table) +
  partial requires `approved_qty>0 AND <requested` + reason.

**`ordering.stock_request_events`** — append-only audit timeline.
- PK `event_id bigserial`; `batch_id`, `request_id`, `line_id` (nullable),
  `event_type text`, `actor_user text`, `actor_branch text`, `metadata jsonb`,
  `note text`, `request_correlation_id text`, `created_at`

**`ordering.stock_request_notifications`** — DB-backed inbox.
- PK `notification_id bigserial`; `recipient_branch_code` FK, `recipient_user text NULL`,
  `type text`, `batch_id`, `request_id`, `message text`, `link_target text`,
  `dedup_key text UNIQUE`, `read_at timestamptz NULL`, `created_at`
- Indexes on `(recipient_branch_code, read_at)`

**`ordering.stock_request_documents`** — versioned printable snapshot.
- PK `document_id bigserial`; `request_id` FK, `version integer`,
  `document_payload jsonb NOT NULL` (frozen lines/qtys/branches/dates),
  `generated_by`, `generated_at`, `reprint_of bigint NULL`
- `UNIQUE (request_id, version)`

**Phase 5 (later, separate migration):** `ordering.stock_request_shipments`,
`ordering.stock_request_receipts` (dispatched_qty / received_qty, difference reporting).

DB-level constraints enforce the critical rules (`requested_qty>0`, `approved_qty>=0`,
`source<>requesting`, unique line key, unique idempotency/dedup keys); cross-row rules
(`approved_qty<=requested_qty`, valid transitions) enforced transactionally in the service
layer.

---

## 9. API contracts (new `routes/stock-requests.js`, mounted at `/api`)

All authenticated via `requireAuthMiddleware`; mutations also `requireCsrfMiddleware`.
Branch scope is **always** derived from `req.auth.branch_code` (WP-00), never the body.
DTOs omit internal columns (no `version`/raw payload leakage beyond what the client needs).
Standard errors: 400 validation, 401 unauth, 403 wrong branch/role, 404, 409 concurrency/
idempotency conflict, 422 business rule. Every mutation writes a
`stock_request_events` row in the same transaction.

**Requester**
- `POST /api/stock-requests` — submit a batch. Body: `{ idempotencyKey, note, groups:[{ sourceBranchCode, lines:[{ productCode, requestedQty, unit, snapshotQty, snapshotSyncedAt }] }] }`. Validates branch≠source, qty>0, products exist, source branches active. Splits into children in ONE transaction; returns `{ batchPublicId, requests:[{ publicId, sourceBranchCode }] }`. Idempotent on `idempotencyKey`.
- `GET /api/stock-requests/mine?search=<SRQ>` — outgoing list for `req.auth.branch_code`.
- `GET /api/stock-requests/:publicId` — batch detail with children + lines + responses (only if owned by caller's branch, or admin).
- `POST /api/stock-requests/:requestPublicId/acknowledge` (CSRF) — requester acks a child response. 409 on stale `version`.
- `GET /api/stock-requests/:requestPublicId/document` — immutable document JSON for print.

**Receiver**
- `GET /api/stock-requests/incoming` — children where `source_branch_code = req.auth.branch_code`.
- `GET /api/stock-requests/incoming/:requestPublicId` — detail (403 if not addressed to caller's branch).
- `PUT /api/stock-requests/incoming/:requestPublicId/lines/:lineId/response` (CSRF) — save **draft** line response.
- `POST /api/stock-requests/incoming/:requestPublicId/submit-response` (CSRF) — submit all lines transactionally; validates each line answered + reason rules; sets statuses; creates requester notification + events. 409 on stale `version`.
- `POST /api/stock-requests/incoming/:requestPublicId/document` (CSRF) — generate/regenerate packing document (new version row).

**Notifications**
- `GET /api/notifications` — list for caller's branch.
- `GET /api/notifications/unread-count`.
- `POST /api/notifications/:id/read` (CSRF).

**History**
- `GET /api/stock-requests/:publicId/events` — timeline.

For each endpoint the plan specifies method/route/auth/authorization/body/response/
validation/idempotency/concurrency/audit event/notification, and the file Codex edits
(`routes/stock-requests.js`, `services/stockRequests.js`, `server.js` mount).

---

## 10. Frontend component & route plan

`order-web` becomes a small routed app (add `react-router-dom`). New/changed files under
`SC-StockDay-Ordering/apps/order-web/src/`:

- `main.jsx` — wrap in router + `AuthProvider` + `CartProvider`.
- `lib/api.js` — fetch wrapper (credentials: 'include', CSRF header, error mapping).
- `context/AuthContext.jsx` — `me()` → branch identity; `LoginPage`.
- `context/CartContext.jsx` — cart state persisted to `localStorage` (draft recovery only;
  server is source of truth). Merge rule: same product+source merges qty; different source
  = separate line. Badge = distinct lines.
- `components/` — `LoadingOverlay.jsx`, `ConfirmModal.jsx` (focus trap + restore, ARIA),
  `Toast.jsx`, `CartBadge.jsx`, `AddToCartFly.jsx` (reduced-motion fallback),
  `BranchStockTable.jsx` (ported read-only comparison table), `RequestModeToggle.jsx`
  (ขอสินค้า button — orange, hover/active/focus/disabled/loading),
  `ProductRequestModal.jsx`, `StaleStockWarning.jsx`, `BranchResponseCard.jsx`,
  `RequestStatusPill.jsx`, `RequestTimeline.jsx`, `NotificationBell.jsx`.
- `pages/` — `BranchStockPage.jsx` (selection mode + leading `#`/`+` column),
  `CartPage.jsx` (grouped by source branch, สร้างคำขอสินค้า),
  `ReviewPage.jsx` (collapsible per-branch cards, ยืนยันการสร้างเอกสารคำขอสินค้า green),
  `IncomingRequestsPage.jsx` (รับคำขอ → คำขอจากสาขาอื่น),
  `IncomingRequestDetailPage.jsx` (line response controls),
  `MyRequestsPage.jsx` (สถานะคำขอของฉัน, search by id),
  `RequestDetailPage.jsx` (timeline + acknowledge),
  `PackingDocumentPage.jsx` (print stylesheet view).
- `styles.css` — orange request button + `+` button states; print `@media print` block.

UX rules: skeletons/inline spinners for list/table loads; full-page blocking overlay only
for submit/response-submit/document-generate; empty + error states everywhere; keyboard +
ARIA + focus management in modals; cart survives refresh; route protection by branch/role.

The **admin-web monolith branch-stock view is left intact**; the comparison table logic is
copied (not imported across repos) into order-web's `BranchStockTable.jsx`.

---

## 11. Notification architecture

No existing mechanism → **Phase 1: DB-backed + polling**. Notifications created
transactionally with state changes (`stock_request_notifications`, `dedup_key` unique).
Frontend `NotificationBell` polls `GET /api/notifications/unread-count` (e.g. 30–60s) and
loads the list on open. DB + request list remain authoritative; notifications are a
convenience layer. Events: new incoming request, response submitted, partial approval,
rejection, requester acknowledged, document ready, (Phase 5) dispatched/received,
amended/reopened, cancelled. **Possible later phase**: SSE/WebSocket delivery (no infra
today).

---

## 12. Audit architecture

Two layers: keep the existing generic `admin.audit_logs` (via `auditLog`/`auditBase`) for
security events (login, privileged overrides), **plus** the domain
`ordering.stock_request_events` append-only timeline for every workflow transition
(`REQUEST_BATCH_CREATED`, `REQUEST_SUBMITTED`, `LINE_APPROVED_FULL/PARTIAL`,
`LINE_REJECTED`, `RESPONSE_SUBMITTED`, `RESPONSE_ACKNOWLEDGED`, `DOCUMENT_GENERATED`,
`DOCUMENT_REPRINTED`, `REQUEST_CANCELLED`, `REQUEST_REOPENED`, …). Each event: ids, actor
user + branch, type, timestamp, `metadata jsonb`, optional note, correlation id
(`req.requestId`). Critical history is never log-only.

---

## 13. Printable document design

`PackingDocumentPage.jsx` renders from `GET /api/stock-requests/:id/document` (immutable
`stock_request_documents.document_payload`). Contains: document/request id (`public_id`),
source branch, destination (requesting) branch, request date, response date, print date,
per line {product code, name, barcode, smallest unit, requested qty, approved/ship qty,
partial/rejected marker, reason/note}, prepared by, checked by, signature/check boxes,
page number, version/reprint indicator. Print via CSS `@media print`. A **reprint** creates
a new version row and never mutates historical quantities. Server-side PDF (`pdfkit`) is an
optional later enhancement; the print view is the Phase-4 deliverable.

---

## 14. Security & authorization matrix

| Capability | branch user (own branch) | admin / HQ | staff | service acct |
|---|---|---|---|---|
| Submit request (as own branch) | ✓ | ✓ (any branch, audited switch) | — | — |
| View own outgoing | ✓ | ✓ all | — | — |
| View incoming addressed to branch | ✓ (own) | ✓ all | — | — |
| Respond to incoming | ✓ (own) | ✓ | — | — |
| Acknowledge response | ✓ (requester branch) | ✓ | — | — |
| Generate/print document | ✓ (source branch) | ✓ | — | — |
| Branch-stock upload | — | — | — | ✓ (token) |

Rules: branch scope **server-derived** from `req.auth.branch_code`; frontend can never set
another branch by editing a body field; admin branch-switch is explicit + audited; every
transition records authenticated actor; notes length-limited + safely rendered (no HTML
injection); CSRF on all mutations; idempotency keys prevent duplicate/replay; reuse
existing CORS/session/cookie conventions; do not leak other branches' stock beyond what
`GET /api/branch-stock` already exposes.

---

## 15. Concurrency & stock safety

Snapshots are stale by design (per-branch uploads into `ada.branch_stock_snapshots`).
- Quantity model kept distinct: **snapshot/display**, **requested**, **approved**,
  (Phase 5) **reserved/dispatched/received**.
- **Approval revalidates** the current snapshot (`revalidated_snapshot_qty`) and warns the
  receiver; it does **not** decrement stock in Phase 1.
- Optimistic concurrency via `version` on batch/child request → 409 on conflict.
- Submission is one DB transaction (batch+children+lines+events+notifications).
- **Phase-1 risk (documented):** two branches may both approve against the same stale
  stock; reconciliation is manual until Phase 6 introduces reservation/dispatch/receipt
  and integration with the real inventory source-of-truth. No actual stock movement occurs
  merely because a request is submitted or approved.

---

## 16. Testing plan

Backend (PaaSRTSM, `node --test` + `supertest`, new `tests/stock_requests_*.test.js`):
- Unit: qty validation, cart-merge/group helpers, status transitions, aggregate status,
  reason-required rules, permission checks, `public_id` generation, notification dedup.
- DB/integration: migration applies cleanly; constraints reject bad qty/`source=requesting`;
  batch+children created atomically; duplicate idempotency key → single batch; branch B
  cannot read branch A's request; response submission writes events+notifications;
  document uses immutable snapshot.
- API: submit valid multi-branch; reject malformed; partial; full reject; mixed; search by
  id; optimistic 409; retry-after-timeout idempotent.

Frontend (order-web — add a test runner, e.g. Vitest + Testing Library; currently none):
selection mode toggle, `+` opens correct modal, modal keyboard/focus, badge increment,
duplicate-line merge, checkout grouping, final confirmation guard, incoming/outgoing
separation, mandatory reason validation, loading/error states, notification navigation,
print layout.

E2E (the 10 scenarios in the brief, incl. 001→000, multi-branch 000+003, full/partial/
reject, acknowledge, print, duplicate-retry-once, cross-branch 403). Tooling TBD (no E2E
harness today) — recommend Playwright in Phase 4/14.

**Commands** (verified from `package.json`):
- Backend: `cd PaaSRTSM-project && npm test` (`node --test`); single file
  `node --test tests/stock_requests_api.test.js`.
- Migrations: `cd PaaSRTSM-project && npm run db:migrate`.
- order-web build: `cd SC-StockDay-Ordering && npm run build -w apps/order-web`
  (dev: `npm run dev:order`). Frontend unit test command added with the runner in its WP.

---

## 17. Observability

Reuse `req.requestId` (set in `requestContextMiddleware`) as correlation id in all logs and
events. Errors via existing `console.error('[admin-api:<reqId>]', err)` + `admin.audit_logs`.
Metrics to surface (admin view, later): submitted requests/day, response time by branch,
pending request age, rejection/partial rates, notification failures, document-generation
failures, stuck workflows (SUBMITTED with no response > N days). Safe cleanup job for
abandoned DRAFT/cart artifacts; retention policy for events/notifications; never log
free-text notes at info level.

---

## 18. Migration & deployment

- Migrations are additive, reversible-where-practical, deployable before UI activation;
  run via `npm run db:migrate` (Render `preDeployCommand` already runs migrate for the SC
  service; PaaSRTSM migrate runs in its own deploy). New numbered files only; never edit
  shipped migrations.
- Feature flag (env, read in `config.js`) gates the new routes and the order-web tabs:
  `FEATURE_STOCK_REQUESTS=true`. Default off.
- order-web deployment must be stood up (A1) and pointed at PaaSRTSM with credentials
  config for the new branch login (A2).

---

## 19. Rollout & rollback

- **Phase 0** confirm topology/auth/stock/state model (this doc).
- **Phase 1** DB + backend services + APIs + auth branch identity + tests (flag off).
- **Phase 2** request creation UI (stock view selection mode, modal, cart, review, submit,
  สถานะคำขอของฉัน).
- **Phase 3** รับคำขอ incoming + line responses + notifications.
- **Phase 4** acknowledgment + packing document + reprint history.
- **Phase 5** dispatch/receipt + difference reporting.
- **Phase 6** reservation/inventory integration (only after confirming inventory
  source-of-truth).
- **Pilot**: enable flag for requester `001` → source `000` first, then widen.
- **Rollback per phase**: turn the feature flag off (UI + routes go dark); new tables are
  additive and can be left in place or dropped via a down migration; no legacy table is
  modified, so the existing single-branch ordering flow is unaffected.

---

## 20. Risks & assumptions

Risks: stale-stock double-allocation in Phase 1 (mitigation: revalidate+warn, manual recon,
pilot one pair); order-web currently has no router/auth/test harness (larger Phase-2 lift);
two-backend confusion (mitigation: all work in PaaSRTSM admin-api, documented here);
no PDF infra (mitigation: print stylesheet first); notification polling load (tune
interval). Assumptions A1–A5 in §5.2 must be confirmed by Codex/stakeholders before WP-00.

---

## 21. Exact implementation sequence (work packages)

> Each WP: objective, repo, files to change/create, deps, DB/API/FE/test changes,
> acceptance, commands, risks, rollback, independently committable.

- **WP-00 — Server-side branch identity.** Repo: PaaSRTSM. Change `auth/session.js`,
  `auth/users.js`, `auth/middleware.js`, `routes/auth.js`, `routes/me.js`, `config.js`;
  add `branch` role + `branch_code` claim + branch login. DB: none (or seed config).
  Tests: auth tests for branch claim + scope. Acceptance: `me` returns `branch_code`;
  branch user cannot act as another branch. Commands: `npm test`. Rollback: revert; flag
  off. Independent: yes (no UI yet). **Dependency for all others.**
- **WP-01 — Domain model & migration.** Repo: PaaSRTSM. New
  `migrations/033_add_stock_request_workflow.sql` (§8). Tests: migration-applies +
  constraint tests. Commands: `npm run db:migrate`, `npm test`. Rollback: down migration.
- **WP-02 — Submission transaction service.** New `services/stockRequests.js` +
  `routes/stock-requests.js` (`POST /api/stock-requests`), mount in `server.js`. Idempotency,
  split-by-branch, events. Tests: atomic create, idempotency, validation. Depends: WP-00/01.
- **WP-03 — Read & authorization APIs.** `GET mine`, `GET :id`, `GET incoming`,
  `GET incoming/:id`, events. Branch-scoped. Tests: cross-branch 403. Depends: WP-02.
- **WP-04 — Branch stock request-selection mode (order-web).** Router + `BranchStockTable`
  + ขอสินค้า button + leading `#`/`+` column. Depends: WP-00 (login), WP-03.
- **WP-05 — Request modal & cart.** `ProductRequestModal`, `CartContext`, badge, animation,
  merge rules. FE tests. Depends: WP-04.
- **WP-06 — Review & submission flow.** `ReviewPage` + confirm modal + idempotent submit +
  สถานะคำขอของฉัน list/detail/timeline. Depends: WP-02, WP-05.
- **WP-07 — Incoming request tab (รับคำขอ).** List + detail, branch-scoped. Depends: WP-03.
- **WP-08 — Line response workflow.** Draft + submit-response transaction + reason rules +
  statuses + events. APIs + UI. Depends: WP-07.
- **WP-09 — Notifications.** Table writes in WP-08 transactions + APIs + `NotificationBell`
  polling. Depends: WP-08.
- **WP-10 — Outgoing status & timeline polish.** Aggregate status, search-by-id, pills.
  Depends: WP-06, WP-08.
- **WP-11 — Requester acknowledgment.** `acknowledge` API + UI (distinct from receipt).
  Depends: WP-08.
- **WP-12 — Printable packing document.** `stock_request_documents` writes, document API,
  `PackingDocumentPage` + print CSS, reprint versioning. Depends: WP-11.
- **WP-13 — Dispatch & receipt tracking (Phase 5).** New migration + APIs + UI; difference
  reporting. Depends: WP-12.
- **WP-14 — E2E tests & rollout controls.** Feature flag wiring, Playwright E2E (10
  scenarios), order-web deploy config. Depends: all.

---

## 22. Definition of done

- Branch identity enforced server-side; branch can't impersonate another via body.
- `001` can request from `000`; one submission creates requests to multiple branches.
- Receiving branches see only their requests; incoming/outgoing clearly separated.
- Responses are line-specific; partial/reject require reasons.
- Requester receives response notifications; request ids searchable; status history
  auditable; duplicate submissions prevented; critical ops transactional.
- Print document contains immutable request/response info; reprint never alters history.
- Loading + error states; keyboard/modal accessibility covered.
- Backend + DB tests pass; frontend tests pass; E2E multi-branch scenario passes.
- Existing order-web and branch-stock features keep working; rollout flag-controlled;
  no unrelated production code changed during planning.
