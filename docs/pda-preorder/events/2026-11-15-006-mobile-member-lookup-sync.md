# Event 006 — user specifies member lookup and creation in SCPDA Preorder

- Date: 2026-11-15 (Bangkok)
- Requester: user in the Preorder web/API owner chat.
- Scope: define the customer-contact and membership subflow on the branch Preorder request form first.
- PDA-owner acknowledgment: pending. The request and prototype are recorded in the shared handoff; they are not a mobile implementation or direct-chat acknowledgment.

## Confirmed user experience

1. Put **เบอร์ติดต่อ** first. Place an orange **เช็คสมาชิก** button inside the right side of that phone field.
2. Keep the entered phone value after lookup and selection. A single match fills **ชื่อลูกค้า** and locks the name field. Staff can press **เช็คสมาชิก** again to rerun lookup/change a mistaken selection.
3. For multiple members sharing one number, show a popup with a dropdown to select the intended customer. Selection fills and locks the name without removing the phone number.
4. For no match, show **“ไม่พบสมาชิก สร้างลูกค้าใหม่?”** with **ตกลง / ยกเลิก**. Cancel returns to the form; confirm unlocks the name field and keeps the phone.
5. In new-member mode, change the primary action to **“ต่อไป · เลือกสินค้า + เพิ่มสมาชิกใหม่”**. Before writing, show **“ยืนยันสร้างสมาชิกใหม่?”** with **ตกลง / ยกเลิก**.
6. On confirmation, create the member first in SCCRM, send the record to ADA Software, then synchronize member data across SCCRM, ADA Software and SCPDA on smartphones at all branches. Display status by system/device and use the returned member identity in the request.

## Implementation boundary

The new inline phone prototype only simulates one match, multiple matches and no match; it makes no CRM/API calls and stores no entered phone/name in widget state. Cross-system writes and all-branch synchronization are a product requirement, not existing integration proof. Mobile authentication, endpoint and field mapping, duplicate/idempotency behavior, retries, per-system acknowledgements and device refresh behavior must be agreed before claiming synchronization is complete. Keep the new-member record pending/visible as pending until the server confirms SCCRM creation; do not create a second member when a retry follows a timeout.
