# Event 013 — ADA receipt notice, CEO product review and FIFO allocation

**Date:** 15 November 2026
**Source:** User's integration question and StockDay Admin **ใบรับสินค้า** screenshot.
**Status:** UX direction confirmed; architecture and local mock only. ADA source/API contract and mobile integration pending.

## Evidence and limit

The screenshot shows a StockDay Admin receipt page with **รออนุมัติ** and **CEO กดอนุมัติแล้ว** views and receipt rows. It confirms an existing receipt-document workflow. It does not prove ADA has an event/webhook/API, identify the exact placeholder item names, establish the meaning of **ทบทวน**, or show how product master changes synchronize. The ADA rebuild worker was not disturbed. This runtime exposed no cross-thread send/handoff tool; available read-only messages did not provide an authoritative ADA integration contract.

## Proposed flow

1. Warehouse staff enter a supplier receipt once in ADA. A backend connector notifies SCPDA when that receipt is first saved, with a stable receipt-document and line ID, product identity, quantity, exact unit, current approval state, source time and event version. If the state is **รออนุมัติ**, the row appears in the app but is blocked from allocation; a later CEO approval event updates that same row. Idempotent ingestion prevents a repeated notice or duplicate ADA stock entry.
2. HQ opens the matching item, takes/attaches an arrival photo, records actual physical count and can expand optional lot/manufacture/expiry fields. SCPDA stores a verification/allocation record tied to the ADA document; it does not repeat the ADA inventory write.
3. Reconcile document quantity against physical count. On discrepancy, hold allocation and route it to an authorized reconciliation process; don't silently edit official stock. Only reconciled, unreserved quantity can be allocated.
4. For a provisional ADA item such as a placeholder, keep the request/receipt in **รอ CEO ระบุชื่อ/ตรวจรายการซ้ำ** and exclude it from ordinary allocations. Branch's label photo and trade name travel with the product-review request.
5. CEO/product-data authority in the existing web app or an account-authorized SCPDA view searches ADA for an exact item/barcode/pack match. CEO maps the request to an existing canonical product or updates/creates its ADA master record through an authorized path. Do not rely on name similarity alone or create an unnecessary duplicate.
6. ADA acknowledgement supplies the stable canonical product ID/code, master version, display data and unit. Only then bind it to all request lines and the receipt; publish the confirmed mapping to HQ/branches. If ADA is unavailable, keep **รอ ADA ยืนยัน**, preserve a retry/audit record, and don't claim the new product exists.
7. For each canonical product and exact unit, query outstanding Preorders and price inquiries the customer accepted. Exclude open price responses, declines, cancellation, fulfilled/previously allocated quantity. Sort oldest request first with stable request/line ID tie-breaker.
8. Preview the plan; allow **เลือกทั้งหมด** when supply covers outstanding demand. For shortage, allocate oldest first, label any partial quantity and leave the remaining quantity queued. Commit atomically on the server after checking active reservations so two HQ users cannot allocate the same stock.
9. After commit, publish branch status **รับเข้า HQ → จัดสรรแล้ว/บางส่วน → รอจัดส่ง**. Only a later dispatch and branch-receipt event can say goods reached the branch. A supplier receipt with many products is queried/allocated per canonical item/unit.

The local preview represents the receipt notice/source ID, physical count/photo, optional lots, separate CEO review view and FIFO allocation. Role switching and all receipt/product responses are synthetic UI fixtures, not production authorization or integration. It does not write to ADA/SCCRM/SCPDA or upload a photo.

## Affected owners and open gates

- **PDA owner:** review/adapt the screen under an authenticated server role, preserving the existing app's product and count work.
- **Preorder backend/web owner:** define durable receipt-event ingestion, product mapping/master-data audit, mismatch holds and atomic allocations.
- **ADA owner:** verify actual receipt approval state, event/API/read contract, item IDs, placeholder handling and mandatory master-data fields from ADA source/API.

Before implementation, retrieve read-only ADA evidence and agree on the event/auth contract. No migration, deployment, ADA/product write, notification, photo upload, account/permission change, or official inventory movement is included in this event.
