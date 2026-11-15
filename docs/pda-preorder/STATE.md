# Shared checkpoint — 15 November 2026 (Bangkok)

Status: **PREORDER_CHAT_CLAIMED / ISOLATED_WORK_PENDING**. This file records verified source/artifact checkpoints, not a fresh production-service health check.

## Ownership admission

| Workstream | Owner | Admission |
|---|---|---|
| SCPDA smartphone app | Existing PDA chat | Active; retained |
| Preorder business domain, web and domain API | User-opened chat **เพิ่มฟีเจอร์ใหม่ในแอพและเว็บ** (`01a1dd34-c898-7689-a2a9-fe3f962c212d`; thread `6af923e6-aeb8-8191-8f37-c6ca3bacb094`) | Active owner admission recorded 15 Nov 2026; work remains isolated from PDA code |
| Shared mobile ↔ preorder interface | Both owners, contract changes recorded here | Business roles confirmed; new API contract still proposed |

Do not invent thread IDs. The actual destination thread and user message were verified with `read_thread`. No cross-thread messaging operation is callable, so no message to the PDA chat is claimed.

### User-identified destination (15 November)

The user supplied the existing destination chat **เพิ่มฟีเจอร์ใหม่ในแอพและเว็บ**:

`codex://threads/6af923e6-aeb8-8191-8f37-c6ca3bacb094?hostId=durable`

The current task is this verified destination chat. The attached executor is a different Cloud environment: `/workspace/Chavit` is the only local project checkout, on branch `work` at `de95067` with a clean worktree; no StockDay or PaaS checkout is present. GitHub read access confirmed the source branches and draft PR. A handoff is posted in [event 002](events/2026-11-15-002-destination-identified.md). Cross-thread delivery to the PDA chat remains unavailable; this admission does not claim PDA-owner acknowledgment. No replacement chat/agent was created.

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
| PDA branch source | `codex/pda-durable-demo`, `7018f122e757656ff7e8db9217e96ac427c63753`; label OCR entry removed |
| Current-recorded private PDA browser preview | `https://sc-stockday-pda-lab.scgroup1989-it.chatgpt.site/`, last published Site v14; manual fields/scanner tested on 13 Nov; synthetic browser-local counts, not a live preorder integration |
| Preorder preparation | `codex/preorder-three-role-readiness`, `69c78cdae320b202857d2978af4d709e9e859fd9` |
| Review | [Draft PR #100](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/100); freshly checked open/draft at head `69c78cdae320b202857d2978af4d709e9e859fd9`, base `d6017807eaed1815f871c95d74db21929d123fad`; not merged or deployed by this work |
| Feature flag | `VITE_FEATURE_PREORDER_ROLE_WORKSPACE=false` by default; no runtime flag changed |
| Backend source inspected for R3 | Available local checkout `40ef239a43b7ba2104376aad296242b062ba28d1`; not a claim about today's live revision |
| Current backend source ref | `AKCD1998/PaaSRTSM-project` `main` at `46985c97491529311ccaa4366ab5905b2c4759fc`; `AGENTS.md` read remotely; no local checkout yet |
| R3 tests | 8 workspace tests + 9 existing preorder helper tests + 4 navigation/session tests passed; admin-web production build passed with existing bundle-size warning |
| R3 review mockup | 17 browser checks; one synthetic request supplied in two rounds 2+1, 15 in-memory actions; not a durable API/database/auth proof |
| Installed APK | Not rebuilt or changed by the OCR pause/R3 preparation/ledger work; current physical-phone runtime not reverified |

## Implemented vs pending

Implemented in isolated web code: separate workspace admission, subject/branch binding, purchasing/logistics/branch capability allowlists, role-specific action/evidence/internal-note UI, no legacy-admin fallback when the new workspace contract is absent. When its flag is off, the existing preorder UI remains.

**Pending before enabling the new flow:**

1. Accepted authenticated server workspace manifest, provisioning of the dedicated HQ business role, server action authorization and field filtering.
2. Physical HQ/branch receipt, shipment planning/dispatch and customer handover quantities, partial supply, corrections, idempotency/version receipts and durable shared persistence. Existing receipt/transfer evidence links are not physical count events.
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
