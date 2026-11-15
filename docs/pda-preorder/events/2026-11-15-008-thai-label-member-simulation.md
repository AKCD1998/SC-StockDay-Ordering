# Event 008 — user requests Thai label and compact member-check simulation

- Date: 2026-11-15 (Bangkok)
- Requester: user in the Preorder web/API owner chat.
- Scope: refine visible Thai wording and show the two primary member lookup outcomes in the local SCPDA request-form mockup.
- PDA-owner acknowledgment: pending. This records a UI refinement, not an app implementation.

## Confirmed UI direction

- Display the feature name as **พรีออเดอร์** in the app UI.
- Simulate the supplied existing-member case with name **นาย A** and the user's supplied contact number in the local mockup. Provide the no-match path through **“ไม่พบสมาชิก สร้างลูกค้าใหม่?”** and the previously confirmed new-member flow. Keep the multiple-members popup from event 006 available as an additional case.
- On a successful match, show the matched name locked in the name field and keep the phone in its field. Remove the redundant helper text explaining that the name is locked and that the user may press **เช็คสมาชิก** again.
- Keep the mock simulation local. Do not query CRM, write the member to SCCRM/ADA, or save the supplied phone number in the shared test database.

The updated inline preview is `/workspace/preorder-pda-flow.html`. It is a visual interaction only; it does not prove CRM or mobile API behavior.
