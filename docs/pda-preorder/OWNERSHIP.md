# แบ่งงานสองแชต

| Area | PDA chat | Preorder chat |
|---|---|---|
| Android/SCPDA shell, scanner, permissions, flashlight, camera lifecycle | Owns | Consult interface only |
| Smartphone UI, manual lot/date/count entry and local offline count behavior | Owns | Does not edit without mobile-owner coordination |
| New preorder screens inside the smartphone app | Owns UI/transport integration | Owns domain fields, status/quantity rules and domain API |
| StockDay preorder web | Consult mobile parity | Owns existing `apps/admin-web/src/preorders/**` and PR #100 |
| Preorder business rules, database/event design and domain API | Reviews mobile consequences | Owns proposal/implementation in existing backend after preflight |
| Dedicated HQ role and server enforcement | Reviews mobile actor mapping | Owns preorder scope; no actual account/permission change without the required authorization |
| Shared contract/version semantics | Reads, proposes and acknowledges mobile compatibility | Reads, proposes and acknowledges domain compatibility |
| Existing count/lot/FEFO backend candidates | Remain with PDA workstream | Does not repurpose or overwrite |
| Transfer/Delta/Hourly/Shopee/OCR/JAPEMS or other work | Neither takes over | Neither takes over |

## File ownership starting point

- PDA: existing `apps/pda-preview/**`, `apps/scpda-android/**`, PDA docs/build artifacts and count-specific API candidates. Keep theme, scanner and paused OCR state.
- Preorder: `apps/admin-web/src/preorders/**`, narrowly related `App.jsx` wiring, preorder docs, and `PaaSRTSM-project/apps/admin-api/src/routes/customer-preorders.js` plus domain service files. The actual website is **SC-StockDay-Ordering**, not a replacement Site/project. Existing API lives in **PaaSRTSM-project**, not the legacy SC `server/`.
- Shared infrastructure/auth/catalog/source resolvers: consult the existing owner and inspect the real implementation before edits; possession of a shared Cloud filesystem does not transfer ownership.

These are coordination boundaries, not deployed access controls. Routine changes inside an owner's area do not need a new user approval. Cross-owner changes that alter API compatibility, identity, unit semantics, offline guarantees or shared status meanings must record a proposed delta and evidence; do not silently treat an unreviewed proposal as an accepted contract.

## Worktrees and simultaneous work

Use a separate engineering checkout/worktree per owner. Do not switch/reset another owner's active branch or reuse an owned localhost process. Do not have two agents independently own the same preorder implementation: the new chat resumes PR #100 after admission, instead of creating another owner or duplicate PR.

Local checkpoint paths on the original executor:

- PDA: `/workspace/SC-StockDay-Ordering`, `codex/pda-durable-demo`.
- Preorder: `/workspace/reviews/sc-preorder-roles-r3-admin`, `codex/preorder-three-role-readiness`.
- Coordination docs only: `/workspace/reviews/pda-preorder-common-ledger`, `coord/pda-preorder-ledger`.

Paths are not proof of availability on another executor. Verify HEAD/status before reuse. Never run `reset --hard`, overwrite existing dirty files, force-push a peer's branch, or copy credentials between chats.
