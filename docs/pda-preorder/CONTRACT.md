# Shared mobile ↔ preorder contract register

Contract register version: **R3-COORD-1**. This is a record of agreement/proposals; it does not deploy an API. Keep confirmed business requirements, inspected existing routes and proposed transport contracts separate.

## Confirmed business requirements

1. CEO = availability/customer sale price/purchasing; Boom = HQ receiving/allocation/dispatch; branch = customer acceptance/actual receipt/contact/handover.
2. One server-issued request, stable item IDs and the same quantity history must connect the smartphone and website. Do not create a second official mobile preorder ledger.
3. Price acceptance references a specific quote version and explicit product/unit/quantity. Changes need renewed acceptance before additional purchasing; historical facts remain.
4. Ordering, supplier ETA, physical HQ receipt, allocation, planned dispatch, actual dispatch, actual branch receipt, customer notification, POS sale and customer handover are distinct facts.
5. Partial supply and multiple shipments stay in the same request. For accepted 3 boxes, handing over 2 leaves 1 outstanding; merely receiving 2 at HQ does not reduce customer handover outstanding to 1.
6. Documents can cover multiple requests and vice versa. Allocation must prevent double use. Document presence does not by itself prove physical receipt or a stock-ledger effect.
7. Existing Ada/POS receipt/transfer/sale work remains in its authorized process. No app button silently creates official inventory or financial movements.
8. Manual lot/manufacture/expiry entry remains. Optional preorder product photos do not re-enable label OCR.
9. The source ADA receipt/line ID in our existing local SQL sync is the identity for an SCPDA notification. Replaying a sync must not create a second ADA inventory movement. A mobile physical count/photo is a linked verification event; a mismatch holds allocation until the authorized inventory process reconciles it.
10. A provisional product name is not a canonical identity. CEO/authorized product-data staff must map it to an existing AdaPOS item or create/update the master item through an isolated, auditable local write path. Requests become allocatable only after read-back confirms the canonical item code and unit. Display-name similarity alone is not a safe merge key.
11. FIFO is per canonical product identity and exact unit. Include active Preorders and only price inquiries accepted by the customer; exclude pending/declined inquiry, canceled, completed and previously allocated quantities. The server, not a phone's list snapshot, orders and atomically commits the allocation.

## Product, time and count invariants retained from PDA work

- Barcode/SKU are exact strings, including leading zeros. Unknown pack identity/factor stays unknown; never infer conversion from name/price or substitute missing factor 1.
- Null, zero and negative reference stock are distinct. Production mobile scan's inspected basis is Full Sync and it does not supply stock observation time; price timestamps or fetch time are not stock observation time.
- Independent stocktake rounds compare; do not add recounts. Preorder requested/ordered quantities are not physical counted stock or official Ada adjustments.
- Dates retain actual precision; do not invent a day. Missing label information is allowed. Do not use estimated FEFO/hourly data as an actual count.
- Client observation, server receipt and source-document times are separate. Offline upload does not relabel a stale observation as current.

## User-confirmed mobile navigation direction (15 November)

The user wants Preorder inside the same SCPDA Android app, reached through a separate bottom tab. The latest user-confirmed top-level tabs are **นับสต๊อก** (the current scanner/count workflow), **พรีออเดอร์**, and **เช็คราคา** (read the existing product catalog and stock). This supersedes the earlier two-tab direction. Keep the existing scanner and local count history in the count tab; keep preorder cases, customer decisions and lifecycle in the Preorder tab. Account/settings remain in the existing header control. Catalog **เช็คราคา** is distinct from customer **สอบถามราคา** inside the Preorder workflow; checking an existing price creates no customer request. Do not combine count observations with preorder receipt/allocation quantities.

This is a confirmed navigation direction only. It does not accept mobile API authentication, role provisioning, server schema, offline guarantees or production activation. Role-specific screens must derive from authenticated server capabilities rather than a local role switch.

## Confirmed catalog stock presentation — R9

The company IC/630 display is labeled **รหัส SKU**; the identifier is not replaced by internal numeric `sku_id`. Show a large quantity and orange information action after **จำนวนตาม StockDay**. Branch/source/actual sync time/approximate morning routine move into that popup. R9 refreshes existing reads on popup open, every60seconds while active/foreground and on foreground return; failed reads retain last-successful values/times with explicit popup failure. A read is not a new source sync or physical observation, and the approximate08:30 routine is user-provided rather than a scheduler API. No stock-source selection contract changes.

## Confirmed count-entry refinements — 15 November 2026

- Use the leading product-name category token เภสัช / สามัญ / ปกติ as a default; unknown prefixes require explicit selection. Preserve previously selected draft/correction context. This is UI convenience, not server authorization or an inventory override.
- Current manager-operated PDA pilot may submit a first or second independent round immediately without waiting for all three. A partial product count may be collected with its scope explicit. Rounds remain separate; collection is distinct from acceptance as a complete/current stock baseline. Additional lower-staff restrictions are future work, not a role/permission change in R6.

## Deployed PDA count intake and website catalog — R11 addendum

The user subsequently explicitly authorized the prepared count pilot, initially **operator01001 / branch001**. Backend `38d8a4a` and web `9ed9832` are verified live. This supersedes the old pending count activation in prior PDA checkpoints; it does not activate the proposed Preorder domain/mobile contracts below.

Existing registered-device reader authentication negotiates separate count-purpose access. `SCPDA_COUNT_OPERATORS_001=01001` is an explicit server allowlist; absent admission denies everyone. Other readers/counter tokens cannot send. `scpda-counts-001-v1` preserves exact product/barcode/unit/category/round/scope, immutable quantities/lots, optional manufacture/expiry dates, original observation time, server receipt, idempotency and correction lineage. Historical local-only records need the original operator's explicit send. The separately requested01001 password change preserves username, device keys and other operators; no password belongs in this ledger.

`GET /api/stock-check` / `scpda-stock-check-001-v1` uses existing web-cookie auth for admin or both original/effective branch001. The website **ข้อมูลสินค้า → เช็คสินค้า** shows actual catalog products, latest PDA server receipt per product first, never-submitted products last, categories เภสัช/ปกติ/สามัญ, quantities/lots/dates and review status. Branch001 reads; admin has review actions. This **เช็คสินค้า** evidence catalog is distinct from mobile **เช็คราคา** and Preorder customer **สอบถามราคา**. Intake and admin review do not themselves replace current Full Sync balances or adjust Ada stock. [Deployment/test/delivery evidence](events/2026-11-15-pda-r11-count-activation.md).

## Deployed005 pilot extension — R12

The user authorized account01005 at branch005 and confirmed a new Android phone on16 November. R12 adds005-scoped enrollment/reader/count audiences and response contracts while preserving001. Exact operator/branch pairs are server-owned; absent005 flag denies005 and explicit count allowlist remains required. Scope:01001/001 and01005/005 count intake; admin can inspect001/005 separately, existing branch001 web accounts stay001-only. There is no new005 web or named Preorder identity. New005 reader/counter credentials must not be reused as the separate enrolled Preorder capability token. Manual fields, observed-versus-received time, whole quantities, units/pack uncertainty, receipt idempotency and append-only corrections remain. [R12 source/deployment/test/delivery event](events/2026-11-16-pda-branch005-pilot.md). Future mobile continuation uses the current005-capable app source in the handoff; it must not regress to an001-only build.

## Existing source evidence, not today's runtime proof

The inspected preorder backend has authenticated web-session routes under `/api/customer-preorders` for cases, quotes, customer decisions, mark-ordered, case-level branch arrival/notification/completion, messages/photos, receipt/transfer evidence links and ETA. Its available source uses admin/staff checks.

The inspected mobile enrollment/scan routes under `/api/mobile` and lookup alias `/api/pda` are separate. Do not assume the web preorder routes already accept mobile Bearer tokens. Do not invent a production PIN or refresh-token contract. Consult earlier verified mobile handoff and inspect current source/runtime before integration. The prior report of CORS rejection is not fixed by this ledger.

## Proposed, not accepted as deployed

PR #100's gated UI and backend draft PR #61 propose `GET /api/customer-preorders/workspace` with version **`sc-preorder-three-role-r3-v1`**, `subjectUserId`, `workRole` (`purchasing`/`fulfillment`/`branch`), branch scope and capabilities. PR #61 adds server profiles, the manifest endpoint, capability checks and fulfillment-safe case DTOs. Its source config example is `PREORDER_WORKSPACE_PROFILES=subject=purchasing;subject=fulfillment;subject=branch:001`; the feature flag defaults off. Neither PR is merged/deployed or accepted as a shared mobile contract. The endpoint is still behind the web-session auth middleware; the SCPDA registered-device transport adapter is not implemented. Missing/unknown/mismatched admission fails closed; never grant Boom global admin to bypass it.

### Proposed physical HQ receipt delta — PR #61, not accepted

The backend branch proposes `POST /api/customer-preorders/cases/:publicId/items/:itemId/receipt-verifications` for the `receipts.physical.record` capability. The body has `expectedVersion`, `expectedBatchVersion`, `quantity` (up to 4 decimal places), exact `unit`, timezone-explicit `observedAt`, `idempotencyKey`, and a source approved-receipt reference (`sourceBranch`, `docNo`, `seqNo`); `reason` is required for corrections and counts above document quantity. The response includes `receiptEventId`, `quantity`, `unit`, `observedAt`, resulting case/batch versions and whether the request was replayed.

Migration `080_add_preorder_hq_physical_receipts.sql` proposes a source-line batch/current count plus append-only `COUNTED`/`CORRECTED` events with actor, time, version chain, idempotency key and payload hash. Fulfillment allocation is limited to the current physical quantity and exact unit; a correction cannot lower it below active allocations. The migration is present in draft PR #61 for review only and has not been applied. This does not write Ada/POS inventory.

This delta does not provide mobile authentication, dispatch/transfer counts, branch physical receipt or customer handover. Multi-shipment and partial quantity lifecycle remain pending. No phone client should call the proposed web-cookie route until the PDA owner reviews and an approved mobile adapter/transport is agreed. The web/API branch is a review artifact, not evidence of live staging behavior.

### Existing AdaPOS receipt sync and proposed SC mobile notification/write-back

Read-only source review found that `SC-StockDay-Ordering/apps/adapos-sync` reads pending and approved supplier receipts from the local AdaPOS SQL database (`TACTPiHD`/`TACTPiDT`; `FTXihStaPrcDoc IS NULL` for pending and `= '1'` for approved). Its sync client posts them to our existing backend receipt-ingest routes. The Admin web already reads the corresponding backend pending/approved receipt lists. This incoming receipt path is our own sync bridge; it does not require an Ada Software Cloud API or help from the ADA vendor team. The source `register-task.ps1` schedules the standard run at 08:20 and 19:20; the actual HQ machine's deployed schedule/config and health still need confirmation. That cadence is too slow for a receipt alert, so add a receipt-only HQ sync trigger rather than accelerating the full dataset. Current pending/approved syncs replay rolling windows; don't emit a new notification on each replay.

Proposed mobile-read contract: after successful receipt ingestion into our backend, create/update an idempotent SC notification keyed by source document + line and a source-state/content hash to ignore rolling replays. Include product code, exact quantity/unit, approval status and original source time. Pending receipt is visible as **รออนุมัติ** but cannot be allocated; approved status updates that same line. The receipt-only job must also catch approvals of older pending docs that have fallen outside the current approved lookback. First delivery can use SCPDA's authenticated inbox/foreground refresh; optional phone push is only a wake-up hint after mobile notification delivery is available. A mobile physical count/photo remains a linked verification record and never reposts the ADA stock movement. On quantity mismatch, hold allocation and route reconciliation; never auto-correct official stock.

CEO product contract: branch request retains its own ID and optional product-label photo/trade name; search the synced catalog by exact item code/barcode/pack identity before name. CEO chooses **map existing item** or **create/update canonical item**. `adapos-sync` is read-only, so master-data writes need a separate SC-owned local writer agent on the HQ AdaPOS machine, with narrow credentials, explicit CEO confirmation, duplicate prevention, stable idempotency key, audit identity/time, durable retry and read-back verification. This is our own controlled integration work, not a vendor Cloud API dependency. Keep **รอเขียนข้อมูลสินค้า/ยืนยันกลับ** and block allocation until read-back confirms the canonical code/name/unit. Do not update only the web mirror and imply AdaPOS has changed. The existing transfer writer design is a pattern, not an implemented product writer.

The mock/API contract does not yet implement mobile notifications, product-master write-back, photo upload, mismatch release or atomic FIFO allocation. It also does not create accounts. Verify sync-agent cadence/health and exact product-master write procedure within our systems before enabling writes; ADA vendor support is not a prerequisite to build the SC-side path.

Authentication/enrollment, private photo handling and offline cold-reopen must be validated against an approved reachable staging service before a mobile production-ready claim. Component tests and a local mockup do not replace a UI → API → durable store → receipt → another-client/restart proof.

## Change record protocol

For a material shared change, add a new event with: ID, proposer/owner, current version, proposed change, affected clients/services, compatibility/migration implications, implemented/tested/stub/pending status, source SHAs and evidence. Record the other owner's actual review when received. A sent message, elapsed time, file creation or user liking a picture is not technical API acceptance. Preserve prior records; supersede rather than erase.

Production deployment, schema migration, permission/account/CORS changes, added costs and official inventory writes remain outside this coordination action. Prepare reviewable code first and record the smallest real gate instead of inventing approval or bypassing a denial.

### 16 November — user-authorized004 Android count pilot (R16)

Add01004→004 with independently default-off004 admission, explicit count allowlist and branch-bound004 device/reader/count audiences/DTOs. Preserve001/005 credentials and identities. Admin004 evidence reads do not create a004 web account. Migration087 extends only immutable evidence constraints; no official Ada/current-stock writes. AndroidR16 and App Center support004; browser enrollment transport remains001-only. New004 account does not grant enrolled Preorder/product/CEO rights. Local controls the separate product-writer TEST round. [Verified source/deployment/delivery](events/2026-11-16-pda-branch004-r16.md).


## 18 November — accepted daily companion policy, candidate transport

For the branch005 pilot, primary01005 approves secondary02005 through a two-minute QR from the current Android release. The matching iOS Home Screen PWA shares that release's UI; admission binds one installation key, not physical iPhone hardware. Each day begins with a selfie and actor/device/branch work log. Reader and count access expire00:00 Asia/Bangkok; proof-only reopen does not extend that date. No background screenshots. Private Drive images are deleted90 days after capture; stock evidence and work history are separate.

The user explicitly accepted **QR + matching public IP** as an interim check and requested a weekly Monday-morning reminder to improve real store-network verification. This is not an assertion of sameSSID/LAN. Existing001/004 accounts are not silently included in this candidate.

Backend PR70/mobile PR108 remain draft and production admission is off. Drive backend OAuth and real-phone acceptance are prerequisites. This policy adds no Preorder/product/CEO privileges; those owners must review an explicit capability contract before reuse. See [R17 candidate event](events/2026-11-18-pda-r17-daily-companion-candidate.md).


## 19 November —004 front/Shopee counting and internal order picks

User-confirmed physical layout: front sales floor and its middle/front warehouse,
with Shopee at the back. Separate team counts retain one branch004 stock reference.
Requested login01004SHPEE is distinct from01004; actor identity must not become
another stock balance. R18 implements server mappings004-front and004-shopee,
with packed/unshipped goods explicitly covered. Backend PR72/migration090, web
PR109 and Android code18 are live/published; existing enrollment and legacy
unspecified observations remain compatible. [Release checkpoint](events/2026-11-19-pda-004-r18-area-release.md).

Urgent front-warehouse → Shopee-order picking stays internal004, conserves branch
physical quantity until actual dispatch, and needs a traceable paired/idempotent
handoff. Interbranch001/003/005 movements keep their existing transfer process.
Do not add independent rounds or asynchronous/incomplete area counts as an exact
branch total. Preserve the existing sole Shopee commitment ledger, opening and
cutover, and reconcile shipments already represented by a new physical baseline
before deducting them again. This adds no CEO/product or official-Ada-write right.
[Detailed proposed contract](BRANCH004_COUNT_AREAS.md).

R18 internal-pick receipts require separate count-purpose scope capability, are immutable/idempotent and carry `branchNetChange:0`, `officialStockWrites:false`, `orderDeductionApplied:false`. A scoped complete flag means `declared-area-only`, never whole-branch proof. All downstream stock/discrepancy consumers must honor scope and packed coverage before selecting any baseline. Website `areaCounts` exposes each latest area receipt and `combinedCount.quantity` remains null pending time/unit/movement reconciliation. Scoped FEFO cannot use branch-wide movement coverage. This does not activate R17/02005, a new product/CEO grant or any Ada writer.

## Activated005 daily companion —19 November, version20

This supersedes the R17 pending admission: PR70/migration091 and matching PWA PR111 are live. Explicit server version20 matches published AndroidR20 and /scpda/.01005 must use current Android/daily selfie proof to create a short-lived QR;02005 enrolls one standalone installation with its own key and explicit count admission, then uses proof-only resume until Bangkok midnight. The permanent binding is not hardware attestation. Both reader/count requests enforce the temporary same-public-IP-with-primary check;001/004 remain outside this daily pilot.

Actual owner/private Drive upload/read/delete passed with a synthetic image, Internal projectmy-scpdaproject-19955 user-confirmed.90-day tracked-image cleanup preserves work/count history. No real staff phone/image was used by QA. Older pending source17/migration089 must not be deployed. Future Android releases must coordinate PWA publication and the server version policy before new QR admission. This adds no product/CEO/Ada-write authority. [Checkpoint](events/2026-11-19-pda-drive-qr005-activation.md).
