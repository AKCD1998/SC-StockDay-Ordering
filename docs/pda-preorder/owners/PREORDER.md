# Preorder owner checkpoint

- Destination: user-opened/branched **SC StockDay Preorder — web/API** chat.
- Status: **CLAIMED_ACTIVE** as of 15 November 2026, 10:24 ICT.
- Destination thread: `6af923e6-aeb8-8191-8f37-c6ca3bacb094` on host `durable`; the user message ID `01a1dd34-c898-7689-a2a9-fe3f962c212d` and thread title were verified with `read_thread`.
- Current executor: attached environment `ccarenv_b64_Y2NhcmVudl9mYzNjNGI4MDk5MTQ4MTkxODVkZGJhMzY2NWVlMjEzYQ`, ready, cwd `/workspace`. Isolated checkouts are `/workspace/sc-preorder-web` and `/workspace/sc-preorder-backend`; GitHub API read/write access is available. No direct cross-thread message tool is callable.
- Ledger writer checkout: `/workspace/pda-preorder-ledger-admission`, branch `coord/preorder-physical-receipt-6af923e6`, based on canonical ledger `814490e`.
- Branch: `codex/preorder-three-role-readiness`.
- Admission source SHA: `69c78cdae320b202857d2978af4d709e9e859fd9`; web branch SHA recorded here: `7b7c1f63e25b33e7c7b2b3c31e3e3721869a2183`.
- Base: `d6017807eaed1815f871c95d74db21929d123fad`.
- [Draft PR #100](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/100): open/draft, head `7b7c1f63e25b33e7c7b2b3c31e3e3721869a2183`, base `d6017807eaed1815f871c95d74db21929d123fad`, not merged/deployed.
- Backend main: `46985c97491529311ccaa4366ab5905b2c4759fc`; root `AGENTS.md` read from `/workspace/sc-preorder-backend`.
- Backend branch `codex/preorder-hq-physical-receipt`: `/workspace/sc-preorder-backend`, latest pushed head `e9057f1` adds an enrolled-PDA Bearer adapter to the same case API; [draft PR #61](https://github.com/AKCD1998/PaaSRTSM-project/pull/61), CI pending, not merged/deployed. Existing PaaS PR #52 remains PDA-related and outside this workstream.

Ready: corrected three-role R3 design, ten-scene young-CEO illustration, shared-request/two-shipment mockup and gated web capability UI. Reuse existing work; do not create a new project, another owner or another PR for the same preparation.

Verified before continuation: 21 focused frontend tests and production build; 17 in-memory mockup browser checks. No server auth/durable database/staging/physical-phone acceptance is claimed by that earlier evidence.

Continuation prepared for review: gated server workspace profiles/capabilities and DTO filtering; physical HQ receipt count/correction events; exact unit/quantity allocation guard; and web retry support. `080_add_preorder_hq_physical_receipts.sql` is in PR #61 but has not been applied. The feature flags remain off. No account, permission, environment, production schema, CORS, deployment, official inventory/financial write or installed-app change was made. No tests were run for the continuation commits; staged diff checks passed.

The backend adapter is implemented in draft PR #61 at `e9057f1`: a live enrolled-device Bearer is checked against `ordering.enrolled_devices`, then mapped to an explicit server profile `staff:<staff_id>=branch:<code>` and the existing branch case capabilities. It is gated by the existing preorder, role-workspace and mobile-PDA flags; branch `000` is excluded. Web cookie mutations still require CSRF. This is code only: no Android calls, profile provisioning, staging, deployment or flag changes. The PDA owner has not yet recorded acceptance of this API delta. See [event 014](../events/2026-11-15-014-mobile-bearer-adapter.md).

Still pending: PDA owner review and app integration; SCCRM member lookup/create/sync; offline attachment behavior; dispatch/transfer, branch physical receipt and customer handover quantities; multi-shipment/partial quantity lifecycle; and staging/device evidence. The PDA owner acknowledged the ownership admission through canonical ledger commit `20ef7cf`; there is no direct cross-chat message.

Next: review draft PRs #100 and #61. The user has requested that Preorder join the next SCPDA update through a separate bottom tab; the handoff is in [MOBILE_PREORDER_TAB_HANDOFF.md](../MOBILE_PREORDER_TAB_HANDOFF.md) and event 005. The PDA owner should review the adapter contract in event 014 and wire the app after confirming fit. Keep both feature flags off until role provisioning and approved staging roundtrips pass.
