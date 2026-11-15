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

## Product, time and count invariants retained from PDA work

- Barcode/SKU are exact strings, including leading zeros. Unknown pack identity/factor stays unknown; never infer conversion from name/price or substitute missing factor 1.
- Null, zero and negative reference stock are distinct. Production mobile scan's inspected basis is Full Sync and it does not supply stock observation time; price timestamps or fetch time are not stock observation time.
- Independent stocktake rounds compare; do not add recounts. Preorder requested/ordered quantities are not physical counted stock or official Ada adjustments.
- Dates retain actual precision; do not invent a day. Missing label information is allowed. Do not use estimated FEFO/hourly data as an actual count.
- Client observation, server receipt and source-document times are separate. Offline upload does not relabel a stale observation as current.

## Existing source evidence, not today's runtime proof

The inspected preorder backend has authenticated web-session routes under `/api/customer-preorders` for cases, quotes, customer decisions, mark-ordered, case-level branch arrival/notification/completion, messages/photos, receipt/transfer evidence links and ETA. Its available source uses admin/staff checks.

The inspected mobile enrollment/scan routes under `/api/mobile` and lookup alias `/api/pda` are separate. Do not assume the web preorder routes already accept mobile Bearer tokens. Do not invent a production PIN or refresh-token contract. Consult earlier verified mobile handoff and inspect current source/runtime before integration. The prior report of CORS rejection is not fixed by this ledger.

## Proposed, not accepted as deployed

PR #100's gated UI and backend draft PR #61 propose `GET /api/customer-preorders/workspace` with version **`sc-preorder-three-role-r3-v1`**, `subjectUserId`, `workRole` (`purchasing`/`fulfillment`/`branch`), branch scope and capabilities. PR #61 adds server profiles, the manifest endpoint, capability checks and fulfillment-safe case DTOs. Its source config example is `PREORDER_WORKSPACE_PROFILES=subject=purchasing;subject=fulfillment;subject=branch:001`; the feature flag defaults off. Neither PR is merged/deployed or accepted as a shared mobile contract. Missing/unknown/mismatched admission fails closed; never grant Boom global admin to bypass it.

### Proposed physical HQ receipt delta — PR #61, not accepted

The backend branch proposes `POST /api/customer-preorders/cases/:publicId/items/:itemId/receipt-verifications` for the `receipts.physical.record` capability. The body has `expectedVersion`, `expectedBatchVersion`, `quantity` (up to 4 decimal places), exact `unit`, timezone-explicit `observedAt`, `idempotencyKey`, and a source approved-receipt reference (`sourceBranch`, `docNo`, `seqNo`); `reason` is required for corrections and counts above document quantity. The response includes `receiptEventId`, `quantity`, `unit`, `observedAt`, resulting case/batch versions and whether the request was replayed.

Migration `080_add_preorder_hq_physical_receipts.sql` proposes a source-line batch/current count plus append-only `COUNTED`/`CORRECTED` events with actor, time, version chain, idempotency key and payload hash. Fulfillment allocation is limited to the current physical quantity and exact unit; a correction cannot lower it below active allocations. The migration is present in draft PR #61 for review only and has not been applied. This does not write Ada/POS inventory.

This delta does not provide mobile authentication, dispatch/transfer counts, branch physical receipt or customer handover. Multi-shipment and partial quantity lifecycle remain pending. No phone client should call the proposed web-cookie route until the PDA owner reviews and an approved mobile adapter/transport is agreed. The web/API branch is a review artifact, not evidence of live staging behavior.

Authentication/enrollment, private photo handling and offline cold-reopen must be validated against an approved reachable staging service before a mobile production-ready claim. Component tests and a local mockup do not replace a UI → API → durable store → receipt → another-client/restart proof.

## Change record protocol

For a material shared change, add a new event with: ID, proposer/owner, current version, proposed change, affected clients/services, compatibility/migration implications, implemented/tested/stub/pending status, source SHAs and evidence. Record the other owner's actual review when received. A sent message, elapsed time, file creation or user liking a picture is not technical API acceptance. Preserve prior records; supersede rather than erase.

Production deployment, schema migration, permission/account/CORS changes, added costs and official inventory writes remain outside this coordination action. Prepare reviewable code first and record the smallest real gate instead of inventing approval or bypassing a denial.
