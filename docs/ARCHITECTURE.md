# Architecture

> Last revised: 2026-07-22

---

## Status vs V1 original scope

The system has grown well beyond the original V1 scope. This document reflects the current live state.

| V1 assumption | Current reality |
|---|---|
| Single "branch staff submit order request" flow | Full inter-branch stock-request lifecycle (cart → review → submit → dispatch → fulfill) with server-side draft persistence |
| No auth | Cookie-based JWT sessions for staff + admin roles |
| Mock repository or single Postgres DB | Three separate Express backends, three separate Postgres databases |
| `SC-StockDay-Ordering/server` as the live API | **`PaaSRTSM-project/apps/admin-api`** is the live backend; SC `server/` is a legacy zombie |
| No AI / no ML | pgvector embeddings + hybrid SKU search + categorization tiers 0–3 + ingredient knowledge layer |
| No branch stock tracking | Per-branch stock snapshots pushed by a .NET BranchSender agent |
| No mobile | Mobile PDA (React Native) designed but not yet built |

---

## 1. Workspace map

Five repos live under `Desktop/Webapp training project/` and form one logical system.

| Repo | Role | Stack | Entry point |
|---|---|---|---|
| **PaaSRTSM-project** | **Live backend API + drug-DB admin.** Ordering, stock, ingredient ML, analytics, CRM mirror, mobile enrollment, AI video content studio. | Node CJS, Express 4, `pg`, pgvector, `mssql`, `xlsx`, bcryptjs, JWT cookie sessions | `apps/admin-api/src/server.js` |
| **SC-StockDay-Ordering** | Branch ordering SPA, admin SPA, legacy server, AdaPOS sync agent, Python OCR worker, E2E harness | npm workspaces: `apps/order-web` + `apps/admin-web` (React/Vite), `server/` (Express ESM, legacy), `apps/adapos-sync` (Node), `apps/ocr-worker` (Python) | `apps/*/main.jsx` |
| **SC-StockDay-Ordering-BranchSender** | Per-branch Windows agent that pulls stock from local AdaPOS SQL Server and pushes it to admin-api | C# .NET, Windows Task Scheduler | `src/BranchSender/Program.cs` |
| **SCCRMonPOS** | C# POS loyalty integration — CRM claims from POS terminals | C# .NET | `SCCRMonPOS/` |
| **SCAiGenVid** | AI Video Content Studio frontend — staff generate/review AI promotional video clips. Deliberately separate from `admin-web` (unrelated domain; may be published publicly). Talks to the same PaaSRTSM admin-api, same cookie-session auth. | React + Vite SPA | `src/main.jsx` |

A sixth project (`currentSC-official-website-project`) — public marketing site + CRM/loyalty backend — is in the workspace but **not part of the ordering/stock system.** Admin-api mirrors member data into it via an internal token.

---

## 2. System architecture diagram

```
Branch PCs
┌──────────────────────────────────────┐
│  BranchSender (.NET)                 │
│    ↓ POST /api/branch-stock/upload   │
│  adapos-sync agent (Node)            │
│    ↓ POST /api/sync/ada/*            │
│  ocr-worker (Python)  ─── receipts ──┼──────────────────────────┐
└──────────────────────────────────────┘                          │
                                                                  ▼
Render                                              PaaSRTSM admin-api (Express 4)
┌─────────────────────────────────────────────────────────────────────────────────┐
│  order-web SPA (static)  ──┐                                                    │
│  admin-web SPA (static)  ──┼──► VITE_API_BASE_URL ──► admin-api (cookie session)│
│  SC legacy server (web) ───┘ (points to PaaSRTSM, not SC server)              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                              ┌───────────┼────────────────┐
                              ▼           ▼                ▼
                        Postgres DB    CRM mirror    official-website backend
                        (core/ordering (internal     (Express 5 + Knex,
                        /ada/analytics  token)        separate Postgres)
                        /admin/public)
```

---

## 3. Frontend apps

### `SC-StockDay-Ordering/apps/order-web` — Branch staff stock-request app

Full React SPA with React Router, context-based auth, and server-side draft cart persistence.

**Routes:**
- `/` → redirect to `/stock`
- `/stock` — `BranchStockPage` — branch stock comparison table (read-only, see current qty per branch)
- `/cart` — `CartPage` — inter-branch stock request cart; server-side draft autosaves every 1.5 s
- `/cart/review` — `ReviewPage` — pre-submit review
- `/requests` — `MyRequestsPage` — outbound requests history (tabs: drafts / submitted)
- `/incoming` — `IncomingRequestsPage` — inbound requests (HQ/fulfilling branch view)
- `/incoming/:publicId` — `IncomingRequestDetailPage` — single request detail + fulfillment form
- `/incoming/:publicId/document` — `PackingDocumentPage` — printable packing slip

**Components:** `AppShell`, `BranchStockTable`, `CartBadge`, `ConfirmModal`, `FulfillmentForm`, `FulfillmentReport`, `NotificationBell`, `ProductRequestModal`, `RequestModeToggle`, `RequestStatusPill`

**Context / lib:** `AuthContext`, `CartContext`, `lib/api.js`, `lib/requestCart.js`, `lib/requestSubmission.js`, `lib/responseDraft.js`, `lib/requestStatus.js`

**Auth:** login form → `POST /api/auth/login` → cookie session. `VITE_FEATURE_STOCK_REQUESTS` env var gates the whole app (defaults true in frontend).

**Deploy:** Render static service `sc-stockday-order-web`, `autoDeploy: false`, `VITE_FEATURE_STOCK_REQUESTS=false` (deployed as disabled until pilot confirmed).

---

### `SC-StockDay-Ordering/apps/lookup-web` — CiPData lookup migration SPA

React SPA created to replace the old Google Apps Script `goLookup()` screen from `ClaspSCWAV2`.

**Current migration scope:**
- routed flows:
  - `/lookup`
  - `/summary`
  - `/followups`
  - `/reports`
  - `/reports/preview`
- lookup flow:
  - search encounter records by patient / phone / symptom / drug
  - branch and date filters
  - sort + pagination
  - KPI summary cards
  - encounter detail modal with medication rows
- summary flow:
  - date-range aggregation for dispensed drug quantities
- follow-up flow:
  - queue by `followup_call` date
  - local-only status marking and JSON export
- report flow:
  - report parameter form
  - print-friendly preview route instead of GAS PDF generation

**Compatibility / API pattern:**
- frontend reads `VITE_API_BASE_URL`
- frontend supports `VITE_USE_LOOKUP_MOCK=true` for local development
- this repo's `server/` is not the live shared backend, so `lookup-web` should target the shared backend namespace instead of depending on the zombie SC server

**Shared backend contract expected by this frontend:**
- `GET /api/cipdata/branches`
- `GET /api/cipdata/encounters`
- `GET /api/cipdata/encounters/:encounterId`
- `GET /api/cipdata/encounters/:encounterId/medications`
- `GET /api/cipdata/kpis`
- `GET /api/cipdata/summary`
- `GET /api/cipdata/followups`
- `GET /api/cipdata/report-preview`

**Deploy:** Render static service `sc-cipdata-lookup-web`, `autoDeploy: false`.

---

### `SC-StockDay-Ordering/apps/admin-web` — Admin/management SPA

Monolithic single-file `App.jsx`. Cookie-session auth. Admin role unlocks extra views.

**Navigation groups / views:**

| Group | View key | Description |
|---|---|---|
| Dashboard | *(disabled)* | Stock Day overview — not yet built |
| | `focus-products` | Monthly focus-product targets and live AdaPOS sales progress; all authenticated users can view, admin manages targets |
| ข้อมูลสินค้า | `receipts` (default) | Approved receipts viewer, supplier logos |
| | `branch-stock` | Wide branch-stock table (qty_000..005) |
| | `stock-requests` | Inter-branch stock requests — submit, track, filter by branch |
| | `movement-trace` | Per-product movement trace |
| | `stock-cost-audit` | *(admin only)* Cost/avg-cost by branch |
| ตรวจสอบฐานข้อมูล | `category-review` | *(admin only)* Product category review queue |
| | `ingredient-dictionary` | *(admin only)* Ingredient knowledge layer admin |
| | `sync-log` | *(admin only)* Sync run history calendar |
| | `Ingredient Mapping` | *(disabled, planned)* |
| | `Product Master` | *(disabled, planned)* |
| ลูกค้าสัมพันธ์ | `preorder` | Customer preorder cases: staff own-branch create/tracking and admin all-branch workflow, quotes, private R2 attachments, receipt/transfer evidence, ETA, and completion |

Customer preorder UI is extracted under `apps/admin-web/src/preorders/` and gated by
`VITE_FEATURE_CUSTOMER_PREORDERS` (default off). It calls only the live PaaSRTSM backend;
the legacy SC server has no preorder implementation.

Supplier logos: ~30 pharma/distributor logos as SVG/PNG assets bundled in `src/assets/`.

Code39 barcode renderer built inline (used for packing documents).

**Deploy:** Render static service `sc-stockday-ordering` (misleadingly named), `autoDeploy: true`, builds `apps/admin-web`.

---

## 4. Backend — PaaSRTSM admin-api (live)

**Entry:** `PaaSRTSM-project/apps/admin-api/src/server.js`  
**Deployed:** `https://paasrtsm-project.onrender.com`  
**Deploy note:** NO `render.yaml`. Deployment configured via Render dashboard only. GitHub push alone does NOT trigger redeploy — must click **Manual Deploy** on Render dashboard.

### Auth

- Cookie session token `{ sub, role, csrf }` (`src/auth/session.js`)
- Roles: `admin` / `staff`
- Branch identity carried in JWT `sub` (e.g. `"staff003"`) — NOT a separate branch_code claim
- Middleware: `requireAuth`, `requireRole`, `requireCsrf` in `src/auth/middleware.js`
- Users, password hashes, branch mappings live in **env strings** (redeploy to add/rotate users)

### Route files

| File | Path prefix | Notes |
|---|---|---|
| `auth.js` | `/api/auth` | Login / logout / session check |
| `me.js` | `/api/me` | Current user info |
| `ordering.js` | `/api/` | Public: `/branches`, `/products/search`, `/order-requests` — no auth required |
| `branch-stock.js` | `/api/branch-stock` | Wide snapshot table; upload from BranchSender |
| `stock-requests.js` | `/api/stock-requests` | Inter-branch request lifecycle (submit / approve / dispatch / fulfill) |
| `stock-request-drafts.js` | `/api/stock-request-draft` | Server-side draft cart: `GET/PUT/DELETE /me` |
| `products.js` | `/api/products` | Product catalog |
| `search.js` | `/api/search` | Hybrid SKU search (text + vector) |
| `enrichment.js` | `/api/enrichment` | Categorization review queue |
| `ingredient-knowledge.js` | `/api/ingredient-knowledge` | Ingredient dictionary queries |
| `ingredient-admin.js` | `/api/ingredient-admin` | Ingredient dictionary management |
| `sync.js` | `/api/sync` | Legacy-compatible simplified sync endpoints |
| `sync-ada.js` | `/api/sync/ada` | Raw AdaPOS ingestion → `ada.*` tables |
| `imports.js` | `/api/imports` | Excel/CSV product + price import |
| `reconciliation.js` | `/api/reconciliation` | Transfer reconciliation |
| `review-queue.js` | `/api/review-queue` | Category review queue |
| `members.js` | `/api/members` | CRM member lookup |
| `loyalty.js` | `/api/loyalty` | Loyalty point events |
| `mobile-enroll.js` | `/api/mobile` | QR enrollment flow for future PDA app |
| `mobile-products.js` | `/api/products/by-barcode` | PDA barcode scan endpoint (price + stock) |
| `supplier-logos.js` | `/api/supplier-logos` | Supplier logo metadata |
| `health.js` | `/api/health` | Health check |
| `auth.js (admin)` | `/api/auth` | — |
| `video-content.js` | `/api/content` | AI Video Content Studio — job CRUD/submit/retry/cancel/approve/reject, asset upload, signed download proxy. Gated by `FEATURE_VIDEO_STUDIO`. See `docs/AI_VIDEO_CONTENT_STUDIO.md`. |
| `focus-products.js` | `/api/focus-products`, `/api/admin/focus-products` | Authenticated read + admin-only CRUD for focus-product targets |
| `customer-preorders.js` | `/api/customer-preorders` | Feature-flagged authenticated customer preorder CRUD, workflow, private attachments, receipt/transfer evidence, ETA, unread/actionable counts |

### Services

| File | Role |
|---|---|
| `stockRequests.js` | Inter-branch request business logic |
| `stockRequestDrafts.js` | Server-side draft cart persistence |
| `focusProducts.js` | Focus-product validation, batched AdaPOS sales progress, four success rules, and freeze-on-read snapshots |
| `videoJobsService.js` | AI video job CRUD, submit/retry/cancel/approve/reject, role-based visibility |
| `videoAssetsService.js` | AI video asset upload finalize + download authorization |
| `videoJobRunner.js` | In-process `setTimeout`-chain poller for AI video render jobs (no separate worker) |
| `video-providers/*` | AI video provider adapter layer — `mockVideoProvider.js`, `openaiVideoProvider.js` (Sora), `providerRegistry.js` |
| `storage/*` | AI video storage adapter layer — `localDiskStorageProvider.js` (Phase 1), `storageRegistry.js` |
| `ada-derivation.js` | Refresh analytics / reconciliation from `ada.*` |
| `embedding-sync-jobs.js` | Vector embedding job queue |
| `sku-embedding-indexer.js` | pgvector upsert |
| `sku-hybrid-search.js` | Combined text + vector SKU search |
| `customerPreorders.js` | Branch-scoped case CRUD, search, read cursors, messages, detail DTOs, and counts |
| `preorderWorkflow.js` | Central optimistic state mutations, quotes, decisions, outcomes, events, and notifications |
| `preorderReceiptEvidence.js` | Explicit HQ approved-receipt allocation, immutable snapshots, coverage, and versioned ETA |
| `preorderTransferEvidence.js` | Explicit reconciliation transfer allocation, ambiguity/staleness handling, and arrival evidence |
| `storage/r2PreorderStorageProvider.js` | Private Cloudflare R2 S3-compatible storage and 300-second presigned GET URLs for preorder images |

### Categorization engine

`src/categorization/` — 4-tier rule-based product categorization (tiers 0–3), used by enrichment workflow and product review queue.

### Embeddings

`src/embeddings/provider.js` + `sku-text.js` — text construction and vector embedding for SKU search. Uses pgvector. Migrations 012, 013, 025 own this.

---

## 5. Legacy backend — SC-StockDay-Ordering/server (zombie)

The `SC-StockDay-Ordering/render.yaml` still deploys this as an active Render web service (`autoDeploy: true`, `preDeployCommand: npm run db:migrate`). It has its own `DATABASE_URL` and own migration history (001–016 SQL files + 2 overlapping numeric prefixes). But **both frontends point to PaaSRTSM**, not this server. It is effectively a zombie — auto-deploying and running migrations against a separate Postgres nobody reads.

**Key risk (H-1):** Should be documented as deliberately orphaned or decommissioned. If it's still alive, it should have `autoDeploy: false` set to prevent silent schema drift.

---

## 6. BranchSender (.NET)

Runs on each branch PC via Windows Task Scheduler.

**Services:**
- `AdaSqlExtractor` — reads `AdaAcc` SQL Server using `branch-stock.sql`
- `ExcelExtractor` — alternative extraction from Excel exports
- `PayloadBuilder` — normalizes rows into `BranchStockUploadEnvelope`
- `UploadClient` — `POST /api/branch-stock/upload` with API key
- `OutboxService` — retry/outbox pattern for failed uploads
- `FileLogger` / `SyncRunner` — orchestration + logging

**Config:** `appsettings.json` per branch (SQL Server DSN, API URL, API key, branch code).

---

## 7. Database schemas (PaaSRTSM Postgres)

Migrations are owned by `PaaSRTSM-project/`. Migration `062_add_customer_preorders.sql`
is implemented locally but is not claimed here as applied to production.

| Schema | Tables / purpose |
|---|---|
| `public` | `items`, `skus`, `barcodes`, `prices`, `sku_price_tiers`, `sku_unit_prices`, `sales_daily`, `audit_logs` — canonical product master + legacy pricing |
| `core` | `branches` — branch registry (derived from `ada.branches`) |
| `ada` | Raw evidence from AdaPOS: `sync_runs`, `sync_errors`, `branches`, `products`, `product_barcodes`, `transfer_headers/lines`, `sales_headers/lines`, `purchase_headers/lines`, `stock_adjustment_headers/lines`, `stock_snapshots`, `branch_stock_snapshots`, `branch_stock_uploads`, `branch_prices` |
| `analytics` | Derived windows: `product_stock_snapshots`, `product_sales_summary_periods`, `product_purchase_summary_periods` |
| `ordering` | `branch_order_requests`, `branch_order_request_items`, `stock_requests`, `stock_request_lines`, `stock_request_documents`, `stock_request_drafts`, `stock_request_draft_lines` |
| `reconciliation` | Source-derived: `transfer_documents/lines`, `transfer_match_candidates`, `transfer_cases/lines`. App-owned: `transfer_reconciliations/lines/events` |
| `ingest` | `sync_runs`, `sync_errors` |
| `admin` | Admin-facing audit / log tables |
| `content` | AI Video Content Studio (migration 043): `video_jobs`, `video_assets`, `video_job_events`. See `docs/AI_VIDEO_CONTENT_STUDIO.md`. |
| `focus` | `focus_products` — product/date/branch targets plus frozen month-end sales snapshots. See `docs/SESSION_2026-07-12_FOCUS_PRODUCTS_FEATURE.md`. |
| `customer_relations` | Feature-flagged preorder cases/items, immutable quotes and customer decisions, messages/read cursors/events/notifications, private R2 attachment metadata, procurement outcomes, receipt/transfer evidence snapshots, branch delivery schedules, and versioned ETA projections (migration 062; rollout pending) |

**Pricing (migration 039):** `ada.branch_prices` stores per-branch retail/cost prices synced from AdaPOS. Canonical selling price is `public.sku_unit_prices.retail_price` (per sku + unit + is_active). `public.prices` is written in parallel but `sku_unit_prices` is authoritative.

**Draft cart (migration 040):** `ordering.stock_request_drafts` (one active draft per username+branch) + `ordering.stock_request_draft_lines`. `owner_username TEXT` is the identity key; `owner_user_id bigint` is left NULL (JWT `sub` is a string username, not a bigint).

**Migration hazard:** Two `020_` prefixed files exist in PaaSRTSM (`020_add_admin_receipt_staging.sql` and `020_add_product_category_states.sql`). Migrator ordering must be verified.

---

## 8. Key features — current state

### Inter-branch stock requests (migrations 033–040)

Full lifecycle: **cart draft → review → submit → approve → dispatch → fulfill/reject**.

- Staff logs into order-web → browses branch-stock table → adds items to cart
- Cart autosaves to server as `ordering.stock_request_drafts` every 1.5 s (survives refresh)
- Submit → `ordering.stock_requests` + `ordering.stock_request_lines` (status: `PENDING`)
- HQ/admin approves → `APPROVED`, dispatch mode `FULL`/`PARTIAL`/`CANNOT`
- Dispatch generates `ordering.stock_request_documents` (packing slip; Code39 barcode inline)
- Receiving branch fulfills → status `FULFILLED`
- Admin-web `stock-requests` view shows full history with branch filter

### Branch stock snapshots

Wide table `ada.branch_stock_snapshots` (PK `product_code`, columns `qty_branch_000..005`, `cost_avg_branch_000..005`, `synced_at`). BranchSender agent pushes from each branch's local SQL Server. Admin-web `branch-stock` view renders this as a comparison table.

**Risk:** Every new branch requires a schema migration + code change. Planned long-term fix: normalize to a narrow table behind a view.

### Ingredient knowledge layer (migration 031)

Batch-seeded Thai ingredient dictionary (16 batches, batch 6 = soap/cleanser ~23 synonyms → สบู่, ~67 products). Used for admin product categorization and the ingredient-dictionary view. Backfill script: `backfill_product_ingredient_proposals.js`.

### Product categorization / enrichment

4-tier rule engine (tier 0–3) + pgvector embeddings. Category review queue in admin-web. `apply_enrichment_rules.js` batch applies rules. `backfill_sku_embeddings.js` / `sync_sku_embeddings.js` maintain vector index.

### Focus products (migrations 045, 046, 051, 053, 054)

Admin defines product sales targets for a date range in four categories: salesperson (combined target), pharmacist and store manager (independent branch verdicts), and group manager (all relevant branches must pass). Each target can be saved as a private draft, published immediately, or scheduled for automatic visibility. Progress is computed from paid AdaPOS sales and freezes on the first read after the period ends. The frontend lives in `apps/admin-web/src/FocusProductsPanel.jsx`; the live service and schema live in the sibling `PaaSRTSM-project`. Detailed behavior, schema, caveats, and development context: [SESSION_2026-07-12_FOCUS_PRODUCTS_FEATURE.md](SESSION_2026-07-12_FOCUS_PRODUCTS_FEATURE.md).

### Mobile enrollment (migration 038, backend done, no UI yet)

QR-code based device enrollment for future PDA app. `bootstrap_enroll_code.js` generates QR. `mobile-enroll.js` route validates enrollment and issues a 24-hour narrow branch token. `mobile-products.js` route exposes `GET /api/products/by-barcode/:barcode` for PDA scans.

### Ada derivation pipeline

Three scripts derive analytics from raw `ada.*` evidence:
- `npm run derive:ada-foundations` → `core.branches`, `public.items/skus/barcodes`
- `npm run derive:ada-analytics:standard` → stock snapshots + 7d/30d/90d sales/purchase windows
- `npm run derive:ada-reconciliation` → transfer documents, match candidates, reconciliation cases

---

## 9. Testing

### Unit / integration tests (PaaSRTSM)

`node --test` + supertest. ~38 test files, ~200 tests as of 2026-06-25.

Key test files: `stock_requests_api`, `stock_request_drafts_api`, `branch_stock_routes`, `branch_auth`, `mobile_enroll_api`, `mobile_products_api`, `ingredient_knowledge`, `price_update_modes`, `enrichment_rules`, `sku_hybrid_search_query`.

### E2E tests (SC-StockDay-Ordering/e2e/)

Playwright (`@playwright/test`). Separate `e2e/package.json`. Uses a temp Postgres cluster on port 55432 with curated migrations. Smoke test passes; lifecycle test (submitCart SRQ locator) was open as of 2026-06-18.

Config: `playwright.config.cjs`, `global-setup.cjs`, `global-teardown.cjs`, `helpers.cjs`, `db.cjs`.

### Frontend tests (order-web)

Vitest unit tests co-located: `lib/requestCart.test.js`, `lib/requestSubmission.test.js`, `lib/responseDraft.test.js`.

---

## 10. Deployment

| Service | Repo | Platform | Auto-deploy |
|---|---|---|---|
| `sc-stockday-order-web` (static) | — | — | **NO SUCH SERVICE.** Verified 2026-07-21: no reachable Render service by this name, any state. `apps/order-web` has no known deployment. See open question below. |
| `sc-cipdata-lookup-web` (static) | **`sc-cipdata-lookup-web` (separate repo)** | Render static | Live as `srv-d8uf1emq1p3s73bi6180`, manual/standalone — **built from its own repo, NOT from this one.** The block in this repo's `render.yaml` is dead config. |
| `sc-stockday-ordering` (admin-web static) | SC-StockDay-Ordering | Render static | **Yes** (`autoDeploy: true`) — **dashboard-created, NOT in `render.yaml`** (`srv-d87t9sjeo5us738ldfu0`, root `apps/admin-web`, URL `sc-stockday-ordering.onrender.com`) |
| `paasrtsm-project` (admin-api) | PaaSRTSM-project | Render web | **Manual only** (no render.yaml) |
| `sc-ai-gen-vid` (static, planned) | SCAiGenVid | Render static | New service — not yet deployed. `render.yaml` in the repo, `VITE_API_BASE_URL` → `paasrtsm-project.onrender.com`. |

**Note on `render.yaml` — it is dead config (verified 2026-07-21):** The repo-root `render.yaml` is **not** the source of truth for anything currently deployed. **No Render Blueprint is connected to this repo** (the workspace's only Blueprint Instance is `exs-d94a0ekvikkc73butoh0`, bound to `AKCD1998/ClaspSCxSeamless`), so nothing consumes this file — its `autoDeploy` values are inert. All three of its declared services were checked:

- `sc-stockday-ordering` (`type: web`, node) — **does not exist** in any reachable workspace, in any state (active, suspended, preview). Either never provisioned or deleted with no trace; Render's API exposes no deletion history. **Removed from `render.yaml`.**
- `sc-cipdata-lookup-web` — a live service by this name exists (`srv-d8uf1emq1p3s73bi6180`) but is built from its **own separate repo**, not this one. The block here is dead.
- `sc-stockday-order-web` — **no reachable service exists at all.**

Every live service is manual/standalone, created in the Render dashboard. The live admin site is not represented in this file.

**Open question:** if `apps/order-web` has no Render service, where (if anywhere) are branch staff actually loading the order app from? Unresolved as of 2026-07-21.

**Critical:** After every push to PaaSRTSM-project, a **Manual Deploy must be triggered** from the Render dashboard. GitHub push alone does not deploy. This applies to the new `content.*` video-studio backend code too — merging it does not activate it; `FEATURE_VIDEO_STUDIO=true` must also be set as a Render env var, and a Manual Deploy triggered.

---

## 11. Known issues / technical debt

| ID | Severity | Problem | Status |
|---|---|---|---|
| C-1 | Critical | Audit write failures (`audit_logs` INSERT) can crash admin-api with uncaught error | Migration 035 fixed symptom; root risk (unguarded write in critical path) still open |
| H-1 | High | SC `server/` auto-deploys migrations against its own Postgres; frontends don't use it | Open — should set `autoDeploy: false` or decommission |
| H-2 | High | Duplicate migration numeric prefixes (two `020_` in PaaSRTSM) | Open |
| H-3 | High | CORS `setHeader` 4-arg bug in admin-api server.js — `X-API-Key` not actually set | Open |
| H-4 | High | `CORS_ALLOW_ALL + credentials` — any origin gets cookies if misconfigured | Confirm prod sets explicit `CORS_ALLOWED_ORIGINS` |
| M-1 | Medium | Two stock uploaders (BranchSender + adapos-sync) write same row — last-writer-wins | Confirm one writer per branch |
| M-2 | Medium | Wide `qty_branch_000..005` schema — every new branch = migration + code change | Known; plan a narrow table behind a view |
| M-3 | Medium | Users/auth encoded in env strings — adding a user requires redeploy | Acceptable now; needs DB-backed users table as branches grow |

---

## 12. What is designed but not yet built

### Mobile PDA app (React Native)

Design doc: [docs/architecture-assessment-and-mobile-pda-design.md](architecture-assessment-and-mobile-pda-design.md)

- **Stack:** React Native (new separate repo `SC-StockDay-PDA`, not in this workspace yet)
- **Auth:** QR enrollment (backend complete, migration 038) → 24-hour narrow branch token
- **Phase 1 feature:** scan barcode → `GET /api/products/by-barcode/:barcode` → show name, retail price, per-branch stock, cost (Manager-only)
- **Phase 3 planned:** expiry tracking via Model B (periodic survey snapshot, not lot-level tracking)
- **Pending decisions:** 24h credential bound to device vs person-lite; authority matrix for cost/margin visibility

### Stock Day dashboard

`admin-web` navigation shows a "Dashboard" group with "ภาพรวม Stock Day" item — currently disabled. The KPI formulas (stock day, turnover, ADU) were defined in V1 and are computed in backend derivation scripts but the dashboard UI has not been built.

### AdaPOS write-back (Phase 0 evidence still required)

Planning doc: [docs/adasoft/project_adapos_writeback_implement_spec.md](adasoft/project_adapos_writeback_implement_spec.md)

Branch-local writer agent that creates Type 4/7 transfer documents in AdaPOS. Requires Phase 0 evidence gathering before any code is written.

---

## 13. Core data formulas (still accurate from V1)

- `Average Daily Usage = sold_qty_period / period_days`
- `Stock Day = current_stock / average_daily_usage`
- `Ending Stock = starting_stock + purchased_qty - sold_qty`
- `Average Inventory = (starting_stock + ending_stock) / 2`
- `Turnover Rate = sold_qty / average_inventory`

---

## 14. Confirmed AdaPOS source tables

- Product master: `TCNMPdt`
- Sales: `TPSTSalHD`, `TPSTSalDT`
- Purchase/order-in: `TACTPiHD`, `TACTPiDT`
- Transfer out: `doc_type = 4`
- Transfer in: `doc_type = 7`

Known exclusions: `TCNTPdtReqHD/DT` (not used), `TACTPoHD/DT` (not used), `TCNMPdtBar` (empty), `TCNMRateUnit` (currency rounding only).
