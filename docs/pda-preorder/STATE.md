# Shared checkpoint — 15 November 2026 (Bangkok)

Status: **PREORDER_CHAT_CLAIMED / ISOLATED_REVIEW_DRAFTS_READY**. This file records verified source/artifact checkpoints, not a fresh production-service health check.

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
| Web main checked 15 Nov | `d6017807eaed1815f871c95d74db21929d123fad` |
| PDA branch source | Original base `codex/pda-durable-demo`, `7018f122e757656ff7e8db9217e96ac427c63753`; current R5 work branch `codex/pda-unit-pastel-r5`, head `31f82782d77720b3f081648f2e833f77c485b682` |
| Latest APK in Drive | [SCPDA 0.4.1-test.5](https://drive.google.com/file/d/1advJ-GvP1L7cRXU5FdB_G1UBVktsq2fp/view?usp=drivesdk), 15 Nov; includes count-send path behind production activation gate, no Preorder or bottom tabs |
| Mobile integration request | User confirmed two bottom tabs, `นับสต๊อก` and `พรีออเดอร์`, and asked to include the feature in the next app update; design handoff in [MOBILE_PREORDER_TAB_HANDOFF.md](MOBILE_PREORDER_TAB_HANDOFF.md) and [event 005](events/2026-11-15-005-mobile-preorder-tab-request.md) |
| Customer lookup/sync request | User specified phone-first member lookup, single/multiple/no-match behavior, double-confirm for new members and SCCRM → ADA → all-branch SCPDA sync; detailed in [event 006](events/2026-11-15-006-mobile-member-lookup-sync.md); CRM/mobile integration not implemented |
| Request-mode correction | User corrected the paths: Preorder skips `ตอบราคา`; price inquiry ends if declined and continues to status/receipt/allocation if accepted; [event 009](events/2026-11-15-009-corrected-mode-flow-and-cancel.md) supersedes event 007's flow interpretation |
| Thai labels/member simulation | User requested UI label `พรีออเดอร์`, an existing-member fixture and a no-match/new-member simulation, and removed explanatory member-success copy; detailed in [event 008](events/2026-11-15-008-thai-label-member-simulation.md) |
| Request cancellation interaction | User requested swipe-right row action, password check, confirmation and required cancellation reason; simulation only, no production cancellation API; detailed in [event 009](events/2026-11-15-009-corrected-mode-flow-and-cancel.md) |
| Current-recorded private PDA browser preview | `https://sc-stockday-pda-lab.scgroup1989-it.chatgpt.site/`, last published Site v14; manual fields/scanner tested on 13 Nov; synthetic browser-local counts, not a live preorder integration |
| Preorder preparation | `codex/preorder-three-role-readiness`, updated to `7b7c1f63e25b33e7c7b2b3c31e3e3721869a2183` |
| Web review | [Draft PR #100](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/100); open/draft, head `7b7c1f63e25b33e7c7b2b3c31e3e3721869a2183`, base `d6017807eaed1815f871c95d74db21929d123fad`; not merged or deployed |
| Web flag | `VITE_FEATURE_PREORDER_ROLE_WORKSPACE=false` by default; backend role-workspace flag also defaults off; no runtime flag changed |
| Backend source inspected for R3 | `AKCD1998/PaaSRTSM-project` `main` at `46985c97491529311ccaa4366ab5905b2c4759fc`; root `AGENTS.md` read from the actual checkout |
| Backend review | [Draft PR #61](https://github.com/AKCD1998/PaaSRTSM-project/pull/61), head `4ae69908ef1d690432ce01a04aadc6abb7411f9e`, base `46985c97491529311ccaa4366ab5905b2c4759fc`; open/draft, not merged/deployed |
| Migration | `080_add_preorder_hq_physical_receipts.sql` is in PR #61 for review; no migration applied. Current main highest is 079 |
| Earlier R3 evidence | 8 workspace tests + 9 existing preorder helper tests + 4 navigation/session tests passed; admin-web production build passed with existing bundle-size warning, before continuation commits |
| Continuation checks | `git diff --check` passed for both continuation patches. No tests were run for web `7b7c1f6` or backend `4ae6990` |
| R3 review mockup | 17 browser checks; one synthetic request supplied in two rounds 2+1, 15 in-memory actions; not a durable API/database/auth proof |
| APK status | Latest recorded build is 0.4.1-test.5 at the Drive link above; physical-device acceptance remains pending |

## Implemented vs pending

Prepared in isolated web/API branches: subject-bound server workspace manifests and capability checks; purchasing, HQ fulfillment and branch profile scopes; fulfillment-safe case DTOs; branch session mapping into existing staff workflow handlers only under an authorized branch profile; and append-only physical HQ receipt count/correction events separate from receipt documents. The web receipt panel records a physical quantity before HQ fulfillment can allocate the source and keeps an idempotency key across a page reopen. Both feature flags remain off by default. Draft PRs #100 and #61 are unmerged and undeployed.

User-confirmed mobile UX direction: add bottom tabs **นับสต๊อก** and **พรีออเดอร์** inside the existing app. A handoff for the PDA owner is ready in [MOBILE_PREORDER_TAB_HANDOFF.md](MOBILE_PREORDER_TAB_HANDOFF.md). No mobile source was changed in the Preorder checkout; no direct cross-thread message tool is available, and this ledger entry is not proof that the PDA owner has accepted the implementation work.

User-confirmed request-form detail: phone first with orange **เช็คสมาชิก**, read-only name on match, popup selection for shared numbers, create-new confirmation on no match, and a second confirmation before creating a member. The requested propagation is SCCRM → ADA Software → SCCRM/ADA/SCPDA on all branch phones. The updated phone prototype is local-only; CRM APIs and sync acknowledgements remain pending.

User specified a per-request switch between **พรีออเดอร์** and **สอบถามราคา** with distinct queues, lifecycle and colors. The corrected Preorder path has six stages and goes from status to actual receipt/allocation without `ตอบราคา`. Price inquiry has six initial stages ending at `ตอบราคา`; decline closes it, acceptance adds status tracking and actual receipt/allocation. This correction supersedes event 007's earlier flow interpretation.

The request list should reveal a red **ยกเลิกคำสั่งซื้อ** action when swiped right. The user confirmed password check, a second cancellation confirmation and a required reason after confirmation. Only the local mock simulates this; the production server/API and secure authorization/audit handling are not implemented.

**Pending before enabling the new flow:**

1. Review/accept and provision the server role policy/manifest and dedicated HQ profile; verify capability and DTO filtering against staging.
2. Review migration 080 before application. Multi-shipment persistence, dispatch, branch physical receipt, customer handover, partial supply and their correction/idempotency/version events remain pending. Existing transfer/document links are not physical movement events.
3. Accepted mobile auth/identity adapter into the same preorder domain and private attachment/offline behavior.
4. Approved reachable staging service and verified UI → API → durable store → receipt → second client/restart/offline retry, before any rollout approval.

No production deployment, official inventory/financial write, account/permission/CORS change or migration was authorized by creating this ledger. Do not reactivate OCR or repurpose receiving/transfer/Sync operations as a shortcut.

## Review artifact checkpoint

Original Cloud artifact directory: `/workspace/artifacts/sc-preorder-roles-r3-2026-11-15/`.

- `SC-Preorder-Three-Roles-R3.png` / `.pdf`: ten-scene flow with corrected young CEO.
- `StockDay-Preorder-R3.html`: self-contained synthetic review, no network/API calls.
- `StockDay-Preorder-R3-Review.pdf`: reviewed CEO, HQ and mobile screens.
- `SC-Preorder-Three-Roles-R3-Review.zip`: 3,807,931 bytes, SHA-256 `dd96d4296bfcc6cc1adc5ad3c192f60927c6d3dd72243b3e921a8ae8868f0ddb`.
- `DELIVERY.json`, `REVIEW-CHECKS.json`, focused test/build logs and exact `WEB-PREPARATION.patch` distinguish proof from pending work.

Artifact paths are checkpoints on the original machine. A different Cloud executor may not have these files. Code/architecture can be recovered from PR #100 and the copies under [reference/](reference/). Missing image/mockup files are not a reason to discard or redesign the existing implementation. Do not assume this ledger has published private media to GitHub; it has not.
