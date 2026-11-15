# SCPDA Preorder bottom-tab handoff

**Status:** user-requested for the next SCPDA app update. The navigation direction is confirmed; mobile API/auth and the wider preorder lifecycle are not yet accepted or released.

## Current app baseline

- Latest file observed in the user's `เภสัชอู๋ / pdaAppProject` Drive folder: [SCPDA 0.4.1-test.5.apk](https://drive.google.com/file/d/1advJ-GvP1L7cRXU5FdB_G1UBVktsq2fp/view?usp=drivesdk), delivered 15 November 2026.
- Its in-app UI exposes StockDay product lookup by camera or scanner/manual barcode, local count history, product/lot count entry and account/settings. There is no bottom navigation or Preorder screen yet.
- The setup note says count submission is present in this APK build but production acceptance is still gated. Existing on-device and local-only count data must remain separate from Preorder requests and receipts.

## Confirmed navigation direction

Add two persistent bottom tabs in the same app:

```text
┌────────────────────────────────┐
│           Active screen        │
│                                │
├────────────────┬───────────────┤
│   นับสต๊อก      │   พรีออเดอร์  │
└────────────────┴───────────────┘
```

- **นับสต๊อก:** retain the current scanner, product lookup, count entry and count history.
- **พรีออเดอร์:** provide the user's preorder inbox, request creation, status and next action. Keep its local draft, server request ID and timeline separate from count drafts/receipts.
- Keep account/settings in the current header control. Keep the scanner as the first/default tab for the current branch-reader use case. Show independent pending badges on each tab.
- Use the same bottom bar for branch and HQ accounts; render the tab contents/actions from authenticated server capabilities. Do not add a local role selector.
- When a camera scan resolves a catalog item, offer an explicit “เพิ่มในพรีออเดอร์” action. Copy the exact SKU and unit snapshot into the request draft; never submit or count it implicitly. Unknown items remain an explicit freeform request. No label OCR is part of this feature.

### Customer member lookup and creation (user-confirmed UX, 15 November)

On the branch request form, show **เบอร์ติดต่อ** first and place an orange **เช็คสมาชิก** action inside the right side of that input. Keep the phone value in place after a lookup or customer selection. A member match fills **ชื่อลูกค้า** and makes that field read-only; show the name without a redundant success/explanation line. Pressing **เช็คสมาชิก** again reruns the lookup and reopens selection so staff can replace a mistaken match.

- One match: fill and lock the member name.
- Multiple members on the same number: open a selection popup with a dropdown. Selecting one fills and locks the name while preserving the entered phone number.
- No match: show **“ไม่พบสมาชิก สร้างลูกค้าใหม่?”** with **ตกลง / ยกเลิก**. Cancel returns to the unchanged form. Confirm preserves the phone number and unlocks the name field.
- In new-member mode, the primary action reads **“ต่อไป · เลือกสินค้า + เพิ่มสมาชิกใหม่”**. It opens a second confirmation **“ยืนยันสร้างสมาชิกใหม่?”** with **ตกลง / ยกเลิก**. Cancel creates no record; confirm starts the create-and-sync flow.

The requested propagation path starts with SCCRM member creation, delivery to ADA Software, then synchronized member data in SCCRM, ADA Software and SCPDA on every branch phone. Show the member ID and each system's acknowledged sync state; do not claim all devices are current until their sync acknowledgements arrive. The mobile lookup/create endpoint, SCCRM-to-ADA field/identity contract, duplicate handling, durable retries and registered-device auth are still pending. The local mockup shows the supplied matching-member example and a no-match/new-member path; it does not query or write CRM data.

### Per-request mode: พรีออเดอร์ or price inquiry (user-confirmed UX, 15 November)

Place a switch in the create-request heading row so a staff member can choose **พรีออเดอร์** or **สอบถามราคา** before submitting. Persist this as the request's category in the server record and route it to the matching queue and state transitions; changing the screen color alone is not sufficient. Use stable, distinct page accents and show the category in the request list, detail and review so the type is recognizable at a glance. Once created, keep the selected category with the request and derive its later screens from that stored value.

- **พรีออเดอร์:** retains the customer-facing quote and exact-version customer decision steps; an accepted request can continue through purchase/fulfillment.
- **สอบถามราคา:** routes to an internal price inquiry queue and returns its result to staff. Do not send a quotation to the customer, add customer accept/reject steps, or require the CEO to key in a price to ask whether the customer wants to buy. This category is for asking/checking price before an order.

The switch, accent changes, review label and mode-specific flow are represented in the local preview. The accepted request type enum/field, authorization, separate queue routing and API lifecycle still need implementation. Do not silently convert a price inquiry into a Preorder; require an explicit later action if that product transition is needed.

## Role-aware พรีออเดอร์ content

| Server profile | พรีออเดอร์ tab content |
|---|---|
| Branch | Create a customer request, review its returned request ID, see branch-scoped requests, provide missing information, record a decision against an exact quote version, and follow the case timeline. |
| HQ fulfillment | See ordered cases, record an actual physical HQ count separately from the imported receipt document, and allocate only verified remaining quantity. Add dispatch actions only after separate dispatch events are implemented. |
| Purchasing / CEO | Keep detailed quote, price and purchase work primarily in the existing web queue; mobile may show a read-only summary/next actions if requested by product design. |

No role can mark customer handover merely because an item was scanned, counted locally or received at HQ. Use the same server-issued case/item IDs on mobile and web.

## Integration gates

1. Backend draft [PR #61](https://github.com/AKCD1998/PaaSRTSM-project/pull/61) still uses web-session authentication. Agree and implement an approved SCPDA registered-device auth adapter before the Preorder tab makes real API calls. Do not reuse a web cookie or treat the existing PDA PIN as a new bearer-token contract.
2. The proposed workspace manifest and physical-HQ receipt endpoint in PR #61 remain draft; migration 080 has not been applied. Keep role admission and all real writes disabled until policy review and staging acceptance.
3. Make the server return a request ID, version and durable receipt for submitted actions. Keep an idempotency key with the pending action across offline/restart retries; show “ยังไม่ส่ง” separately from server-confirmed status.
4. The current backend proposal does not implement dispatch/transfer, branch physical receipt, customer handover or the full multi-shipment/partial-quantity lifecycle. Keep those actions hidden until their separate APIs and events exist.
5. Test the bottom bar with Android back navigation, keyboard, scan overlay and system safe area; changing tabs must not clear a count or preorder draft.

The user's navigation request is recorded in [event 005](events/2026-11-15-005-mobile-preorder-tab-request.md), member-lookup and cross-system sync in [event 006](events/2026-11-15-006-mobile-member-lookup-sync.md), request-mode separation in [event 007](events/2026-11-15-007-preorder-vs-price-inquiry.md), and Thai-label/mock-simulation refinement in [event 008](events/2026-11-15-008-thai-label-member-simulation.md). Direct cross-thread messaging is unavailable; the PDA owner should read this handoff in the common ledger. This records the user's request, not the PDA owner's implementation acknowledgment.
