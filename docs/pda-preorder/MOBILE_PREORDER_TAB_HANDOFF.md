# SCPDA Preorder bottom-tab handoff

**Status:** user-requested for the next SCPDA app update. The navigation direction is confirmed; mobile API/auth and the wider preorder lifecycle are not yet accepted or released.

## Current app baseline — PDA-owner R9 acknowledgment

- Current delivered build: [SCPDA 0.5.1-test.9.apk](https://drive.google.com/file/d/1G32jeACScvq_v2frMB7bvykuY8EKbFWu/view?usp=drivesdk), 15 November 2026. PDA source `codex/pda-price-info-r9`, `6cd7d160fa928c9c98ce0b696387885b214f7769`.
- Three bottom tabs now exist. Count and catalog price-check screens use the existing reader; Preorder is an honest pending panel until the mobile auth/domain adapter is accepted. No mock customer cases or role picker are shipped.
- The prior 0.4.1-test.5 baseline had no bottom tabs. Count submission remains subject to the existing separate production activation boundary. Preserve on-device counts, enrollment, source/time semantics and preorder isolation.

## Confirmed navigation direction

The latest user request adds **เช็คราคา** as a third persistent tab. It supersedes the original two-tab shell:

```text
┌────────────────────────────────────────┐
│              Active screen             │
├─────────────┬──────────────┬─────────────┤
│  นับสต๊อก   │  พรีออเดอร์ │   เช็คราคา  │
└─────────────┴──────────────┴─────────────┘
```

- **เช็คราคา:** existing catalog IC/630 identity, full Thai name, recorded unit prices and current reader stock/time. It creates no customer inquiry and remains distinct from the request mode **สอบถามราคา**. R9 still reads Full Sync; reviewed PDA current-balance selection needs a separate server contract.
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

Use the full-width search input for company item code (`IC-…`), legacy code (`630…`), Thai/English product name or barcode. Place a high-contrast barcode icon button inside the input's right edge. Typing filters visible suggestions dynamically; tapping **ตกลง** opens the full product picker with its editable live-filter search. Show Thai display names, allow long names to wrap and let rows grow to fit. Put **ตกลง** and **＋ สินค้าใหม่** side by side in two equal-height columns: blue and SC yellow. Keep the example-query chips on one horizontally scrollable row. Include examples users can try, such as `สินค้า A`, `Product B`, `IC-002`, `630003` and a sample barcode.

**สินค้าใหม่** opens a form with image upload/camera capture and a trade-name field. On **ยืนยัน**, show a brief loading state while looking for a name match in ADA Software. If there is a likely match, show its Thai name, item code, barcode, price and stock, then ask whether this is the intended item. If confirmed, reuse that existing item and discard the proposed new-item image. If it is not the same item or no match exists, let the user add an unregistered item line to this request and mark it for central review. A branch submission must not create an ADA master item directly. An authorized product-data owner should check duplicates and create or map the permanent ADA item, then synchronize its identity to SCPDA before normal stock receipt/allocation.

Allow multiple catalog or unregistered item lines in one request. Show the pending item and committed item lines under a single **รายการที่เลือก** heading. Put an accessible trash-can action on the pending item and each added line; the employee can remove individual lines before review. The selected list supports repeated searches and additions; the review screen shows every selected item and quantity.

The local preview simulates search, live filtering, the matching-item prompt, multiple line items and new-item draft. Its catalog records and ADA lookup are fixtures only; file selection stays in browser memory and no image, product or request is sent to ADA.

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

## ADA receipt notice, CEO product review and HQ allocation (user direction, 15 November)

The supplied StockDay Admin screenshot shows the existing **ใบรับสินค้า** work area, including **รออนุมัติ** and **CEO กดอนุมัติแล้ว** views and receipt-document rows. It establishes that a receipt-document workflow exists; it does not establish a webhook, event feed, write API, product-master contract, or the exact meaning of the placeholder labels. The ADA rebuild agent was not interrupted. Cross-thread send/handoff tools were unavailable in this runtime, and the read-only material available did not establish those API details.

Proposed end-to-end flow:

1. Warehouse staff continue entering the supplier receipt once in the authorized ADA process. SCPDA should notify when the receipt is first saved, including its current approval status; a **รออนุมัติ** notice is visible but cannot be allocated. A later CEO approval event updates that same receipt line and can unlock physical verification/allocation. The notice carries ADA document/line ID, item identity, quantity/unit, approval state and source timestamp. Deduplicate by stable source document/line identity and event version.
2. The notice opens the matching HQ case in SCPDA. The HQ receiver attaches a physical photo and records the counted quantity; optional lot, manufacture and expiry data can be expanded. This is a verification/allocation record tied to the ADA document. It must not add the same receipt quantity to ADA a second time.
3. Compare the physical count with the approved ADA line. If they differ, show an exception and hold allocation until an authorized reconciliation or release. Do not silently overwrite ADA stock or allocate more than the reconciled, unreserved physical quantity.
4. When the item is a temporary entry such as **ทบทวน**, **สินค้าใหม่** or another placeholder, mark its product identity **รอ CEO ระบุชื่อ/ตรวจรายการซ้ำ**. Keep it out of ordinary allocation until a permanent ADA identity has been confirmed. The exact placeholder vocabulary and ADA product states have not been verified from source.
5. An authorized CEO account on the existing web or SCPDA mobile app opens the review card, inspects the branch's label photo/trade name and searches ADA by stable identifiers. If it is an existing item, map to that product; if it is genuinely new, complete/update the provisional ADA master record through an authorized ADA operation. Do not create a second catalog item just because display-name matching is ambiguous.
6. Show success only after ADA returns an acknowledged canonical item ID/code and master-data version. Then bind that ID to the request and receipt line and publish the acknowledged mapping to the HQ/branch queues. If ADA is unreachable, keep the item **รอ ADA ยืนยัน** with a retryable audit record; do not show it as created or allocate it under the temporary identity.
7. After identity, receipt and quantity are reconciled, fetch every eligible outstanding request line for that canonical item: Preorders and only price inquiries the customer accepted. Exclude canceled/declined, pending price response, completed/previously allocated quantities. Display branch, request ID/type, creation time, requested/outstanding quantity and unit. Order oldest first with a stable request/line ID tie-breaker.
8. Preview the complete allocation before committing. If stock covers all outstanding quantities, offer **เลือกทั้งหมด**; otherwise allocate FIFO, allowing a clearly labeled partial amount on the oldest line and leaving the remainder/younger lines waiting. The server must atomically recheck remaining stock and outstanding requests so concurrent HQ users cannot double-allocate. Treat leftover quantity as unallocated HQ stock.
9. On commit, publish branch status from the saved allocation event: **รับเข้า HQ → จัดสรรแล้ว/บางส่วน → รอจัดส่ง**. Notify each affected branch from the server-confirmed event. Do not tell it the goods reached the branch until a separate dispatch and branch-receipt event is recorded. Repeat allocation per canonical item/unit when one supplier document contains multiple products.

The mockup shows the ADA-document notice, HQ count/photo and optional lot capture, FIFO preview, and a separate CEO product-review view. Its role switch is a design aid only; production screens must derive from server-issued capabilities. The displayed receipt number/status, rows and ADA success response are fixtures. No ADA/SCCRM/SCPDA notification, master-data write, photo upload or allocation is connected. ADA's actual API, approval semantics, mandatory product fields, stable item IDs and placeholder codes need read-only confirmation before choosing the integration adapter.

## Integration gates

1. Backend draft [PR #61](https://github.com/AKCD1998/PaaSRTSM-project/pull/61) still uses web-session authentication. Agree and implement an approved SCPDA registered-device auth adapter before the Preorder tab makes real API calls. Do not reuse a web cookie or treat the existing PDA PIN as a new bearer-token contract.
2. The proposed workspace manifest and physical-HQ receipt endpoint in PR #61 remain draft; migration 080 has not been applied. Keep role admission and all real writes disabled until policy review and staging acceptance.
3. Make the server return a request ID, version and durable receipt for submitted actions. Keep an idempotency key with the pending action across offline/restart retries; show “ยังไม่ส่ง” separately from server-confirmed status.
4. The current backend proposal does not implement dispatch/transfer, branch physical receipt, customer handover or the full multi-shipment/partial-quantity lifecycle. Keep those actions hidden until their separate APIs and events exist.
5. Test the bottom bar with Android back navigation, keyboard, scan overlay and system safe area; changing tabs must not clear a count or preorder draft.
6. ADA receipt-event consumption, source-document deduplication, temporary-product reconciliation, CEO master-data authorization/acknowledgement, mismatch hold/release, and atomic FIFO allocation are not in PR #61. Define and review these contracts from ADA source/API evidence before enabling any real notification or write.

The user's navigation request is recorded in [event 005](events/2026-11-15-005-mobile-preorder-tab-request.md), member-lookup and cross-system sync in [event 006](events/2026-11-15-006-mobile-member-lookup-sync.md), initial mode request in [event 007](events/2026-11-15-007-preorder-vs-price-inquiry.md), Thai-label/mock-simulation refinement in [event 008](events/2026-11-15-008-thai-label-member-simulation.md), corrected mode paths and cancel interaction in [event 009](events/2026-11-15-009-corrected-mode-flow-and-cancel.md), catalog search/new-item handling in [event 010](events/2026-11-15-010-product-lookup-and-unregistered-items.md), revised search controls/live sample search in [event 011](events/2026-11-15-011-product-search-layout-and-live-results.md), multiple item selection/removal details in [event 012](events/2026-11-15-012-multiple-request-items-and-selection-cleanup.md), and ADA receipt/product-review/FIFO direction in [event 013](events/2026-11-15-013-ada-receipt-notice-product-review-and-fifo.md). Event 009 supersedes event 007's flow interpretation; event 011 supersedes event 010's scanner/button placement detail; event 012 supersedes earlier single-item assumptions. Direct cross-thread messaging is unavailable; the PDA owner should read this handoff in the common ledger. This records the user's request, not the PDA owner's implementation acknowledgment.
