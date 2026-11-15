# Event 014 — Enrolled-PDA Bearer adapter in the existing Preorder API

- Date: 15 November 2026
- Owner: Preorder web/API workstream
- Status: **API adapter, member lookup and pending/approved receipt-notification CI passed; pending code review and PDA-owner acceptance**
- Backend branch: `codex/preorder-hq-physical-receipt`
- Commit: `e9057f1` (`Add enrolled PDA access to preorder API`)
- PR: [PaaSRTSM-project #61](https://github.com/AKCD1998/PaaSRTSM-project/pull/61)

## Why

The existing `/api/customer-preorders` router accepted the web session cookie only. Reusing the PDA's count/read credential would cross security scopes, and creating a second preorder API/case ledger would split the source of truth. This change allows the already enrolled mobile identity to enter the same case API while preserving branch capability checks.

## Implemented contract

- PDA calls the existing `/api/customer-preorders` paths with `Authorization: Bearer <enrolled-device-token>`.
- Existing `requireMobileToken` rechecks the enrollment row, revocation and expiry for each request.
- The server maps the database-bound staff identity to `staff:<staff_id>`, and derives branch from the enrolled row. An explicit `PREORDER_WORKSPACE_PROFILES` grant such as `staff:123=branch:001` is required.
- Mobile identity receives only the branch staff system context. The configured profile and `X-Preorder-Workspace` capability resolution remain server-owned; no client-provided role or branch is trusted. Branch `000` is rejected by this branch adapter.
- Mobile access is closed unless `FEATURE_MOBILE_PDA` and `FEATURE_PREORDER_ROLE_WORKSPACE` are enabled in addition to the existing preorder feature.
- A mutation skips cookie CSRF only after the mobile token middleware has validated the enrolled Bearer. Cookie-authenticated web mutations still use CSRF.
- CORS preflight allows `Authorization` for an approved mobile client origin. The existing same-origin checks are unchanged.
- Existing case/item IDs, create idempotency, storage and preorder workflow services are reused. No parallel mobile case store was added.
- API-side usage instructions are in the backend source at `docs/customer-preorders/MOBILE_API_CONTRACT.md`.

## Scope not delivered

This is an API adapter, not the Android implementation or production rollout. The PDA client has not yet called it. Member lookup was added later in commit `9c206b1` and is documented in [event 015](2026-11-15-015-member-directory-and-registration-boundary.md). HQ receipt work-cue and notification-poll APIs were added later in commit `c5a28bf` and are documented in [event 013](2026-11-15-013-ada-receipt-notice-product-review-and-fifo.md). SCCRM member creation/delivery receipts, offline retries, HQ purchasing/fulfillment on PDA, dispatch/transfer counts, branch physical receipt or customer handover are still not included. No flag/profile was enabled, no account/permission provisioned, no migration applied, and no ADA/POS/CRM write or deployment occurred.

The backend changed files for `e9057f1` passed `node --check` and `git diff --check`; no separate local test suite was run for that commit. GitHub Actions CI runs `43709199891`, `43710628130` and `43712475237` completed successfully for the API adapter, member lookup and pending/approved receipt notification changes. Staging exercise, PDA-owner acceptance and app roundtrip remain separate evidence gates. The implementation does not make Preorder end-to-end complete.

## PDA-owner handoff

Please review the bearer/profile mapping and confirm whether the app's enrolled token and HTTP client can consume these routes. The app should retain the same idempotency key for a retry, keep auth/session failure distinct from a draft/local count receipt, and continue showing Preorder as unavailable until the mobile UI is integrated against approved staging. This ledger event and the PR are review artifacts, not proof that the PDA chat received or accepted the change.
