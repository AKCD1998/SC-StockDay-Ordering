# Event 005 — user requests Preorder in next SCPDA app update

- Date: 2026-11-15 (Bangkok)
- Requester: user in the Preorder web/API owner chat.
- Scope: include the Preorder feature prepared by this owner in a future update of the existing SCPDA Android app.
- User-confirmed navigation: two persistent bottom tabs in the same app: **นับสต๊อก** (existing scan/count flow) and **Preorder**.
- PDA-owner acknowledgment: pending. Direct cross-thread message/handoff tools are not available in this executor. This entry, [the mobile implementation handoff](../MOBILE_PREORDER_TAB_HANDOFF.md), the common Drive destination and the owner checkpoint communicate the request to the PDA workstream; no direct chat message is claimed.

## App/source evidence

- Latest APK observed in `เภสัชอู๋ / pdaAppProject`: [SCPDA 0.4.1-test.5.apk](https://drive.google.com/file/d/1advJ-GvP1L7cRXU5FdB_G1UBVktsq2fp/view?usp=drivesdk), 3,023,685 bytes, delivered 15 Nov.
- The actual APK's `assets/scpda.html` was inspected: one StockDay lookup/count flow, scanner/manual barcode entry, local count history and account/settings; no bottom tabs and no Preorder screen.
- Latest PDA R5 source checkpoint recorded by the PDA owner: branch `codex/pda-unit-pastel-r5`, commit `31f82782d77720b3f081648f2e833f77c485b682`.
- Current setup note says the APK's real count-send path is built but production activation remains gated. Preserve that activation gate and existing local counts.

## Proposed next-update design

Use two bottom tabs: `นับสต๊อก | Preorder`. Keep the scanner and count history in the first tab. Keep request creation, case list/status and next action in Preorder. Keep account/settings in the existing header control, show independent badges, and derive visible actions from server-issued capabilities. The scanner may offer an explicit “add to Preorder” action that copies exact SKU/unit identity into a request draft; it must not submit or count implicitly. Keep count observations, count receipts, preorder requests, physical HQ receipt and allocations as separate records.

Branch Preorder should support create/list, customer detail, missing-info response and a decision tied to an exact quote version. HQ fulfillment may later add physical receipt count and allocation. CEO price/purchasing remains primarily in the existing web queue. Dispatch, branch physical receipt and customer handover stay hidden until their separate APIs/events exist. The complete plan and QA notes are in `MOBILE_PREORDER_TAB_HANDOFF.md`.

## Integration dependency

Web draft [PR #100](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/100) and backend draft [PR #61](https://github.com/AKCD1998/PaaSRTSM-project/pull/61) are unmerged. PR #61's preorder endpoints still use web-session auth; a supported SCPDA registered-device auth adapter and an accepted mobile contract are pending. Migration 080 is unreviewed/unapplied. Both workspace flags stay off. Do not embed the web cookie in the app, invent a new mobile credential contract, or infer that the PDA PIN is an API token.

This event records the user's app-integration request and UX direction. It is not acceptance of the backend proposal by the PDA owner, staging proof, production approval or permission to activate count/preorder writes.
