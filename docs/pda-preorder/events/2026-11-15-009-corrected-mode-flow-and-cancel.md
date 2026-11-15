# Event 009 — Corrected request paths and cancel interaction

**Date:** 15 November 2026
**Source:** User correction in the Preorder design conversation
**Status:** UX request confirmed; represented in a local simulation only.

## Corrected mode paths

The user corrected the earlier interpretation in event 007. Keep the mode switch, separate request categories/queues and distinct page colors, but use these paths:

- **พรีออเดอร์:** รายการคำขอ → สร้างคำขอ → เพิ่มสินค้า → ตรวจและส่ง → ติดตามสถานะ → รับจริงและจัดสรร. No price-response step.
- **สอบถามราคา:** initial stages are รายการคำขอ → สร้างคำขอ → เพิ่มสินค้า → ตรวจและส่ง → ติดตามสถานะ → ตอบราคา. If the customer declines, the request ends. If the customer accepts, continue with ติดตามสถานะ → รับจริงและจัดสรร, linked to the inquiry.

Renumber visible stages for the selected path. Price inquiries show six stages before the customer response, then the two conditional fulfillment stages on acceptance. This event supersedes event 007's earlier flow interpretation.

## Cancel from the request list

Swipe a request row to the right to reveal a red **ยกเลิกคำสั่งซื้อ** action. Press it to open the password prompt. Incorrect input blocks progress. Correct input clears/closes that prompt and opens **ต้องการยกเลิกคำสั่งซื้อ?** with **ไม่ยกเลิก** and **ยืนยันยกเลิก**. **ไม่ยกเลิก** returns to the regular request list without changing the request. **ยืนยันยกเลิก** opens a required reason field; the user must enter a reason before confirming.

The local preview simulates the password gate and changes a sample row in browser memory only. The password value is deliberately omitted from this shared implementation handoff. Production needs secure authorization plus a durable cancellation event with actor, time and reason; no production cancellation API is implemented here.

## Preview

The local [SCPDA request-flow preview](/workspace/preorder-pda-flow.html) shows both modes, the conditional response path and the swipe-to-cancel dialogs. It remains a simulation and does not write request, CRM or inventory data.
