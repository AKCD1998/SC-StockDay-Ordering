# Shared checkpoint — 15 November 2026 (Bangkok)

Status: **LEDGER_PREPARED / PREORDER_CHAT_NOT_YET_CLAIMED**. This file records verified source/artifact checkpoints, not a fresh production-service health check.

## Ownership admission

| Workstream | Owner | Admission |
|---|---|---|
| SCPDA smartphone app | Existing PDA chat | Active; retained |
| Preorder business domain, web and domain API | New branched Preorder chat | Ready for handoff; no new chat created/messaged or ownership claim received yet |
| Shared mobile ↔ preorder interface | Both owners, contract changes recorded here | Business roles confirmed; new API contract still proposed |

Do not invent thread IDs. The current tools do not expose a create/fork/message-other-chat operation. The user must open/branch the destination chat through their client, then that chat records its actual admission.

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
| Review | [Draft PR #100](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/100); not merged or deployed by this work |
| Feature flag | `VITE_FEATURE_PREORDER_ROLE_WORKSPACE=false` by default; no runtime flag changed |
| Backend source inspected for R3 | Available local checkout `40ef239a43b7ba2104376aad296242b062ba28d1`; not a claim about today's live revision |
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
