# Event 013 — ADA receipt notice, CEO product review and FIFO allocation

**Date:** 15 November 2026
**Source:** User's integration question and StockDay Admin **ใบรับสินค้า** screenshot.
**Status:** Approved-receipt HQ work cue and enrolled-PDA polling API are implemented in draft PR #61. A separate 15-minute receipt-only task is provided but defaults to disabled. Live task state and mobile UI acceptance remain unverified. Product writer and account provisioning are not implemented.

## Evidence and implementation boundary

The screenshot shows the StockDay Admin **ใบรับสินค้า** page with **รออนุมัติ** and **CEO กดอนุมัติแล้ว** lists. Source review confirms our `SC-StockDay-Ordering/apps/adapos-sync` reads pending and approved receipts from local AdaPOS SQL and posts them to our backend ingestion routes; the web reads those backend receipt tables. Pending is selected by `FTXihStaPrcDoc IS NULL`; approved is `FTXihStaPrcDoc = '1'`. This uses the SC-owned bridge and does not require an ADA Software Cloud API.

In backend draft PR #61, ingesting approved HQ receipt lines creates an idempotent `HQ_RECEIPT_SYNCED` activity and admin notification for each matching open preorder item, in the same transaction as the approved receipt upsert. It is a cue for HQ staff to inspect and physically count the synced receipt; it does **not** verify physical stock or announce allocation/delivery. The enrolled-device endpoint `GET /api/mobile/preorder-notifications` (also mounted as `/api/pda/preorder-notifications`) supports cursor polling, recommends 30 seconds, and omits customer contact details. Branch devices receive `HQ_RECEIPT_LINKED` only after HQ FIFO allocation commits. The web workspace polls `/api/customer-preorders/unread-count` every 30 seconds for its badge. These are polling contracts, not OS push notifications.

The receipt-only runner `apps/adapos-sync/register-preorder-receipt-task.ps1` configures a 15-minute schedule, but creates the task disabled unless explicitly enabled. The regular full-sync schedule is separate. We did not inspect or change the live HQ host, so its installed/enabled state and delivery health are unknown. Do not promise 15-minute arrival until that is checked.

The notification event currently fires when an approved receipt is synced, not when a pending receipt first arrives. A pending-to-approved notification lifecycle in the app would need a distinct, deduplicated state event. Source references: [pending/approved AdaPOS SQL queries](/workspace/sc-preorder-web/apps/adapos-sync/src/queries.js:245), [sync POSTs to our backend](/workspace/sc-preorder-web/apps/adapos-sync/src/index.js:554), [receipt-only task setup](/workspace/sc-preorder-web/apps/adapos-sync/register-preorder-receipt-task.ps1:3), [Admin web receipt reads](/workspace/sc-preorder-web/apps/admin-web/src/App.jsx:620), [backend approved-receipt ingestion](/workspace/sc-preorder-backend/apps/admin-api/src/routes/sync-ada.js:2905), and [mobile poll endpoint](/workspace/sc-preorder-backend/apps/admin-api/src/routes/mobile-products.js:57).

No ADA Cloud API or new ADA writer is needed for this read/notify path. The current `adapos-sync` is read-only. A CEO product-master writer remains separate in-house work; the ADA rebuild worker was not modified.

## Proposed operational flow

1. Warehouse staff enter a supplier receipt in AdaPOS. The existing local sync posts pending and approved receipt rows to the SC backend. The current API creates the HQ cue after approval has been synced. A later distinct pending-state notification could be added if HQ needs to act before CEO approval. Replays must remain idempotent and must not add another ADA stock movement. Intentionally install/enable the receipt-only task on the HQ machine if a 15-minute receipt poll is approved; do not accelerate the full stock/price sync.
2. HQ opens the matching item, takes/attaches an arrival photo, records actual physical count and can expand optional lot/manufacture/expiry fields. Store verification/allocation evidence against the AdaPOS document; do not repeat the official ADA inventory write.
3. Reconcile document quantity against physical count. Hold allocation on discrepancies and route them to an authorized reconciliation process. Allocate only reconciled, unreserved quantity.
4. For a provisional ADA item such as a placeholder, keep the request/receipt in **รอ CEO ระบุชื่อ/ตรวจรายการซ้ำ** and exclude it from ordinary allocations. Attach the branch label photo and trade name to product review.
5. CEO/product-data authority searches the synced catalog by exact code, barcode and pack details. Map to an existing item or preview a new master-data command; do not rely on name similarity alone.
6. The current sync is read-only. Apply a CEO-confirmed product command through a separate SC-owned local writer on the HQ AdaPOS machine, with narrow credentials, duplicate checks, CEO preview/confirmation, idempotency, audit actor and read-back verification. Publish canonical code/name/unit only after the saved item is read back successfully; otherwise keep it **รอยืนยันจากเครื่อง HQ**.
7. For each canonical product and exact unit, query outstanding Preorders and accepted price inquiries. Exclude open price responses, declines, cancellation, fulfilled and previously allocated quantities. Sort oldest request first with stable request/line ID tie-breaker.
8. Preview the allocation; allow **เลือกทั้งหมด** when supply covers demand. For shortages, allocate oldest first, show partial quantities and leave remaining demand queued. Commit atomically after checking active reservations.
9. After commit, publish branch status **รับเข้า HQ → จัดสรรแล้ว/บางส่วน → รอจัดส่ง**. Only later dispatch and branch-receipt events can report that goods reached a branch.
10. Create a separate authenticated **พนักงานรับสินค้า HQ** account and CEO admin account. Grant CEO the **CEO / คลัง HQ / ผู้จัดการสาขา** workspaces with a clear role switcher. Attribute every action to the CEO identity; HQ staff and branch managers see only their own workspace. Keep the web suited to batch review and the phone suited to camera/one-item work while sharing status vocabulary and case/item IDs.

The local preview is synthetic. It does not create accounts, grant roles, write ADA/SCCRM/SCPDA, upload photos, or perform allocation.

## Remaining gates

- PDA owner review and integration of the enrolled-device API/poll into the app; flags remain off.
- Confirm actual receipt-task installation, enabled state, and sync health on the HQ host before promising notification timing.
- Decide whether HQ also needs an event for pending (not-yet-approved) receipts.
- CEO product-master writer, duplicate resolution, mismatch holds, physical dispatch/branch receipt, partial supply lifecycle and account provisioning remain unimplemented.
- PR #61/#100 are draft review artifacts, not a live notification rollout; no deployment, product write, photo upload, account/permission change, or official inventory movement occurred.
