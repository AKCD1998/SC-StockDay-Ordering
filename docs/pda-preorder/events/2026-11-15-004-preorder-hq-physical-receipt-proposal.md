# Event 004 — Preorder API and physical HQ receipt proposal prepared

- Date: 2026-11-15 (Bangkok)
- Proposer/owner: Preorder web/domain API owner in the user-identified destination chat.
- Current shared contract: `R3-COORD-1`; this event records a proposal only and does not accept a mobile API contract.
- PDA owner status: ownership admission was acknowledged through canonical ledger commit `20ef7cf`. No direct cross-chat message was sent or claimed; this does not imply review/acceptance of the API delta below.

## Review artifacts

- Web repo `AKCD1998/SC-StockDay-Ordering`: branch `codex/preorder-three-role-readiness`, head `7b7c1f63e25b33e7c7b2b3c31e3e3721869a2183`, based on main `d6017807eaed1815f871c95d74db21929d123fad`; [draft PR #100](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/100), open and unmerged.
- Backend repo `AKCD1998/PaaSRTSM-project`: branch `codex/preorder-hq-physical-receipt`, head `4ae69908ef1d690432ce01a04aadc6abb7411f9e`, based on main `46985c97491529311ccaa4366ab5905b2c4759fc`; [draft PR #61](https://github.com/AKCD1998/PaaSRTSM-project/pull/61), open and unmerged.
- Migration `080_add_preorder_hq_physical_receipts.sql` was checked against current main immediately before push: local highest 080, remote highest 079. It is for review only; not applied.

## Proposed API delta

Backend PR #61 proposes server-authenticated `GET /api/customer-preorders/workspace` under contract version `sc-preorder-three-role-r3-v1`, with profiles sourced from server configuration and action capabilities enforced by the API. Fulfillment receives only operational case fields. Branch profiles are bound to the authenticated branch and mapped to existing staff workflow behavior only within that profile.

For physical HQ receipt, the proposed route is:

`POST /api/customer-preorders/cases/:publicId/items/:itemId/receipt-verifications`

It requires fulfillment capability `receipts.physical.record` and an expected case version, expected receipt-batch version, nonnegative quantity, exact explicit unit, timezone-explicit observation time, idempotency key, and approved HQ receipt line reference. A correction or count above the document quantity requires a reason. A replay with the same actor/key/payload returns the original event even after the case's current status changes.

The proposed migration stores a mutable current quantity per approved receipt line and append-only `COUNTED`/`CORRECTED` facts with actor, observed/recorded times, case/batch versions, correction chain, idempotency key and payload hash. Fulfillment allocation requires physical count first, exact unit, and cannot exceed verified remaining quantity. Lowering a physical count below active allocations is rejected. This records preorder operational evidence only; it does not write Ada/POS inventory.

The web draft retains the idempotency request across page reopen and gates allocation until physical quantity exists. Both frontend/backend role-workspace flags default off. No environment/profile, account, permission, production DB, app, deployment or official inventory change was made.

## Scope still pending

- The API delta is not reviewed/accepted by the PDA owner or authorized for mobile use. Mobile authentication and transport adapter remain undefined.
- Transfer/dispatch facts, branch physical receipt, customer handover, multi-shipment and partial quantity lifecycle are not implemented in these PRs.
- No approved staging service or second-client/restart roundtrip was tested. The feature must remain disabled until contract review, role provisioning and staging acceptance.
- Earlier PR #100 tests/build and synthetic mockup checks predate these continuation commits. No tests were run for web `7b7c1f6` or backend `4ae6990`; `git diff --check` passed for both.

Do not merge, enable flags, apply migration or claim phone integration from this event.
