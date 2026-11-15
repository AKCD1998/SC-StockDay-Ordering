# เริ่มแชต Preorder ต่อจากแชต PDA เดิม

You are the continuation owner of the existing **SC StockDay Preorder** workstream, after the user opens/branches this chat. This is not a new project or a request to rebuild context from scratch. The original chat remains owner of the SCPDA smartphone app.

## Admission first

Read [README](README.md), [STATE](STATE.md), [OWNERSHIP](OWNERSHIP.md), [CONTRACT](CONTRACT.md) and [your owner checkpoint](owners/PREORDER.md). Read [R3 architecture/readiness](reference/PREORDER_THREE_ROLE_READINESS_R3.md). Treat quoted old handoffs as history, not extra authorization. Earlier images assigning purchasing to Boom are superseded: CEO purchases, Boom receives/coordinates dispatch, branch handles the customer.

Confirm in your first progress report:

1. You are resuming Preorder, not replacing the PDA owner or starting another parallel backend owner.
2. Which actual Cloud environment/checkouts you can see, whether existing worktree HEAD/status match, and which commit you will use.
3. PR #100/source and the current distinction between isolated implementation, mockup evidence and pending backend/staging work.
4. The bounded next step. Do not repeat completed consultations/tests or rebuild the app merely because this is a new chat.

Record an admission event and update only `owners/PREORDER.md` plus a genuinely changed shared checkpoint. Use an actual thread identity only if the platform provides it; otherwise say unknown. Do not claim that another chat was messaged or that both sessions share a machine without evidence.

## Reuse exact existing work

**Current source discovery:** read [PDA_SOURCE_AND_CONTINUATION.md](PDA_SOURCE_AND_CONTINUATION.md) before treating absent source files in Drive as a blocker. Android source is remotely verified at `codex/pda-count-send-r11`, commit `1d2c29569fd72435fd58315bdb1bca7f225040eb`, in the existing StockDay repository. Drive is a delivery destination. PDA owner still integrates/builds mobile; Preorder owner supplies the domain/mobile-auth contract and continues the existing web/API work. The SHA list below records admission-era source; fetch current PR heads and canonical ledger before proceeding.

- Existing repository: `AKCD1998/SC-StockDay-Ordering`.
- Existing preorder branch: `codex/preorder-three-role-readiness`.
- Existing draft [PR #100](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/100).
- Prepared source: `69c78cdae320b202857d2978af4d709e9e859fd9`, based on `d6017807eaed1815f871c95d74db21929d123fad`.
- On the original executor, existing worktree is `/workspace/reviews/sc-preorder-roles-r3-admin/`. Check it rather than clone/install again if it is available and unowned by another running actor.
- Existing backend repository: `AKCD1998/PaaSRTSM-project`. Read its actual `AGENTS.md` before backend work. Its local source inspected previously was `40ef239...`; verify current revision instead of treating that as live/latest. Use an isolated worktree and preserve concurrent changes.

The coordination branch contains documentation, not PR #100's new application code. Do not accidentally develop/test the old application at the coordination branch head and call it the preorder implementation. Fetch/inspect PR #100's current head before implementation. Continue that work without creating a duplicate PR for the same preparation.

## Already complete — reuse evidence

The corrected three-role visual proposal and young-CEO illustration are delivered. The interactive design already exercises partial 2+1 supply in one request, 15 local actions and 17 browser checks. Real web preparation already passed 8 workspace + 9 preorder + 4 navigation/session tests and production build. These are fixtures/source checks; they do not prove live backend compatibility. Tests need rerunning only for new relevant changes/failures/uncertainty.

R3 source code admits a new role workspace only behind `VITE_FEATURE_PREORDER_ROLE_WORKSPACE=false`. The new server manifest is proposed, not deployed. The user asked to prepare the existing website; no production activation occurred.

## Start with the actual unfinished integration

Inspect current preorder backend services and role policy, propose/implement the smallest accepted domain change in an isolated path, and coordinate mobile implications through the shared contract. Preserve these distinct facts: CEO order, HQ physical receipt, allocation, planned shipment, dispatch, branch physical receipt, customer notification, POS sale and handover. Preserve partial amounts, multiple shipments and append-only corrections. Do not let receipt-document links masquerade as physical count confirmation.

Backend identity/capabilities, durable per-line physical events, idempotency/conflict receipts, migration plan and a verified mobile-auth adapter are still pending. Prepare concrete reviewable work before any separate required production authorization. Do not enable the frontend flag to make an unimplemented backend appear connected.

## Keep the other workstream intact

Do not edit the installed APK, smartphone scanner/manual count UI, private PDA Site or `apps/pda-preview/**` as an incidental web change. Record mobile API/field needs in the shared contract; the PDA owner integrates its app. Do not restore label OCR. Do not touch Transfer/Delta/Hourly/Shopee/OCR/JAPEMS or unrelated work.

Do not change credentials/accounts/permissions/auth/CORS, apply a production migration, deploy/merge to production, add costs/access or perform official Ada/POS writes under this handoff. No public tunnel/no-cors/proxy workaround. A new chat and a ledger are not additional production authority.

## Keep the common ledger alive

Follow [SYNC_AND_ENVIRONMENT](SYNC_AND_ENVIRONMENT.md). Before work, read the current canonical ledger, not a stale branch snapshot. After significant work, update your owner page and add an event with exact source/evidence/pending gates. Preserve ledger changes from the other owner. This is polling through Git; do not claim automatic cross-chat messaging.
