# Branch 001 count integration — production activation review

4 November continuation: [current audit implementation and admission](PDA_AUDIT_CORE_DELIVERY_2026-11-04.md). Current isolated migration filenames are 080/081/082; the older 077/078 candidate references below describe their historical numbering. No production migration was applied.

Current continuation: [shared StockDay website/PDA integration](PDA_SHARED_INTEGRATION_2026-11-01.md) supersedes this earlier candidate's code/status for activation review. Original R1 ZIP/evidence remain immutable. The current candidate adds migration 078 and contract v2; no production approval is inferred.

Date: 2026-11-01, Asia/Bangkok. Same PDA project and owner. User requested connection to the real backend using branch **001**. This phase prepares that integration; it has not activated or written to production.

Later workflow clarification: the user supplied twice-yearly stocktake workbooks and confirmed independent recounts 1/2/3. See [workbook findings](PDA_BIANNUAL_STOCKTAKE_WORKBOOK_FINDINGS_2026-11-01.md). This candidate remains an ad hoc count-ledger pilot; it does not implement the sessions/areas/rounds and website reconciliation/export needed to replace those workbooks. The original review ZIP is unchanged, and the clarification is not activation approval.

## Result and admission

The proposed branch-001 count API, additive PostgreSQL ledger, mobile enrollment client, navy/yellow/white connection/count/history screen and durable browser queue are implemented as a review candidate. They have run together over actual loopback HTTP and a separate PostgreSQL 16 fixture database. This is not the R2 SQLite demo, a ScProductDev run, an authenticated production read, or a physical-phone test.

The candidate lives in the existing frontend repository and an isolated worktree of the existing backend repository at `/workspace/reviews/pda-001-backend`, branch `codex/pda-001-count-pilot`, based on `f49f7d2` from the refreshed `origin/main`. The Transfer owner's main checkout was not edited. No replacement project, Site, engineering owner or backend service was created remotely.

Production activation is **PENDING**. Earlier user scope explicitly reserved production deployment, schema and permission changes for separate approval. Changing the pilot branch to 001 does not itself remove those shared-backend changes. No real device enrollment or credentials were created here.

## What this connects

| Path | Status / behavior |
|---|---|
| Existing `/api/mobile/enroll/roster` and `/enroll/redeem` | Reused without changing the deployed enrollment contract; no production PIN or refresh endpoint invented |
| Existing mobile authentication | Reused JWT/enrollment-row revocation and expiry checks; new count routes also verify current active staff/role eligibility |
| Proposed `/api/mobile/counts/capabilities` | Authenticated handshake pins contract `sc-pda-count-ledger-001-v1`; exact branch 001 only |
| Proposed `/api/mobile/counts/products/by-barcode/:barcode` | Exact string barcode, rejects multiple products; explicit S/M/L unit choice; rejects changed product/unit metadata |
| Proposed `POST /api/mobile/counts` | Durable count, lot, date, original request, receipt and count-history revision in one PostgreSQL transaction |
| Proposed `/api/mobile/counts/history` | Authenticated branch history, original/correction linkage, actor and original observation/server receipt timestamps |
| PDA `pilot-001.html` | Candidate connection screen within the existing PDA project; uses the same theme and existing deliberate-capture/torch-off scanner; not published |
| Existing `/index.html`, demo PINs and R2 SQLite path | Preserved. The verified R2 ZIP and artifact identity are unchanged |

The count routes are gated by `FEATURE_MOBILE_PDA` and the new **default-off** `FEATURE_MOBILE_COUNTS_001`. Branch 004 and all other branches are rejected even if the pilot flag is enabled. Existing enrollment roles are used; no new role, account or permission provisioning endpoint is added.

## Data and stock semantics

- Each request has an immutable UUID, chosen unit, explicit lot quantities/dates, observation/capture time and expected count-history revision. Unknown dates and lot codes are explicit nulls. Dates require a real calendar day; month-only labels are not converted to invented days.
- Product/barcode strings retain leading zeroes. A barcode never chooses a pack automatically. Catalog factors can remain null; no missing factor becomes 1. Counts are stored in the staff-selected unit with **no canonical conversion**.
- The reference remains **Full Sync**, not Hourly or Shopee. Null, zero and negative references stay distinct. Stock observation time and stock unit basis remain unknown. Fetch time is separate.
- The screen shows website reference and entered count before confirmation, but does not claim a valid numeric discrepancy while their common stock unit is unknown.
- Receipt status is `recorded-observation`. Complete-product confirmation is evidence, **not authority to replace website stock**. Count heads track count-history revisions only. No branch-stock reader, Full Sync, Delta, Hourly, receiving, transfer, financial or official-stock writer is changed. Source audit explicitly records that human stock selection did not change.
- A correction is a new linked row with a reason, the original effective observation time and both original/corrected evidence retained. The original staff member or an existing manager may correct the current count. A later delivery is a new observation. Stale/changed revisions fail with 409; retained queued requests are never silently rebased.
- Events, lots and source audit reject SQL UPDATE/DELETE via triggers. Identical event/actor/device retries return the original receipt, including after an HTTP-process restart. Altered or different-device replay fails. Advisory transaction locks serialize same-ID retries and competing count-history revisions.

## Phone and offline limits

Real enrollment tokens stay in memory; they are excluded from localStorage, IndexedDB and distributable evidence. This candidate therefore requires enrollment again after reopening the page. Re-enrolling the same staff/device permits pending immutable requests to retry. Different actors/devices do not inherit the queue.

IndexedDB is partitioned by target origin and separate from the accepted demo namespace. The original serialized request cannot be overwritten. Actual browser offline save, closing the page, reopening online, re-enrollment and exactly one accepted database row were verified. **Offline cold reopening of this new pilot page's app shell was not implemented/accepted.** The older R2 offline-shell evidence remains separate. Neither physical Android, Volume+, Bluetooth HID nor camera/torch hardware acceptance was added.

## Verified evidence

- Node reports **11 passing tests** (one parent and ten scenarios) over actual PostgreSQL 16 / HTTP child processes: existing enrollment/auth, default-off and branch gates, current staff eligibility, exact barcode/ambiguity/unit uncertainty, durable receipt/lots/dates, identical retry and scoped replay rejection, input validation, immutable linked correction, concurrent retries/conflicts, lost response after a real commit, HTTP-process restart and locally reapplicable migration.
- The browser used the actual existing enrollment router and new HTTP/PostgreSQL API: staff count 3, linked correction to 6 with two lots, another enrolled browser's visibility, network-offline queue, close/reopen/re-enroll and exactly one database row. Official reference remained 6. Mobile viewport 390px had no horizontal overflow or script errors.
- **7 read-contract tests passed**, including a browser-fetch receiver fix exposed during the UI check. The normalizer's stock/source/identity semantics remain unchanged.
- The existing full-server mobile enrollment/product regressions initially could not load because the review worktree lacked dependencies (`xlsx`, then dev-only `supertest`). Locked dependencies were installed **only in the isolated review worktree**, with install scripts disabled and dev dependencies explicitly included. Both existing regression files then passed: **13 tests**. They ran with production runtime variables excluded. The owner checkout and package/lock files were not changed; this is targeted mobile regression coverage, not the whole backend suite.

The portable R2 Windows acceptance is still valid for its exact archive. This PostgreSQL candidate has **not** been executed on ScProductDev. It is not staging/production compatibility proof.

## Live access findings

Read-only, unauthenticated probes on 2026-11-01 returned enrollment-roster 400 (missing code), mobile lookup 401 and count-capabilities path 401. The last 401 **does not establish that a count route exists**: the existing mobile router applies authentication to unmatched paths too. Refreshed backend main has no dedicated count implementation; this new candidate is unpushed and undeployed. The live deployed SHA was not independently established during this phase.

OPTIONS from the existing hosted PDA origin returned **403** again. No `no-cors`, token minting from runtime secrets, auth weakening, public tunnel, proxy, CORS change or inventory write was used. The probe of `/health` returned 404; source mounts health at `/admin/health`, so that probe is not a backend-health failure claim.

Render's connector reported no selected workspace. Listing found **My Workspace** (`tea-d58i7hchg0os73bqofb0`); the connector requires user confirmation before selecting it. No service deployment or environment variable mutation was attempted.

## Exact activation review boundary

Approval must name the existing backend and preview targets, not authorize a new public service:

1. Confirm Render **My Workspace** and the existing `paasrtsm-project` backend target. Recheck the deployed revision and concurrent-owner changes before applying the candidate.
2. Approve the additive count-ledger migration (candidate `080_add_pda_001_count_ledger.sql`, number must be rechecked before merge), backend deployment, and enabling the branch-001-only flag. Inspect actual production migration history/separator style first per backend AGENTS.md; do not run the general Windows migration runner.
3. Approve allowing only `https://sc-stockday-pda-lab.scgroup1989-it.chatgpt.site` as needed by existing CORS configuration, preserving all other rules, and updating that same existing PDA preview. No wildcard CORS, new service/cost or permission-role change is proposed.
4. Use the existing authenticated branch-001 enrollment flow for the first real staff/device acceptance. No real code/token should be pasted into a public report. Verify a real barcode, chosen unit, count receipt and second client before admitting a live pilot.

These approvals would enable a **real count-record ledger pilot only**. Letting manual counts replace website stock requires a separately accepted canonical product/unit and source-selection contract; that is not hidden inside this activation. Production schema/deployment/CORS and preview publication remain unchanged until their explicit approval.

## Recovery

Before enabling, the default-off routes are inert. If enabled later, disabling `FEATURE_MOBILE_COUNTS_001` stops new count access; retain the append-only evidence tables. Do not delete recorded counts or reverse official stock, because this candidate never writes it. The test containers are temporary loopback resources and are stopped after evidence collection; they are not a staging service.
