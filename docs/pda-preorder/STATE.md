# Shared checkpoint — 16 November 2026 (Bangkok)

Status: **PDA_COUNT_001_AND_005_LIVE / PREORDER_CHAT_CLAIMED / PREORDER_REVIEW_DRAFTS_READY**. R12 deployment/config/schema verified16 Nov09:37 Bangkok; actual new005 phone acceptance remains pending. Preorder drafts remain separate and undeployed.

## Ownership admission

| Workstream | Owner | Admission |
|---|---|---|
| SCPDA smartphone app | Existing PDA chat | Active; retained |
| Preorder business domain, web and domain API | User-opened chat **เพิ่มฟีเจอร์ใหม่ในแอพและเว็บ** (`01a1dd34-c898-7689-a2a9-fe3f962c212d`; thread `6af923e6-aeb8-8191-8f37-c6ca3bacb094`) | Active owner admission recorded 15 Nov 2026; work remains isolated from PDA code |
| Shared mobile ↔ preorder interface | Both owners, contract changes recorded here | Business roles confirmed; new API contract still proposed |

Do not invent thread IDs. The actual destination thread and user message were verified with `read_thread`. No direct cross-thread messaging operation is callable. The PDA owner later acknowledged the admission through the common Git ledger in [the Android readiness event](events/2026-11-15-pda-android-readiness.md); this is not a direct chat message or a claim of shared executor access.

### User-identified destination (15 November)

The user supplied the existing destination chat **เพิ่มฟีเจอร์ใหม่ในแอพและเว็บ**:

`codex://threads/6af923e6-aeb8-8191-8f37-c6ca3bacb094?hostId=durable`

The current task is this verified destination chat. Separate review checkouts are now available at `/workspace/sc-preorder-web` and `/workspace/sc-preorder-backend`; their current branch/commit and PR records are below. The ownership handoff is in [event 002](events/2026-11-15-002-destination-identified.md). Direct cross-thread messaging remains unavailable; the peer acknowledgment came through this shared ledger. No replacement chat/agent was created.

## User-confirmed corrections

- **CEO** decides availability, customer sale price and purchasing. CEO uses their admin account; no new account has been created here.
- **Boom** is the HQ receiving and dispatch coordinator, not purchasing. They track ordered goods, actual HQ receipt, allocations, destination branch and dispatch round.
- **Branch staff** handle the customer request/acceptance, physical branch receipt, customer contact and handover.
- Customer preorder is distinct from branch replenishment and physical stocktake.
- CEO cartoon should follow the supplied portrait and age approximately 37–40. The original portrait is not stored in this repository.
- Label OCR was paused at the user's request. Keep manual lot/manufacture/expiry entry and barcode scanning.

## Recorded source and delivery checkpoints

| Item | Evidence / state |
|---|---|
| Web main checked 16 Nov | `f9bf49d4054cb8424573800806d2552c548d4c52`, live R12 admin005 selector |
| PDA branch source | Current R12 `codex/scpda-005-app-r12`, `c74eaeb2ccd5de25e698a6e5912715c10d44954d`; [PDA owner checkpoint](owners/PDA.md) |
| Pending mobile UI batch | Update1 queue-only medicine panel prepared/tested at `codex/scpda-next-ui-batch` / `ec2227b7d89e12ed4999eb38b21d3c0aeb4d0dbd`; user explicitly said wait for their second update before any APK build. Current delivery remains R12. [Pending event](events/2026-11-16-pda-next-ui-update1.md) |
| Android source handoff | [Verified source paths, fetch instructions and joint workflow](PDA_SOURCE_AND_CONTINUATION.md); source exists in Git, Drive is delivery only. User requested clarification to Preorder owner; receiver acknowledgment is not yet recorded |
| Latest APK in Drive | [SCPDA0.6.2-test.12](https://drive.google.com/file/d/1K-JEn0hS76QUIlwQnZ6PggjrMse2H4DE/view?usp=drivesdk),16 Nov; new01005/005 phone trial and existing001 support. Same package/signing key and R9 UI; mobile Preorder remains separate |
| PDA count activation / web stock check | User-authorized01001/001 and01005/005 count intake live. Backend `f4e617eef9a9eb805bec3383828a5ac97705e4e2`, web above, migration083/084 applied. Admin sees001/005 separately; branch001 web access remains001-only. No005 web login, Ada adjustment or current-stock-source override. [R12 evidence](events/2026-11-16-pda-branch005-pilot.md) |
| Mobile integration request | Latest direction: `นับสต๊อก / พรีออเดอร์ / เช็คราคา`; catalog price check is separate from customer price inquiry. R8 shell/price reads implemented. A registered-device Bearer adapter into the existing Preorder domain is now in draft PR #61; Android client integration is still pending. [R8 event](events/2026-11-15-pda-r8-price-check.md), [adapter event](events/2026-11-15-014-mobile-bearer-adapter.md) |
| Customer lookup/sync request | User specified phone-first member lookup, single/multiple/no-match behavior, double-confirm for new members and SCCRM → ADA → all-branch SCPDA sync; detailed in [event 006](events/2026-11-15-006-mobile-member-lookup-sync.md). Draft API now supports exact-phone existing-member lookup and stable member reference on a preorder case (`9c206b1`, PR #61); SCCRM member creation and downstream sync receipt remain unimplemented. See [event 015](events/2026-11-15-015-member-directory-and-registration-boundary.md) |
| Request-mode correction | User corrected the paths: Preorder skips `ตอบราคา`; price inquiry ends if declined and continues to status/receipt/allocation if accepted; [event 009](events/2026-11-15-009-corrected-mode-flow-and-cancel.md) supersedes event 007's flow interpretation |
| Thai labels/member simulation | User requested UI label `พรีออเดอร์`, an existing-member fixture and a no-match/new-member simulation, and removed explanatory member-success copy; detailed in [event 008](events/2026-11-15-008-thai-label-member-simulation.md) |
| Request cancellation interaction | User requested swipe-right row action, password check, confirmation and required cancellation reason; simulation only, no production cancellation API; detailed in [event 009](events/2026-11-15-009-corrected-mode-flow-and-cancel.md) |
| Product lookup/new item flow | User specified code/name/barcode search, Thai dynamic choices, ADA duplicate check, barcode icon in the field and blue/yellow paired actions; events [010](events/2026-11-15-010-product-lookup-and-unregistered-items.md) and [011](events/2026-11-15-011-product-search-layout-and-live-results.md); mock data only |
| Multiple request items | User requested one-row example chips, equal-height paired actions, a single selection heading, trash-can removal and multiple products per request; detailed in [event 012](events/2026-11-15-012-multiple-request-items-and-selection-cleanup.md); local preview only |
| ADA receipt notice / CEO product naming | Backend draft PR #61 creates idempotent HQ work cues for pending then approved receipt lines; both carry the same source key for client-side inbox updates. Enrolled-device cursor polling is `/api/mobile/preorder-notifications` (30-second recommendation); the web preorder badge polls `/api/customer-preorders/unread-count`. The 15-minute receipt-only runner now polls pending+approved lines but its scheduled task is created disabled by default; live HQ install/health is unknown. PDA UI integration, product writer and accounts remain unimplemented. No ADA Cloud API is needed for the read/notify path. Details and limits in [event 013](events/2026-11-15-013-ada-receipt-notice-product-review-and-fifo.md) |
| Current-recorded private PDA browser preview | `https://sc-stockday-pda-lab.scgroup1989-it.chatgpt.site/`, last published Site v14; manual fields/scanner tested on 13 Nov; synthetic browser-local counts, not a live preorder integration |
| Preorder preparation | `codex/preorder-three-role-readiness`, latest `c388247225c32639d69bcd179994d1a080fb66b8`; receipt-only task now reads pending+approved lines |
| Web review | [Draft PR #100](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/100); latest head `c388247225c32639d69bcd179994d1a080fb66b8`; CI run `43712453471` passed. Targets main, not merged/deployed. |
| Preorder flags | `VITE_FEATURE_PREORDER_ROLE_WORKSPACE=false` by default; backend role-workspace flag also defaults off; no Preorder runtime flag changed by R11 |
| Backend source inspected for R3 | `AKCD1998/PaaSRTSM-project` `main` at `46985c97491529311ccaa4366ab5905b2c4759fc`; root `AGENTS.md` read from the actual checkout |
| Backend review | [Draft PR #61](https://github.com/AKCD1998/PaaSRTSM-project/pull/61), latest head `c5a28bf16391f0ae22838c6a7bc31f30d6a49098`; adds enrolled-PDA bearer adapter (`e9057f1`), exact existing-member lookup (`9c206b1`), API contract docs (`61e8bb7`) and pending/approved HQ receipt notifications (`c5a28bf`). CI runs `43709199891`, `43710628130` and `43712475237` passed. Open/draft, not merged/deployed. |
| Preorder migration | `080_add_preorder_hq_physical_receipts.sql` remains in PR61 for review, not applied. Backend main now includes separately authorized PDA083 and084; highest084 verified16 Nov. Re-fetch before choosing another number |
| Earlier R3 evidence | 8 workspace tests + 9 existing preorder helper tests + 4 navigation/session tests passed; admin-web production build passed with existing bundle-size warning, before continuation commits |
| Continuation checks | `e9057f1` changed API files passed `node --check` and `git diff --check`; CI run `43709199891` passed. Member-directory commit `9c206b1` changed API files and `git diff --check` passed; CI run `43710628130` passed. Pending/approved notification code commit `c5a28bf` passed `git diff --check`; CI run `43712475237` passed. Web receipt-task commit `c388247` passed `git diff --check`; CI run `43712453471` passed. No separate local test suite was run for these continuation commits |
| R3 review mockup | 17 browser checks; one synthetic request supplied in two rounds 2+1, 15 in-memory actions; not a durable API/database/auth proof |
| APK status | Latest delivered0.6.2-test.12, same package/signing certificate. User's005 Android screenshot and matching production receipt confirm an upload16 Nov10:16 Bangkok; quantity review/current-balance adoption and remaining hardware checks are separate. Pending UI update1 is not built/shipped |

## Implemented vs pending

Prepared in isolated web/API branches: subject-bound server workspace manifests and capability checks; purchasing, HQ fulfillment and branch profile scopes; fulfillment-safe case DTOs; branch session mapping into existing staff workflow handlers only under an authorized branch profile; append-only physical HQ receipt count/correction events; and a registered-device Bearer adapter that reuses the existing customer-preorder cases/service. A mobile identity must have an explicit `staff:<staff_id>=branch:<code>` profile. The API also exact-matches a phone against the existing SCCRM member directory, revalidates/persists the selected member UUID and canonical name, and creates idempotent HQ notifications for pending then approved receipt sync. Feature flags remain off by default; draft PRs #100 and #61 are unmerged and undeployed. The Android screens/polling client, SCCRM member creation/delivery receipt, offline queue and staging roundtrip remain incomplete. See [events 013](events/2026-11-15-013-ada-receipt-notice-product-review-and-fifo.md), [014](events/2026-11-15-014-mobile-bearer-adapter.md) and [015](events/2026-11-15-015-member-directory-and-registration-boundary.md).

User-confirmed mobile UX direction: add bottom tabs **นับสต๊อก** and **พรีออเดอร์** inside the existing app. A handoff for the PDA owner is ready in [MOBILE_PREORDER_TAB_HANDOFF.md](MOBILE_PREORDER_TAB_HANDOFF.md). No mobile source was changed in the Preorder checkout; no direct cross-thread message tool is available, and this ledger entry is not proof that the PDA owner has accepted the implementation work.

User-confirmed request-form detail: phone first with orange **เช็คสมาชิก**, read-only name on match, popup selection for shared numbers, create-new confirmation on no match, and a second confirmation before creating a member. The backend API supports exact-phone lookup of active SCCRM members and revalidates/persists a selected member ID when creating a preorder case. The requested SCCRM → ADA Software → SCCRM/ADA/SCPDA propagation is not being newly implemented as a writer: source inspection found an existing SCCRM registration-to-Ada/HQ-to-branch delivery path, but current live health/delivery for any new record has not been verified. The PDA-facing create-member bridge remains absent. SCCRM's existing registration route requires a separate staff-device credential, date of birth and general PDPA consent; the preorder request design so far only captures phone/name. Decide which customer-registration experience to support before implementing that bridge. The updated phone prototype is local-only.

User specified a per-request switch between **พรีออเดอร์** and **สอบถามราคา** with distinct queues, lifecycle and colors. The corrected Preorder path has six stages and goes from status to actual receipt/allocation without `ตอบราคา`. Price inquiry has six initial stages ending at `ตอบราคา`; decline closes it, acceptance adds status tracking and actual receipt/allocation. This correction supersedes event 007's earlier flow interpretation.

The request list should reveal a red **ยกเลิกคำสั่งซื้อ** action when swiped right. The user confirmed password check, a second cancellation confirmation and a required reason after confirmation. Only the local mock simulates this; the production server/API and secure authorization/audit handling are not implemented.

Product lookup should accept company and legacy codes, Thai/English names and barcodes. A barcode icon sits inside the search field; typing filters live results, and **ตกลง** opens the full Thai-name picker. **ตกลง** and yellow **＋ สินค้าใหม่** share an equal-height two-column row; example chips stay on one horizontal row. Multiple items can be added to one request and removed individually with trash icons; the pending/selected rows use one heading. The new-item form collects a trade name and optional photo, then checks ADA for a match. Reuse an existing ADA item when confirmed; otherwise add a request-only unregistered line for central product review and ADA item creation/mapping. The local catalog and lookup are simulated only; there is no ADA query or file upload integration. Event 011 supersedes event 010's scanner/button placement; event 012 clarifies multi-item selection.

Latest HQ receipt design direction and code: local AdaPOS `adapos-sync` reads pending/approved receipt rows. PR #61 adds an idempotent `HQ_RECEIPT_PENDING_SYNCED` event and a later `HQ_RECEIPT_SYNCED` event using the same source key; PR #100's separate 15-minute runner now polls both states. It remains disabled by default and live HQ host health is unknown. The mobile endpoint is a cursor poll (not push) and has no PDA UI caller yet. A pending row is a work cue only and cannot be allocated; HQ still needs photo/actual count/optional lot verification before FIFO allocation. CEO placeholder review and auditable product-master writeback, mismatch resolution, dispatch and branch physical receipt remain separate work. No deployment, account change, product write or stock write occurred.

**Pending before enabling the new flow:**

1. Review/accept and provision the server role policy/manifest and dedicated HQ profile; verify capability and DTO filtering against staging.
2. Review migration 080 before application. Multi-shipment persistence, dispatch, branch physical receipt, customer handover, partial supply and their correction/idempotency/version events remain pending. Existing transfer/document links are not physical movement events.
3. PDA owner review/acceptance and Android integration of the Bearer adapter into the same preorder domain; private attachment/offline behavior and device roundtrip are also pending.
4. Approved reachable staging service and verified UI → API → durable store → receipt → second client/restart/offline retry, before any rollout approval.
5. Verify the HQ agent's sync schedule/health and wire its existing receipt-ingest backend to SCPDA's in-app inbox. Build the CEO product-master writer as an isolated SC-owned local component with read-back; do not wait for a vendor Cloud API or write only to the mirror database.

No production deployment, official inventory/financial write, account/permission/CORS change or migration was authorized by creating this ledger. Do not reactivate OCR or repurpose receiving/transfer/Sync operations as a shortcut.

## Review artifact checkpoint

Original Cloud artifact directory: `/workspace/artifacts/sc-preorder-roles-r3-2026-11-15/`.

- `SC-Preorder-Three-Roles-R3.png` / `.pdf`: ten-scene flow with corrected young CEO.
- `StockDay-Preorder-R3.html`: self-contained synthetic review, no network/API calls.
- `StockDay-Preorder-R3-Review.pdf`: reviewed CEO, HQ and mobile screens.
- `SC-Preorder-Three-Roles-R3-Review.zip`: 3,807,931 bytes, SHA-256 `dd96d4296bfcc6cc1adc5ad3c192f60927c6d3dd72243b3e921a8ae8868f0ddb`.
- `DELIVERY.json`, `REVIEW-CHECKS.json`, focused test/build logs and exact `WEB-PREPARATION.patch` distinguish proof from pending work.

Artifact paths are checkpoints on the original machine. A different Cloud executor may not have these files. Code/architecture can be recovered from PR #100 and the copies under [reference/](reference/). Missing image/mockup files are not a reason to discard or redesign the existing implementation. Do not assume this ledger has published private media to GitHub; it has not.
