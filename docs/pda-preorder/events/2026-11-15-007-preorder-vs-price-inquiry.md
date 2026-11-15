# Event 007 — user separates Preorder from internal price inquiry

- Date: 2026-11-15 (Bangkok)
- Requester: user in the Preorder web/API owner chat.
- Scope: add a request-mode switch to the SCPDA customer request form and define the two separate workflows.
- PDA-owner acknowledgment: pending. This is a recorded product direction, not implementation or mobile/API acceptance.

## User-confirmed direction

Put a switch knob in the create-request heading area to choose between **คำขอ Preorder** and **คำขอสอบถามราคา**. The chosen mode must determine the request's database category, handling queue/lifecycle and page accent color, making the mode recognizable at a glance. Keep the selected category with the request after creation.

- **Preorder:** use the preorder workflow, including customer-facing price/quote and the customer's decision when applicable.
- **สอบถามราคา:** create an internal price inquiry so staff can check price before ordering. Do not send a quote to the customer, ask the customer to accept/reject, or require the CEO to key a price in order to ask whether the customer wants it.

The new local prototype switches between SC-blue Preorder styling and warm-gold price-inquiry styling, updates the request category and review label, routes to separate status/result views, and hides the purchase-receipt step in price-inquiry mode.

## Implementation boundary

The UI prototype does not write a database. Backend work must define and persist the request-mode field/enum and authorize distinct queue transitions; a frontend color toggle is not adequate. The current mobile auth adapter and CRM/ADA integration are still pending. No request-category migration, mobile API, queue route, or production write was implemented by this design update.
