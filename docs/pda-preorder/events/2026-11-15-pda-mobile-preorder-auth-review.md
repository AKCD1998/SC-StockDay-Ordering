# Event — PDA mobile preorder source and auth review

**Date:** 15 November 2026 (UTC)  
**Owner:** SCPDA mobile/PDA workstream  
**Status:** User requested mobile integration. Source and current auth paths inspected; app code not yet changed. The mobile identity/capability adapter remains an API dependency.

## Verified source

- Repository: `AKCD1998/SC-StockDay-Ordering`.
- Source branch: `codex/pda-count-send-r11`.
- Source base: `1d2c29569fd72435fd58315bdb1bca7f225040eb` (SCPDA `0.6.1-test.11`).
- Read-only source worktree for this review: `/workspace/sc-preorder-mobile`, branch `codex/preorder-mobile-integration`.
- The app is WebView HTML/JS plus a narrow Android bridge. `apps/pda-preview/scpda.html` already has **นับสต๊อก / พรีออเดอร์ / เช็คราคา** tabs; `scpda-ui.mjs` routes the preorder tab to a pending panel. It is not a shipped mock request list.

## Auth/API evidence

- `StockDaySession`'s reader token is bound to the fixed branch `001` and role `reader`; its separate count token is for count submission. Neither is a preorder bearer token or permission to create customer requests.
- The backend already has a separately enrolled mobile identity under `/api/mobile/enroll/*`. `requireMobileToken` validates the active `ordering.enrolled_devices` record and exposes enrolled `staffId`, `role`, and `branchCode`, including revocation/expiry. The router is gated by `FEATURE_MOBILE_PDA` (false by default in code). This is a possible basis for named PDA work identities, not yet an accepted preorder integration or a claim that production enrollment is enabled.
- `/api/customer-preorders` currently requires web-cookie auth and CSRF. Its workspace manifest is server-owned (`PREORDER_WORKSPACE_PROFILES`) and returns role capabilities; there is no mobile-token adapter on that router.
- SCCRM member directory reads exist at `/api/admin/sccrm-members`, but that router is admin-cookie-only. The app cannot use it as a branch member lookup. No app-facing member-create endpoint was found in this path.
- Current web request creation uses a stable case/item service and an `idempotencyKey`; a future mobile client should reuse that server ledger and receipt, not store an independent official case list.

## Proposed interface — not accepted or implemented

Reuse the existing named mobile enrollment only if the API owner accepts it for preorder. Keep its bearer token separate from reader/count tokens and map the enrolled staff identity to server-owned preorder workspaces/capabilities. Never accept a role name or branch scope supplied only by the phone. Reuse the existing preorder service and case/item IDs. Add a narrowly scoped branch member lookup and a separate member-create/sync receipt contract before enabling the requested member flow.

The API side still needs to define the mobile DTO, stable subject ID mapping, capability and branch checks, idempotency/version/receipt/error behavior, and SCCRM member lookup/create results. Until that contract exists, implementing native calls to guessed paths would bind the app to nonexistent endpoints. No reader token was reused, no mobile API call was added, and no feature flag, account, CRM/ADA write, migration, or deployment changed in this review.

## Next work

1. Continue mobile UI and build work that does not invent transport routes or user roles.
2. Once the API-side contract is recorded/implemented, connect the WebView UI through an explicit Android operation allowlist and test auth, capability denial, response receipts, retry/idempotency, and tab/back behavior.
3. Preserve the count and price tabs, the existing app package/signing identity, on-device history, and the production scope described in the R11 checkpoint.
