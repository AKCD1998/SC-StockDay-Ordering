# Preorder R3 — CEO / HQ fulfillment / branch

Updated 15 November 2026 (Bangkok). This corrects the 13 November design: Boom is the HQ receiving/dispatch operator. The CEO decides availability, sale price and purchasing. The new CEO cartoon follows the supplied photograph and approximate age 37–40; the portrait is not added to repository/runtime assets.

## Work allocation

| Role | Responsible for | Must not silently perform |
|---|---|---|
| CEO / purchasing, using the CEO's admin account | Identify the exact product and unit, answer availability, publish/version customer sale prices, order after customer acceptance, decide substitutions/shortages/cancellation exceptions | Treat an order as physical receipt; mark the branch's actual receipt/customer handover for them |
| Boom / HQ fulfillment, dedicated business permissions | Follow up goods ordered by CEO, record physical HQ checks, associate receipt evidence, allocate stock to requests, plan branch/date/round, record actual dispatch with transfer evidence, follow shortages | Publish/change prices, approve purchasing, grant own privileges, mark customer acceptance/branch receipt/POS sale |
| Branch staff, own branch only, mobile-first | Submit the customer's request, provide missing details, record customer acceptance of a specific quote, count branch receipts, contact customer, record actual handover after normal POS work | Change sale price, order from suppliers, edit another branch, close a request merely because HQ received or dispatched goods |

The CEO can review the complete chain. Exceptional corrections use a reason and a new event; administrative oversight does not mean rewriting another person's confirmation. Boom sees operational SKU/unit/quantity/reference/destination information. Customer contact/internal purchasing details require a business need and server-side field filtering, not merely hidden HTML.

## One request shared by app and website

1. Branch submits the customer, contact, product/unit/quantity and optional product photos. Known catalog IDs retain exact barcode/SKU strings; unknown products keep the original description/photos until identity is reviewed. Photo attachment does not re-enable label OCR.
2. CEO checks availability and quotes a **customer sale price per explicit unit**, quantity, validity and terms. Cost and customer sale price are separate. Tax basis/unknown ETA must not be guessed.
3. Branch contacts the customer and records accepted/declined lines and quantities against that quote version.
4. CEO records actual ordering, supplier reference and a follow-up date. The order does not imply delivery or physical receipt.
5. Boom records what physically arrived at HQ and links the reviewed receipt evidence. Document import and physical count remain separate facts.
6. Boom explicitly allocates available goods to request lines, target branch and a planned dispatch date/round. One receipt may cover several requests; one request may use several receipts.
7. Boom records the shipment when actually sent, with transfer references. A plan is not a dispatch, and dispatch is not branch receipt. A shipment may contain several requests; a request may have several shipments.
8. Branch checks the actual arriving quantity. Short, wrong or damaged goods open an issue, retaining the remaining quantity. Do not overwrite the count to match the document.
9. Branch contacts the customer through the existing phone/LINE channel and records the contact. Notification is not handover; no automatic LINE/push integration is claimed.
10. Normal POS sale happens through the existing process. Branch records actual handover and a POS reference when available. Close only when each accepted line is handed over or its remainder has an explicit approved cancellation/disposition.

The app, CEO queue and Boom queue address the same server-issued request and item IDs. No copying into Excel, duplicate customer case or separate mobile database of official orders is proposed.

## Quantity and exception rules

The request line tracks commercial commitments separately from physical movements. Keep accepted quantity, ordered quantities, actual HQ receipts, allocations, planned shipments, actual dispatches, branch receipts, handovers and cancellations distinct. Calculate each work queue from remaining quantities and next responsible role, rather than force a partially supplied case through one irreversible status enum.

Example: customer accepts 3 boxes; HQ receives 2 and sends 2; branch receives and hands over 2. **One box is still due**, so the request remains open. After HQ receipt but before customer handover, all 3 boxes are still not handed over; “one still due from supplier” and “three still not handed to customer” are different measures. A subsequent receipt/shipment can fulfil the remainder within the same request.

All quantities retain verified product identity and the exact unit. Never assume a missing factor is 1 or convert pack units from price/name. The interactive review uses integer boxes as a fixture, not a new company-wide numeric policy. Missing quantity is not zero. Document ambiguity, missing stock/time information and unmatched noncatalog items remain explicit uncertainty.

- Price/product/pack changes after acceptance require a new quote and renewed customer acceptance before additional purchasing. Preserve what was already ordered/received; do not retroactively rewrite it.
- Supplier shortages return a decision to CEO; Boom follows and records facts, rather than changing the commercial agreement. Supplier ETA and branch dispatch ETA remain separate estimates with source/update times.
- Cancellation after goods are purchased/allocated/received requires CEO review of disposition. Cancelling a case is not a financial reversal, physical return or Ada stock adjustment.
- Allocation must be transactional and prevent double allocation across requests. Planning/dispatch/receipt cannot exceed the eligible quantity at each step without a reviewed exception.
- Partial receipts, split shipments, wrong goods, damaged goods and customer no-show keep an owner, next action and follow-up date.
- Corrections are append-only with actor/role/branch/reason, original event reference and source evidence. Concurrent changes require version conflict review. Retries retain the same idempotency key and receive a server receipt; do not create duplicate orders/receipts after mobile cold-reopen.

## What exists and what is newly prepared

Source inspected read-only:

- Web `AKCD1998/SC-StockDay-Ordering`, fresh `origin/main` at `d6017807eaed1815f871c95d74db21929d123fad` on 15 November. Existing `preorders/` components and the existing top navigation/themes are reused.
- Available backend checkout at `40ef239a43b7ba2104376aad296242b062ba28d1`: `routes/customer-preorders.js`, `services/preorderWorkflow.js`, receipt/transfer evidence services and `auth/middleware.js`. This is local source evidence, not a 15 November production runtime assertion.
- Existing routes provide quotes, customer decisions, mark-ordered, case-level arrival/notification/completion, receipt links, transfer links and ETA. The inspected services use admin/staff checks. Dedicated Boom privileges, per-shipment physical receipt/handover events, partial-fulfillment counters and mobile auth admission for this domain are not verified as available live.

This branch prepares the **real web code**, without deploying it:

- New `VITE_FEATURE_PREORDER_ROLE_WORKSPACE=false` flag. With it off, the current PreorderPanel/API behavior remains; the proposed endpoint is never called.
- With it on, `PreorderRoleWorkspace` first requires the proposed authenticated server `GET /api/customer-preorders/workspace` manifest. Unknown/missing versions, wrong subject, wrong branch and missing read permission fail closed; the UI does not fall back to legacy administrator mode.
- Role-aware central/branch queues, action admission, internal-note visibility, SKU matching, receipt/transfer evidence editing and ETA controls. Logistics access is not represented by setting `isAdmin=true`. CEO purchasing and HQ logistics use separate capability allowlists. Branch confirmation is not granted to CEO merely because they are an administrator in the new workspace.
- The new role profile is not selected by a URL/local storage, a client username allowlist or the role selector in a mockup. The server must provision it through an accepted policy.

## Proposed workspace API contract — not deployed

```json
{
  "contractVersion": "sc-preorder-three-role-r3-v1",
  "subjectUserId": "authenticated-server-subject",
  "workRole": "purchasing | fulfillment | branch",
  "branchCode": "001 (branch role only)",
  "capabilities": ["cases.read.branch", "customer.decision"]
}
```

The route must be authenticated and derive subject, business role, branch and capabilities from server-controlled policy. It must not trust request-body/header/local-storage claims. Normal existing CSRF and per-action backend authorization remain mandatory. Server DTOs must omit disallowed customer/internal-price fields; UI hiding is not a data boundary.

Proposed purchasing capabilities: `cases.read.all`, `commercial.review`, `commercial.quote`, `commercial.order`, `commercial.unavailable`, `commercial.reopen`, `catalog.match`, `messages.send`, `messages.internal`.

Proposed HQ-document capabilities: `cases.read.all`, `receipts.link`, `transfers.link`, `eta.override`, `messages.send`. These expose existing evidence UI after server support; they **do not** assert physical HQ receipt or dispatch counts. The separate physical-event API/quantity model is still required.

Proposed branch capabilities: `cases.read.branch`, `cases.create`, `customer.decision`, `customer.info`, `branch.arrival`, `customer.notify`, `customer.complete`, `cases.cancel`, `messages.send`. Existing case-level actions must not be advertised for partial lines until the server enforces the new quantity/disposition rules.

The mobile app must use an approved mobile-auth adapter into this same service. Do not assume web-session cookies work as mobile Bearer credentials, invent a PIN/refresh contract, or bypass browser CORS. Product photos remain private attachments using existing storage patterns after auth is verified.

## Gates before enabling the new workspace

1. Accept/provision the server business-role policy and manifest contract; authorize every exposed action and filter response fields on the server. This branch makes no account, permission or environment changes.
2. Implement/review the separate physical quantity events and multi-shipment persistence, constraints, receipt/idempotency/version semantics and migration plan. No migration is created or applied here.
3. Verify app authentication, branch/product/unit identity, private photo upload, offline retries and round trips on an approved reachable staging service. Source/mockup/component tests do not prove live compatibility.
4. Review the concrete web/API changes and approve rollout. Keep the new flag off until these gates pass. The existing Render frontend auto-deploy behavior makes merging a release action; no merge/push to main is part of this work.

## Review artifacts

`/workspace/artifacts/sc-preorder-roles-r3-2026-11-15/` contains the corrected young-CEO workflow poster and an interactive, in-memory three-role example built from the existing StockDay header/navigation/CSS. Its role buttons are for reviewing the proposal, not logging into real accounts. It demonstrates partial supply in two rounds, quantity guards and the same request staying open; it does not execute backend auth or Ada/POS operations.

The real website changes are in `/workspace/reviews/sc-preorder-roles-r3-admin/`, branch `codex/preorder-three-role-readiness`. Build/test evidence and the exact patch/commit are included in the delivery package. Existing PDA theme/barcode/manual lot-date controls and the paused label OCR are not modified.
