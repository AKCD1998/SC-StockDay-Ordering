# Customer Preorder / Price Inquiry — System Design

> Status: design and implementation plan only; no production code is introduced by this document.  
> Last inspected: 2026-07-22  
> Target surfaces: `SC-StockDay-Ordering/apps/admin-web` and the live backend in sibling repo `PaaSRTSM-project/apps/admin-api`.

---

## 1. Decision summary

Build the feature as a new **Customer Preorder** domain, not as another mode of
`ordering.stock_requests`.

The feature will:

- live in the existing `ลูกค้าสัมพันธ์ → พรีออเดอร์` view in `admin-web`;
- use the live PaaSRTSM admin API and production Postgres, never the legacy
  `SC-StockDay-Ordering/server`;
- let `staff` create and track cases for their effective branch only;
- let `admin` see and operate on cases from all branches;
- support both `PRICE_INQUIRY` and `ORDER_REQUEST`;
- support catalog items selected through `@` autocomplete and genuinely new free-form
  items with up to three raster images per case;
- store those images in a private Cloudflare R2 bucket through the backend only;
- expose admin-read state, structured quotes, customer decisions, procurement outcomes,
  conversation, and an immutable event timeline;
- link to approved HQ purchase receipts and transfer evidence without writing to AdaAcc;
- estimate branch arrival dates from configurable delivery schedules and clearly label the
  estimate and source-data timestamp.

Reuse the existing patterns, not the existing stock-request rows:

- cookie/JWT authentication, CSRF, and `effectiveBranchCode`;
- admin-vs-branch authorization patterns;
- optimistic versions and idempotency keys;
- append-only domain events;
- polling badges;
- receipt and transfer read models.

---

## 2. Repository facts that constrain the design

### 2.1 Authoritative code locations

| Concern | Authoritative location |
|---|---|
| Staff/admin UI | `SC-StockDay-Ordering/apps/admin-web` |
| Live API | `PaaSRTSM-project/apps/admin-api` |
| Production migrations | `PaaSRTSM-project/migrations` |
| Product catalog | `public.skus`, `public.items`, `public.barcodes` |
| HQ purchase receipts | `ada.approved_receipt_headers/lines` |
| Raw transfer evidence | `ada.transfer_headers/lines` |
| Derived transfer cases | `reconciliation.transfer_cases/transfer_case_lines` |
| Legacy API, not to use | `SC-StockDay-Ordering/server` |

The old `docs/adasoft/project_scstockday_transfer_design.md` contains useful workflow
principles but points to the legacy server and obsolete auth state. It is not an
implementation source of truth.

### 2.2 Existing UI foothold

`admin-web/src/App.jsx` already has:

- a `ลูกค้าสัมพันธ์` navigation group;
- a `preorder` view;
- a placeholder panel matching the screenshots supplied for this task;
- login/session handling for `admin` and `staff`;
- effective branch context for users such as `staff003`;
- established light/dark themes, panels, tables, pills, modals, and responsive rules.

The new feature should be extracted into dedicated components. Do not add another large
feature implementation directly inside the already-monolithic `App.jsx`.

### 2.3 Existing integrations and their limits

- `GET /api/products/search` already searches product code, display name, and barcode,
  but it is a general/public legacy-compatible endpoint. Add an authenticated preorder
  suggestion endpoint with deterministic ranking and a small response contract.
- Approved receipts are supplier purchase receipts owned mainly by HQ branch `000`.
  They are not branch deliveries and are not proof that a specific customer case is
  fulfilled until an admin links the receipt line.
- Transfer reconciliation is read-only evidence derived from AdaPOS Type 4 and Type 7
  documents. It may lag and must show `source_synced_at`.
- AdaAcc remains read-only. This feature must never insert, update, delete, or execute
  anything in AdaAcc.
- The current video storage provider is local-disk-only and intentionally non-durable on
  Render. Customer images must not be put in `content.video_assets` or the current local
  video folder. This feature uses its own private Cloudflare R2 object namespace.

---

## 3. Product vocabulary

| Term | Meaning |
|---|---|
| Case | One customer inquiry/order tracked from branch submission to closure |
| Catalog item | A product matched to an existing `public.skus` row |
| Free-form item | A product not currently in the product master; original text/images are preserved |
| Quote | Versioned price response from purchasing/admin |
| Customer decision | Staff-recorded accept/decline result after contacting the customer |
| Procurement outcome | Ordered, unavailable, discontinued, or another admin result |
| External evidence | A linked approved receipt or transfer document/case from read-only Ada data |
| ETA | Approximate branch arrival date with an explicit basis and confidence |

Recommended public case number:

```text
PRE-YYYYMMDD-BBB-NNNN
```

Example: `PRE-20260722-003-0007`.

The database primary key remains numeric. The public ID is used in UI, URLs, audit, and
support conversations.

---

## 4. Scope

### 4.1 In scope for the first production-ready release

- Staff creation form with customer phone, customer name, items, quantities, optional
  note, up to three images, and inquiry/order intent.
- `@` catalog autocomplete by IC code, barcode/630-style code, Thai name, English/generic
  name, and partial text.
- Mixed item list: selected catalog rows and free-form rows in one case.
- Staff own-branch table and admin all-branch queue.
- Admin first-read timestamp visible to staff.
- Threaded text replies and a unified activity timeline.
- Structured multi-line quote and customer accept/decline with final quantities.
- Ordered/unavailable outcomes with extensible reason codes.
- Approved-receipt candidate suggestions and explicit linking.
- Transfer candidate suggestions and explicit linking.
- Private Cloudflare R2 image storage with backend validation and short-lived authorized
  download URLs.
- Configurable branch delivery schedules and explainable ETA.
- Notification badges, filters, pagination, audit, optimistic concurrency, and tests.
- Responsive dark/light UI consistent with the existing site.

### 4.2 Explicitly out of scope

- Writing to AdaAcc or automatically creating Type 4/7 documents.
- Automatically deciding that a receipt/transfer belongs to a customer from name
  similarity alone.
- Customer-facing portal, LINE message sending, payments, deposits, refunds, or delivery
  addresses.
- Creating a new canonical SKU from a free-form item. Admin may match the item to an
  existing SKU later; product-master creation remains a separate controlled workflow.
- Promise-grade delivery dates. ETA is operational guidance, not a guaranteed date.
- Replacing the existing inter-branch stock-request workflow.

---

## 5. User journeys

### 5.1 Staff creates a case

1. Staff opens `ลูกค้าสัมพันธ์ → พรีออเดอร์`.
2. The page derives branch from the authenticated session. Staff cannot choose or submit
   another branch.
3. Staff enters customer phone and name.
4. In the product composer, typing `@IC-xxxxx`, `@630xxxx`, `@ชื่อไทย`, or an English
   name opens ranked suggestions.
5. Selecting a catalog result adds a row with product snapshot, unit, and quantity
   stepper. The same product+unit merges instead of duplicating.
6. If no product is suitable, staff chooses `สินค้านอกระบบ`, writes a detailed request,
   and may attach images. The page shows previews and remaining slots out of three.
7. Staff chooses `สอบถามราคา` or `สั่งสินค้า`, reviews the summary, and submits once.
8. The case appears immediately in the staff table with `รอแอดมินเปิดอ่าน` or
   `ฝ่ายจัดซื้อกำลังดำเนินการ` as appropriate.

### 5.2 Admin reads and answers a price inquiry

1. Admin sees the case in an all-branch queue and a badge derived from actionable work.
2. Opening detail calls an explicit read endpoint. The first successful admin read is
   recorded; list prefetch must not mark a case read.
3. Admin may match a free-form item to an existing SKU while preserving original text and
   images.
4. Admin publishes a versioned quote with unit price, offered quantity, validity, and
   note.
5. Staff is notified and the case becomes `WAITING_CUSTOMER_DECISION`.
6. Staff contacts the customer and records:
   - accept, with final quantity per item; or
   - decline, with an optional reason.
7. Accept moves the case to `PROCUREMENT_PENDING`; decline closes it as
   `CUSTOMER_DECLINED`.

### 5.3 Admin handles a direct order

1. A submitted `ORDER_REQUEST` begins in `PROCUREMENT_PENDING` while still retaining an
   independent admin-read marker.
2. Admin either:
   - marks `ORDERED` with optional supplier reference/note; or
   - marks `UNAVAILABLE` with reason code and required explanation when `OTHER`.
3. Staff sees the result and time without seeing supplier cost or admin-only notes.

### 5.4 Fulfillment and delivery evidence

1. After `ORDERED`, admin opens receipt candidates generated from exact catalog product
   codes and an appropriate date window.
2. Admin explicitly links the correct HQ approved receipt line and allocates its quantity
   to a preorder item. The system snapshots the evidence and prevents the same source
   quantity from being allocated twice.
3. The case advances to `RECEIVED_AT_HQ` only when every required item quantity is covered.
   Partial coverage remains visible as progress while the case stays `ORDERED`.
4. The ETA engine calculates the next configured delivery day for the destination branch.
5. If a matching transfer later appears, admin links it. Type 4/outbound evidence advances
   to `IN_TRANSIT_TO_BRANCH`; a processed Type 7/inbound match may advance to
   `ARRIVED_AT_BRANCH`.
6. Staff may also confirm actual physical arrival at their own branch. Manual confirmation
   is an event and never overwrites raw Ada evidence.
7. Staff marks `CUSTOMER_NOTIFIED`, then `COMPLETED` when the case is actually finished.

### 5.5 Unavailable/closed flow

Admin may close an open case as `UNAVAILABLE` using an active reason code such as:

- `SUPPLIER_OUT_OF_STOCK`
- `DISCONTINUED`
- `NOT_FOUND`
- `MINIMUM_ORDER_NOT_MET`
- `REGULATORY_OR_POLICY`
- `OTHER`

Reason codes live in a table so more can be added without changing a status CHECK.
Reopen is admin-only and requires a note; it appends an event rather than erasing history.

---

## 6. State model

### 6.1 Case statuses

```text
SUBMITTED
IN_REVIEW
NEEDS_INFO
WAITING_CUSTOMER_DECISION
PROCUREMENT_PENDING
ORDERED
RECEIVED_AT_HQ
IN_TRANSIT_TO_BRANCH
ARRIVED_AT_BRANCH
CUSTOMER_NOTIFIED
COMPLETED
CUSTOMER_DECLINED
UNAVAILABLE
CANCELLED
```

`first_admin_viewed_at` is deliberately separate from status. “Admin read it” and “the
business state changed” are different facts.

### 6.2 Allowed transitions

| From | Action | Actor | To |
|---|---|---|---|
| New | Submit price inquiry | staff own branch | `SUBMITTED` |
| New | Submit direct order | staff own branch | `PROCUREMENT_PENDING` |
| `SUBMITTED`/`PROCUREMENT_PENDING` | Open detail | admin | same status + first-read event |
| `SUBMITTED` | Start review | admin | `IN_REVIEW` |
| `SUBMITTED`/`IN_REVIEW`/`PROCUREMENT_PENDING` | Request more info | admin | `NEEDS_INFO` |
| `NEEDS_INFO` | Reply with requested info | staff own branch | previous actionable state |
| `SUBMITTED`/`IN_REVIEW` | Publish quote | admin | `WAITING_CUSTOMER_DECISION` |
| `WAITING_CUSTOMER_DECISION` | Customer accepts + quantities | staff own branch | `PROCUREMENT_PENDING` |
| `WAITING_CUSTOMER_DECISION` | Customer declines | staff own branch | `CUSTOMER_DECLINED` |
| `PROCUREMENT_PENDING` | Mark ordered | admin | `ORDERED` |
| Any open pre-fulfillment state | Mark unavailable | admin | `UNAVAILABLE` |
| `ORDERED` | Link verified HQ receipt | admin | `RECEIVED_AT_HQ` |
| `RECEIVED_AT_HQ` | Link outbound transfer / confirm dispatch | admin | `IN_TRANSIT_TO_BRANCH` |
| `RECEIVED_AT_HQ`/`IN_TRANSIT_TO_BRANCH` | Confirm branch arrival | staff own branch or admin | `ARRIVED_AT_BRANCH` |
| `ARRIVED_AT_BRANCH` | Record customer notified | staff own branch | `CUSTOMER_NOTIFIED` |
| `CUSTOMER_NOTIFIED` | Complete | staff own branch or admin | `COMPLETED` |
| Early open states | Customer cancels | staff own branch | `CANCELLED` |
| Terminal case | Reopen with reason | admin | server-selected valid prior state |

Every mutation requires `expectedVersion`; stale clients receive HTTP 409 with the current
summary. Transitions, events, notifications, and structured side records are committed in
one transaction.

### 6.3 Display status

The table should use plain Thai labels, for example:

| Internal | Staff-facing label |
|---|---|
| `SUBMITTED` | รอฝ่ายจัดซื้อเปิดอ่าน |
| `WAITING_CUSTOMER_DECISION` | แจ้งราคาแล้ว · รอคำตอบลูกค้า |
| `PROCUREMENT_PENDING` | รอฝ่ายจัดซื้อดำเนินการ |
| `ORDERED` | สั่งสินค้าแล้ว |
| `RECEIVED_AT_HQ` | สำนักงานรับสินค้าแล้ว |
| `IN_TRANSIT_TO_BRANCH` | อยู่ระหว่างส่งมาสาขา |
| `ARRIVED_AT_BRANCH` | สินค้าถึงสาขาแล้ว |
| `UNAVAILABLE` | ไม่สามารถจัดหาได้ |

Do not expose raw enum strings as the primary UI copy.

---

## 7. Data model

Create a new schema, `customer_relations`. Do not add customer fields to
`ordering.stock_requests`.

All migrations must follow `PaaSRTSM-project/AGENTS.md`: fetch first, select the next
number from local and `origin/main`, make migrations safely re-runnable, and never run the
Windows migration runner against production when path separators differ.

### 7.1 `customer_relations.preorder_cases`

Core fields:

- `case_id bigserial PRIMARY KEY`
- `public_id text UNIQUE NOT NULL`
- `branch_code text NOT NULL REFERENCES core.branches(branch_code)`
- `intent text CHECK (intent IN ('PRICE_INQUIRY','ORDER_REQUEST'))`
- `status text` constrained to the state set above
- `customer_name text NOT NULL`
- `customer_phone text NOT NULL`
- `customer_phone_normalized text NOT NULL`
- `customer_phone_last4 text NOT NULL`
- `staff_note text`
- `created_by text NOT NULL`
- `assigned_admin_user text NULL`
- `first_admin_viewed_at/by`
- `last_activity_at timestamptz NOT NULL`
- `version integer NOT NULL DEFAULT 1`
- `idempotency_key text UNIQUE NOT NULL`
- close/reopen metadata and timestamps

Privacy rules:

- list APIs return masked phone only;
- full phone/name are returned only from an authorized detail endpoint;
- never include phone/name in console logs, generic audit metadata, idempotency logs, or
  error messages;
- search by phone is normalized and branch/role scoped before results are returned;
- define a retention/encryption follow-up before broad rollout if the pilot volume grows.

### 7.2 `customer_relations.preorder_items`

- `item_id`, `case_id`, `position`
- `item_kind`: `CATALOG` or `FREEFORM`
- nullable `sku_id REFERENCES public.skus(sku_id)`
- immutable snapshots: product code, display name, generic/English name, barcode, unit
- `original_description` for free-form requests
- `requested_qty numeric(14,4) CHECK (> 0)`
- `confirmed_qty numeric(14,4) NULL`
- optional admin matching metadata (`matched_sku_id`, `matched_by`, `matched_at`)

Constraints enforce that catalog items have a SKU and free-form items have a meaningful
description. Matching later never deletes or overwrites the original request.

### 7.3 Quotes and customer decisions

`preorder_quotes` and `preorder_quote_lines` store immutable quote versions. A new quote
supersedes the prior one; published rows are never edited.

`preorder_customer_decisions` and decision lines store accept/decline plus final quantity.
This makes “customer accepted 2 after being quoted 3” auditable.

### 7.4 Conversation and reads

`preorder_messages` stores staff/admin text messages with author role/branch and timestamp.
It supports `PUBLIC` messages visible to both sides and `ADMIN_INTERNAL` notes visible only
to admin.

`preorder_read_cursors` is keyed by `(case_id, user_id)` and stores the last read activity
sequence. It drives per-user unread badges. `first_admin_viewed_at` on the case drives the
staff-facing read receipt.

### 7.5 Attachments

`preorder_attachments` stores:

- case and optional item/message parent;
- original filename, MIME, size, SHA-256 checksum;
- `storage_provider = 'R2'`, private bucket name/alias, and opaque object key;
- R2 ETag/version metadata and upload state;
- creator and timestamp.

Cloudflare R2 is the byte store; PostgreSQL stores metadata and authorization relationships
only. Enforce:

- at most 3 images total per case;
- JPEG, PNG, or WebP only; no SVG;
- 5 MB per file and 15 MB total per case;
- validate file signatures, not only the browser-provided MIME;
- keep the bucket private and never persist a public object URL;
- `X-Content-Type-Options: nosniff`, private caching, and authorized short-lived reads.

Recommended object key:

```text
customer-preorders/{environment}/{branchCode}/{casePublicId}/{attachmentPublicId}.{ext}
```

Do not put customer name, phone, original filename, or free-form product text in the key
or R2 object metadata.

### 7.6 Cloudflare R2 integration

Install these packages in `PaaSRTSM-project`:

```text
@aws-sdk/client-s3
@aws-sdk/s3-request-presigner
```

The live backend is CommonJS, so implementation should use `require(...)`, even though
many R2 examples use ESM `import`.

Backend-only environment contract:

```env
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=https://<account-or-jurisdiction-endpoint>.r2.cloudflarestorage.com
R2_BUCKET_NAME=sc-stockdays-images
R2_REGION=auto
R2_SIGNED_URL_TTL_SECONDS=300
```

`CLOUDFLARE_API_TOKEN` and Account ID are not needed by the S3 client when the Access Key,
Secret Access Key, and endpoint are already provided. Never create `VITE_R2_*` variables or
return these credentials to the browser.

Add a dedicated R2 provider under the live backend storage services with operations:

- `putObject`
- `headObject`
- `deleteObject`
- `createSignedGetUrl`

Do not change video-studio storage behavior while adding it. Either add a new provider
used by preorder attachments or generalize the interface behind tests without replacing
the active local video provider.

Selected upload flow:

1. Browser sends multipart data to the authenticated Express preorder endpoint.
2. Express limits file count/bytes in memory, validates MIME and magic bytes, computes
   SHA-256, and generates opaque object keys.
3. Service reserves the idempotent case/upload in PostgreSQL as pending.
4. Backend uploads each validated object to the private R2 bucket using `PutObject`.
5. A final transaction marks attachments ready, activates the case/message, and writes
   events/notifications.
6. On partial failure, delete successfully uploaded objects best-effort and retain a
   retryable/cleanup record. A scheduled cleanup removes abandoned pending uploads and R2
   orphans.

This is an operational two-phase workflow; do not claim a distributed transaction across
PostgreSQL and R2. Normal list/detail APIs expose only fully finalized cases/messages.

Selected read flow:

1. Authorized client requests an attachment URL from the API.
2. Backend authorizes via the parent case and issues a short-lived presigned `GetObject`
   URL (default 300 seconds).
3. Browser loads the private object with that temporary URL.

The R2 bucket remains private. Direct browser `PutObject` and public custom-domain URLs are
not part of v1, so R2 upload CORS is not required for the selected flow.

### 7.7 Events, reasons, and external links

- `preorder_events`: append-only workflow/activity events, actor, branch, request ID,
  non-PII metadata, note, and timestamp.
- `preorder_reason_codes`: extensible active reason codes for unavailable/cancel/reopen.
- `preorder_external_links`: explicit links to `HQ_APPROVED_RECEIPT`, `TRANSFER_DOCUMENT`,
  or `TRANSFER_CASE`, including stable source keys and an immutable evidence snapshot.
  Include item allocation rows (`item_id`, `allocated_qty`, source unit/base quantity) so
  multiple receipts/transfers can cover one case without double-counting. Do not add
  foreign keys to derived transfer rows that are deleted/rebuilt.
- `preorder_eta_projections`: versioned ETA, basis, confidence, source link, calculation
  time, and optional admin override.
- `branch_delivery_schedules`: branch, ISO weekday, timezone, optional cutoff, effective
  dates, and active flag.

Seed schedules:

| Branch | ISO weekdays | Human schedule |
|---|---|---|
| `001` | 1, 3, 5 | Monday, Wednesday, Friday |
| `003` | 1, 3, 5 | Monday, Wednesday, Friday |
| `004` | 1, 3, 5 | Monday, Wednesday, Friday |
| `005` | 2, 4, 6 | Tuesday, Thursday, Saturday |

Timezone is `Asia/Bangkok`. Until a dispatch cutoff is confirmed, use the conservative
rule: choose the first scheduled day strictly after HQ receipt. Admin can override with a
note. The UI must say `ประมาณ` and show the calculation basis.

---

## 8. API design

Mount under `/api/customer-preorders`. All routes require auth; mutations also require
CSRF. Backend feature flag: `FEATURE_CUSTOMER_PREORDERS`, default false.

### 8.1 Search and list

- `GET /product-suggestions?q=&limit=`
  - strips a leading `@`;
  - exact product code/barcode first, then prefix, then substring/name;
  - searches available canonical Thai/display/generic fields;
  - returns at most 8–10 compact rows.
- `GET /cases?status=&intent=&branch=&search=&page=&pageSize=&actionable=`
  - staff: server ignores arbitrary branch and scopes to `effectiveBranchCode`;
  - admin: all branches, optional branch filter;
  - list DTO masks phone and omits images/internal notes.
- `GET /cases/:publicId`
  - authorized detail with items, public messages, quotes, decisions, evidence, ETA, and
    timeline;
  - admin additionally receives internal notes and candidate actions.
- `POST /cases/:publicId/read`
  - explicit, idempotent read cursor update;
  - first admin open records the staff-visible admin-read timestamp.
- `GET /unread-count`
  - per-user unread plus actionable count; badge behavior is defined by work, not only by
    notification rows.

### 8.2 Create and conversation

- `POST /cases` as `multipart/form-data`
  - `payload` JSON containing idempotency key, customer data, intent, items, note;
  - `images` with 0–3 files;
  - validates, reserves, uploads to R2, then finalizes case/items/images/events using the
    two-phase flow in section 7.6;
  - duplicate idempotency replay resumes or returns the same case without duplicate R2
    objects.
- `POST /cases/:publicId/messages` as multipart
  - text plus any remaining image slots;
  - admin may select `ADMIN_INTERNAL`; staff cannot.
- `POST /cases/:publicId/items/:itemId/match-sku` admin only.

### 8.3 Structured actions

- `POST /cases/:publicId/start-review` admin
- `POST /cases/:publicId/request-info` admin
- `POST /cases/:publicId/quotes` admin; versioned quote + lines
- `POST /cases/:publicId/customer-decision` staff own branch; accept/decline + quantities
- `POST /cases/:publicId/mark-ordered` admin
- `POST /cases/:publicId/mark-unavailable` admin
- `POST /cases/:publicId/confirm-branch-arrival` staff own branch or admin
- `POST /cases/:publicId/customer-notified` staff own branch
- `POST /cases/:publicId/complete` staff own branch or admin
- `POST /cases/:publicId/cancel` allowed actor depends on current state
- `POST /cases/:publicId/reopen` admin with required note

Each action carries `expectedVersion`. Keep transition logic in one service-level map, not
duplicated across route handlers and React.

### 8.4 Evidence and ETA

- `GET /cases/:publicId/receipt-candidates` admin only
- `POST /cases/:publicId/external-links/receipt` admin only
- `GET /cases/:publicId/transfer-candidates` admin only
- `POST /cases/:publicId/external-links/transfer` admin only
- `DELETE /cases/:publicId/external-links/:linkId` admin only, with reason and event
- `POST /cases/:publicId/eta-override` admin only

Candidate endpoints use exact product codes and sensible date/branch windows. They may
rank suggestions but must never persist a link automatically. Link requests include item
and allocated quantity; the service locks the source allocation set and rejects
over-allocation. If source and preorder units cannot be proven equivalent through existing
unit/factor data, require an admin-entered allocation and note instead of silently
converting.

### 8.5 Attachment binary

- `GET /attachments/:attachmentId/download-url`
  - authorizes through the parent case;
  - returns a short-lived presigned R2 `GetObject` URL and expiry;
  - never returns credentials, a permanent public URL, or a filesystem path.
- `DELETE /cases/:publicId/attachments/:attachmentId`
  - allowed only while the owning draft/message is editable;
  - records deletion intent, removes the R2 object, then finalizes metadata; cleanup can
    retry a failed object deletion.

---

## 9. Receipt and transfer integration

### 9.1 HQ approved receipts

Candidate query uses `ada.approved_receipt_headers` and
`ada.approved_receipt_lines`:

- exact catalog `product_code` match;
- HQ-owned receipts (`core.branches.is_hq = true`);
- document date at or after the procurement/order window;
- show doc number, supplier label, quantity, unit, lot/expiry when present, doc timestamp,
  and `source_synced_at`.

An admin selection stores the composite source identity (`doc_no`, `seq_no`, owner branch),
an immutable snapshot, and an allocation to a specific preorder item. It is explicit,
non-overallocated coverage—not product-code coincidence alone—that advances the case to
`RECEIVED_AT_HQ`. For a multi-item case, all required quantities must be covered. A
free-form item must first be matched to a SKU or use a manual evidence override with an
admin reason. Partial coverage is displayed but does not claim that the full case is at HQ.

### 9.2 Inter-branch transfer evidence

Candidate query uses the derived reconciliation model where possible:

- case destination = preorder branch;
- exact linked catalog product code;
- transfer date after the relevant receipt/order;
- Type 4 outbound and its Type 7 match/status;
- source sync timestamp and ambiguity flags.

Store a stable `case_key` and/or raw source document composite key, plus an evidence
snapshot. Because derivations refresh by delete/reinsert, links must not have FKs to those
rows.

Never present an ambiguous transfer match as confirmed arrival. Show it as
`ต้องตรวจสอบเอกสารโอน` until admin links the correct evidence or branch staff confirms
physical arrival.

### 9.3 Source lag

Ada transfer data may lag by 1–8+ days, and HQ approved receipts arrive according to the
sync schedule. Every evidence card must show `ข้อมูลล่าสุดเมื่อ ...`. Manual staff arrival
confirmation may be newer than Ada evidence; retain both facts in the timeline.

---

## 10. ETA calculation

Priority of evidence:

1. actual branch-arrival confirmation → no estimate; show actual;
2. admin ETA override/planned route → show override and note;
3. linked outbound transfer timestamp → next applicable destination delivery date;
4. linked HQ approved receipt timestamp → next applicable destination delivery date;
5. no evidence → unknown (`ยังประเมินไม่ได้`).

For multi-item cases, calculate the case-level ETA only after all required quantities have
HQ/transfer coverage; use the latest item basis so the date does not imply that an
incomplete case will arrive together. Before full coverage, show per-item progress and
`ยังประเมินวันครบทั้งหมดไม่ได้`.

Algorithm in `Asia/Bangkok`:

1. Resolve the basis timestamp to its local date/time.
2. Load the branch schedule effective on that date.
3. If a cutoff is configured and the basis occurs before cutoff on a scheduled day, the
   same day may be returned.
4. If no cutoff is configured, choose the first scheduled day strictly after the basis
   date.
5. Save a versioned projection with basis, source link, and confidence.
6. Never silently replace an admin override.

Recommended display:

```text
คาดว่าจะถึงสาขา: ศ. 24 ก.ค. 2569
ประมาณการจากใบรับสินค้า HQ · ข้อมูล sync ล่าสุด 22 ก.ค. 19:20
```

Holiday/exception calendars are a later extension. For the pilot, an admin override with
reason handles holidays, emergency runs, and missed vehicles.

---

## 11. UI design

### 11.1 Component structure

Create a feature folder rather than growing `App.jsx`:

```text
apps/admin-web/src/preorders/
  PreorderPanel.jsx
  PreorderCreateDialog.jsx
  PreorderProductComposer.jsx
  PreorderTable.jsx
  PreorderDetailDrawer.jsx
  PreorderTimeline.jsx
  PreorderAdminActions.jsx
  PreorderStaffActions.jsx
  PreorderEvidencePanel.jsx
  preorderApi.js
  preorderState.js
  preorder.css
  *.test.js
```

`App.jsx` should only import/render the panel, pass session/CSRF/branch/role, add the badge,
and include `preorder` in the persisted/hash route maps. The current code has the menu
item but does not include `preorder` in `adminViewKeys` or `ADMIN_VIEW_ROUTE_SEGMENTS`;
fixing refresh/deep-link behavior is part of this feature.

### 11.2 Staff view

- Primary CTA: `สร้างรายการพรีออเดอร์`.
- Compact status cards: waiting admin, waiting customer, ordered/incoming, ready/complete.
- Table columns: ID/time, masked customer, item summary, intent, admin-read state, current
  status, last reply, ETA, action.
- Staff never sees other branches, supplier cost, admin-only notes, or all-branch filters.
- Mobile layout converts table rows to stacked cards with the primary action visible.

### 11.3 Create dialog

Use progressive sections rather than a visually dense form:

1. ลูกค้า — phone, name.
2. สินค้า — mention/autocomplete or free-form description; selected rows with `− / +`.
3. รูปประกอบ — previews, remove, `n/3` count.
4. ประเภทคำขอ — dropdown: price inquiry/order request.
5. ตรวจสอบและส่ง.

Search behavior:

- activate after `@` and two meaningful characters;
- debounce about 250 ms and cancel stale requests;
- keyboard support: arrows, Enter, Escape;
- exact code/barcode row first;
- clear empty/loading/no-match states;
- `ไม่พบสินค้า — เขียนรายละเอียดสินค้านอกระบบ` is a deliberate action, not an error.

### 11.4 Admin queue/detail

- All-branch filters, intent, status, assignee, unread, and age.
- Actionable groups: new/unread, waiting admin, waiting staff/customer, procurement,
  fulfillment, exceptions.
- Detail drawer has customer/request on the left and timeline/actions on the right on wide
  screens; stacks on mobile.
- Action area changes with state. Do not show every possible button at once.
- Quote and unavailable outcomes use structured forms; chat text alone must not drive
  business status.
- Evidence selectors show source timestamp and require explicit confirmation.

### 11.5 Visual/accessibility rules

- Reuse current type, spacing, panel, pill, button, table, light/dark palette.
- Add `.preorder-panel` to the full-width panel behavior where appropriate.
- No emoji as the only icon/meaning in the finished feature.
- Visible focus, labeled controls, dialog focus trap/restore, Escape close, and reduced
  motion support.
- Status must not rely on color alone.
- Thai-first copy, plain errors, no raw stack/enum/HTTP text.

---

## 12. Authorization matrix

| Capability | Staff | Admin |
|---|---:|---:|
| Create case | own effective branch | optional on behalf, audited |
| List/detail | own branch only | all branches |
| View full customer contact | own branch detail | all authorized details |
| Reply publicly | own branch | yes |
| Internal note | no | yes |
| Publish quote | no | yes |
| Record customer decision | own branch | optional override, audited |
| Mark ordered/unavailable | no | yes |
| Link receipt/transfer | no | yes |
| Confirm physical branch arrival | own branch | yes |
| Mark customer notified | own branch | yes |
| Complete | own branch | yes |
| Reopen terminal case | no | yes |
| View supplier cost/admin note | no | yes |

Backend rules are authoritative. Do not use the current generic receipt/movement endpoints
directly from staff UI because several accept caller-supplied branch filters. Preorder
integration routes must enforce their own role and case scope.

---

## 13. Reliability and observability

- Create is idempotent; actions use optimistic `version`.
- Domain event, state change, side record, and badge-driving activity commit together.
- R2 upload is finalized through a pending/reserved state; incomplete uploads are hidden
  and retryable, with orphan cleanup and metrics.
- Use `req.requestId` in events/errors, but never copy customer PII into logs.
- Attachment checksum and idempotent object key prevent accidental duplicate storage.
- Read endpoints are side-effect-free except the explicit `/read` route.
- List/detail support pagination and bounded search.
- Metrics: new cases/day, admin first-response time, quote-to-order conversion, unavailable
  reasons, procurement age, receipt-link delay, ETA accuracy, and cases stuck per state.
- Alert candidates: unread > SLA, `ORDERED` without HQ receipt for N days, received HQ
  without delivery evidence past next schedule, and stale transfer sync.

---

## 14. Test plan

### 14.1 Backend

- Migration applies twice safely and constraints reject invalid rows.
- Staff cannot create/read/search/link across branches, including tampered query/body.
- Admin can list all and filter by branch.
- List masks phone; detail returns it only to authorized actors.
- Create multipart supports 0–3 R2 images, rejects fourth/oversize/SVG/fake MIME, and is
  idempotent across database reservation and object upload.
- R2 provider tests cover Put/Head/Delete/presigned Get with a fake S3 client; partial
  upload/finalization failures are cleaned up or left in a retryable state.
- Staff cannot request a presigned URL for another branch's attachment; URL TTL is bounded.
- Exact code/barcode ranking precedes name matches; leading `@` is normalized.
- Every legal/illegal state transition; 409 on stale version.
- Quote versions and decision quantities remain immutable.
- Admin-read endpoint is idempotent and list prefetch does not mark read.
- Receipt/transfer candidate endpoints require admin and exact case-product scope.
- External link snapshots remain after derived source refresh.
- Receipt/transfer allocation cannot exceed source quantity, and partial multi-item
  coverage does not advance the whole case.
- ETA weekday cases for every branch, weekend rollover, cutoff/no-cutoff, timezone, and
  admin override.
- No PII appears in audit payloads or error bodies.

### 14.2 Frontend

- Pure reducer/format/helper tests using the existing Node test style.
- Mention parsing, search cancellation, keyboard selection, duplicate item merge, quantity
  boundaries, free-form fallback, file count/type/size checks, Thai status labels, and ETA
  formatting.
- Admin/staff conditional actions and branch filters.
- Refresh/deep link retains `#/preorder`.
- Build succeeds in both repos.

### 14.3 E2E scenarios

1. Staff003 creates known-product price inquiry with two images.
2. Staff003 creates a free-form direct order.
3. Staff004 cannot access Staff003 case URL.
4. Admin opens case; Staff003 sees the read timestamp.
5. Admin quotes; staff accepts lower quantity; admin marks ordered.
6. Staff declines quote; case closes without entering procurement.
7. Admin marks unavailable with a reason.
8. Admin links HQ approved receipt; ETA follows branch 003 M/W/F schedule.
9. Admin links transfer; branch arrival and completion flow work.
10. Duplicate submit/network retry creates one case only.

---

## 15. Implementation work packages

### WP-00 — Baseline and safety preflight

- Re-read both repos' current instructions and files.
- Record git status without touching user changes.
- Verify current migration numbers locally and on `origin/main` after `git fetch`.
- Confirm no production migration/deploy is part of the coding task.
- Confirm current builds/tests before feature work where practical.

### WP-01 — Domain migration and transition module

- Add the next safely numbered, re-runnable migration for schema/tables/indexes/seed data.
- Add a pure transition/ETA module and unit tests before routes.
- Feature remains off.

### WP-02 — Core backend CRUD, scope, search, read receipts

- Add `routes/customer-preorders.js` and `services/customerPreorders.js`.
- Mount in `server.js`; add `FEATURE_CUSTOMER_PREORDERS` config.
- Implement product suggestions, create/list/detail/read/unread.
- Add authorization, idempotency, event, masking, and API tests.

### WP-03 — Attachments and conversation

- Install the AWS SDK S3 client/presigner and add validated backend-only R2 config.
- Add a private R2 provider with Put/Head/Delete/presigned Get operations and fake-client
  tests.
- Multipart memory upload with strict file/count/total limits and magic-byte validation.
- Add pending/finalized attachment metadata, retry-safe two-phase upload, and orphan
  cleanup.
- Add authorized short-lived download URLs.
- Public messages, admin-internal notes, read cursors, and tests.

### WP-04 — Staff UI

- Extract preorder feature folder.
- Build create flow, mention search, catalog/free-form items, images, own-branch table,
  detail, timeline, empty/error/loading states.
- Add preorder route persistence and feature flag.

### WP-05 — Admin workflow and quote loop

- Build all-branch queue, filters, first-read state, assignment, quote, request-info,
  ordered/unavailable, and action-specific UI.
- Build staff customer-decision flow and notification badges.

### WP-06 — HQ receipt evidence and ETA

- Add admin-only receipt candidates and explicit link/unlink.
- Implement schedule/ETA projection and admin override.
- Surface explainable ETA to staff.

### WP-07 — Transfer evidence

- Add transfer candidates from reconciliation read models.
- Link evidence without FKs to refreshed derived rows.
- Handle ambiguous/stale evidence and arrival confirmation.

### WP-08 — Hardening and rollout readiness

- Full regression tests, E2E paths, accessibility pass, responsive dark/light review.
- Metrics/admin stuck-state filters.
- Update `docs/ARCHITECTURE.md` only after implementation matches reality.
- Document migration/deploy order and rollback via flags.

---

## 16. Rollout and rollback

Recommended rollout:

1. Create a private R2 bucket and a bucket-scoped Object Read & Write Access Key.
2. Add the R2 secrets only to the PaaSRTSM backend environment; never to Vite/frontend.
3. Apply additive migration using the safe production procedure in the backend `AGENTS.md`.
4. Deploy backend manually with `FEATURE_CUSTOMER_PREORDERS=false` and verify R2 readiness.
5. Deploy frontend with its preorder flag off/placeholder fallback.
6. Enable for admin plus one branch pilot, preferably one M/W/F branch.
7. Verify private upload/download, deletion cleanup, receipt linking, and ETA with real
   pilot cases before enabling every branch.
8. Add branch `005` to validate the alternate Tue/Thu/Sat schedule.

Rollback:

- turn both feature flags off;
- leave additive tables in place so case/audit history is preserved;
- do not drop customer data during an operational rollback;
- revert UI/API exposure only, then fix forward.

---

## 17. Definition of done

- Staff can create catalog or free-form cases with 0–3 images and the selected intent.
- Staff sees only own-branch cases; admin sees all.
- Staff can tell whether and when an admin first opened a case.
- Price inquiry supports a structured quote and recorded customer accept/decline with
  final quantities.
- Direct order/accepted quote supports ordered or unavailable outcomes.
- Staff/admin can converse without chat text silently changing workflow state.
- HQ approved receipt and transfer evidence are explicitly linkable and remain read-only.
- ETA is schedule-based, explainable, timezone-correct, and clearly approximate.
- Every mutation is authorized, CSRF-protected, versioned, audited, and tested.
- Images are durable in the pilot, private, bounded, and safely served.
- R2 credentials exist only in the live backend environment; the private bucket has no
  permanent public object URLs, and partial uploads are recoverable/cleanable.
- No code is added to the legacy server and no write is made to AdaAcc.
- Both repo test suites/builds pass and existing stock-request/receipt/movement flows regress
  cleanly.
