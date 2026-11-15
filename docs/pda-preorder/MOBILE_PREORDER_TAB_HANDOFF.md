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
- Product search accepts company/legacy codes, Thai or English product names and barcodes. Keep barcode scanning as a separate action from search confirmation. Only add the exact selected catalog SKU to the request; do not submit or count it implicitly. No label OCR is part of this feature.

### Customer member lookup and creation (user-confirmed UX, 15 November)

On the branch request form, show **เบอร์ติดต่อ** first and place an orange **เช็คสมาชิก** action inside the right side of that input. Keep the phone value in place after a lookup or customer selection. A member match fills **ชื่อลูกค้า** and makes that field read-only; show the name without a redundant success/explanation line. Pressing **เช็คสมาชิก** again reruns the lookup and reopens selection so staff can replace a mistaken match.

- One match: fill and lock the member name.
- Multiple members on the same number: open a selection popup with a dropdown. Selecting one fills and locks the name while preserving the entered phone number.
- No match: show **“ไม่พบสมาชิก สร้างลูกค้าใหม่?”** with **ตกลง / ยกเลิก**. Cancel returns to the unchanged form. Confirm preserves the phone number and unlocks the name field.
- In new-member mode, the primary action reads **“ต่อไป · เลือกสินค้า + เพิ่มสมาชิกใหม่”**. It opens a second confirmation **“ยืนยันสร้างสมาชิกใหม่?”** with **ตกลง / ยกเลิก**. Cancel creates no record; confirm starts the create-and-sync flow.

The requested propagation path starts with SCCRM member creation, delivery to ADA Software, then synchronized member data in SCCRM, ADA Software and SCPDA on every branch phone. Show the member ID and each system's acknowledged sync state; do not claim all devices are current until their sync acknowledgements arrive. The mobile lookup/create endpoint, SCCRM-to-ADA field/identity contract, duplicate handling, durable retries and registered-device auth are still pending. The local mockup shows the supplied matching-member example and a no-match/new-member path; it does not query or write CRM data.

### Product lookup and unregistered items (user-confirmed UX, 15 November)

Use the full-width search input for company item code (`IC-…`), legacy code (`630…`), Thai/English product name or barcode. Place a high-contrast barcode icon button inside the input's right edge. Typing filters visible suggestions dynamically; tapping **ตกลง** opens the full product picker with its editable live-filter search. Show Thai display names, allow long names to wrap and let rows grow to fit. Put **ตกลง** and **＋ สินค้าใหม่** side by side in two equal columns: blue and SC yellow. Include examples users can try, such as `สินค้า A`, `Product B`, `IC-002`, `630003` and a sample barcode.

**สินค้าใหม่** opens a form with image upload/camera capture and a trade-name field. On **ยืนยัน**, show a brief loading state while looking for a name match in ADA Software. If there is a likely match, show its Thai name, item code, barcode, price and stock, then ask whether this is the intended item. If confirmed, reuse that existing item and discard the proposed new-item image. If it is not the same item or no match exists, let the user add an unregistered item line to this request and mark it for central review. A branch submission must not create an ADA master item directly. An authorized product-data owner should check duplicates and create or map the permanent ADA item, then synchronize its identity to SCPDA before normal stock receipt/allocation.

The local preview simulates search, live filtering, the matching-item prompt and new-item draft. Its catalog records and ADA lookup are fixtures only; file selection stays in browser memory and no image, product or request is sent to ADA.

### Per-request mode: พรีออเดอร์ or สอบถามราคา (corrected flow, user-confirmed 15 November)

Place a switch in the create-request heading row so a staff member can choose **พรีออเดอร์** or **สอบถามราคา** before submitting. Persist this as the request's category in the server record and route it to the matching queue and state transitions; changing the screen color alone is not sufficient. Use stable, distinct page accents and show the category in the request list, detail and review so the type is recognizable at a glance. Once created, keep the selected category with the request and derive its later screens from that stored value.

- **พรีออเดอร์:** six stages: รายการคำขอ → สร้างคำขอ → เพิ่มสินค้า → ตรวจและส่ง → ติดตามสถานะ → รับจริงและจัดสรร. It does not include a `ตอบราคา` stage.
- **สอบถามราคา:** first six stages: รายการคำขอ → สร้างคำขอ → เพิ่มสินค้า → ตรวจและส่ง → ติดตามสถานะ → ตอบราคา. If the customer does not want it, close the request there. If the customer wants it, continue with two conditional stages: ติดตามสถานะ → รับจริงและจัดสรร. Keep this path linked to the original inquiry request.
- Renumber visible stages for each path so Preorder still ends at step 6; after an accepted price inquiry, show all 8 stages. Use the selected category to drive the list, queue, lifecycle and page accent.

The switch, accent changes, review label, conditional stages and accept/end choice are represented in the local preview. The accepted request type enum/field, authorization, separate queue routing and API lifecycle still need implementation. Do not silently convert a price inquiry into a Preorder; require an explicit later action if that product transition is needed.

### Cancel from the request list (user-confirmed UX, 15 November)

Swipe a request row to the right to reveal the red **ยกเลิกคำสั่งซื้อ** action. Pressing it opens a password prompt; a wrong password blocks progress. A correct password closes that prompt and opens **ต้องการยกเลิกคำสั่งซื้อ?** with **ไม่ยกเลิก** and **ยืนยันยกเลิก**. Choosing **ไม่ยกเลิก** returns to the ordinary list with the request unchanged. Choosing **ยืนยันยกเลิก** opens a required reason field; do not allow confirmation without a reason. The local preview uses a test-only password and updates only its sample row. Production must validate authorization securely and record the cancellation reason and audit details in the server request; the prototype is not a security or cancellation API.

## Role-aware พรีออเดอร์ content

| Server profile | พรีออเดอร์ tab content |
|---|---|
| Branch | Create a request, review its returned request ID, see branch-scoped requests, provide missing information, and follow the timeline. For price inquiry, record the customer's choice after `ตอบราคา`; continue to fulfillment only after acceptance. |
| HQ fulfillment | See accepted/order cases, record an actual physical HQ count separately from the imported receipt document, and allocate only verified remaining quantity. Add dispatch actions only after separate dispatch events are implemented. |
| Purchasing / CEO | Keep detailed quote, price and purchase work primarily in the existing web queue; mobile may show a read-only summary/next actions if requested by product design. |

No role can mark customer handover merely because an item was scanned, counted locally or received at HQ. Use the same server-issued case/item IDs on mobile and web.

## Integration gates

1. Backend draft [PR #61](https://github.com/AKCD1998/PaaSRTSM-project/pull/61) still uses web-session authentication. Agree and implement an approved SCPDA registered-device auth adapter before the Preorder tab makes real API calls. Do not reuse a web cookie or treat the existing PDA PIN as a new bearer-token contract.
2. The proposed workspace manifest and physical-HQ receipt endpoint in PR #61 remain draft; migration 080 has not been applied. Keep role admission and all real writes disabled until policy review and staging acceptance.
3. Make the server return a request ID, version and durable receipt for submitted actions. Keep an idempotency key with the pending action across offline/restart retries; show “ยังไม่ส่ง” separately from server-confirmed status.
4. The current backend proposal does not implement dispatch/transfer, branch physical receipt, customer handover or the full multi-shipment/partial-quantity lifecycle. Keep those actions hidden until their separate APIs and events exist.
5. Test the bottom bar with Android back navigation, keyboard, scan overlay and system safe area; changing tabs must not clear a count or preorder draft.

The user's navigation request is recorded in [event 005](events/2026-11-15-005-mobile-preorder-tab-request.md), member-lookup and cross-system sync in [event 006](events/2026-11-15-006-mobile-member-lookup-sync.md), initial mode request in [event 007](events/2026-11-15-007-preorder-vs-price-inquiry.md), Thai-label/mock-simulation refinement in [event 008](events/2026-11-15-008-thai-label-member-simulation.md), corrected mode paths and cancel interaction in [event 009](events/2026-11-15-009-corrected-mode-flow-and-cancel.md), catalog search/new-item handling in [event 010](events/2026-11-15-010-product-lookup-and-unregistered-items.md), and the revised search controls/live sample search in [event 011](events/2026-11-15-011-product-search-layout-and-live-results.md). Event 009 supersedes event 007's flow interpretation; event 011 supersedes event 010's scanner/button placement detail. Direct cross-thread messaging is unavailable; the PDA owner should read this handoff in the common ledger. This records the user's request, not the PDA owner's implementation acknowledgment.
