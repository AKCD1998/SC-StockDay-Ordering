# PDA integration living state

Login continuation: [three reusable fixture operator codes and exact 7:1 entry row](PDA_OPERATOR_CODES_AND_LOGIN_2026-11-04.md). The requested introductory copy is removed. Reusable-code auth is opt-in and fixture-only; real enrollment/auth remains unchanged. Eight new HTTP/PostgreSQL checks, eight contract regressions and actual browser account/layout checks pass. Six months is a reminder, not an automatic lockout. New source intentionally changes only the fixture auth adapter/client selection and login presentation; previous artifact hashes remain historical.

Latest isolated implementation, 4 November 2026: [audit cases, branch replies and Ada adjustment preparation](PDA_AUDIT_CORE_DELIVERY_2026-11-04.md). Actual HTTP/PostgreSQL/browser and a manual Codex fixture iteration passed. Current review migrations are 080/081/082 after resolving the upstream 077 numbering conflict. Audit input reads raw transfer evidence; complete movement/canonical-unit/confirmed-lot and Ada execution contracts remain pending. No production activation or hourly task was performed. Older checkpoints below retain their historical scope.

Updated: 2026-11-01, Asia/Bangkok. ScProductDev R2 acceptance remains recorded for 2026-10-31; a later branch-001 PostgreSQL pilot candidate is prepared but not activated. Owner: existing PDA conversation. Existing Transfer Delta owner was consulted once through the coordinating conversation; response received and incorporated. No replacement owner, CPU-v5/Delta work, or production changes.

| Area | State | Evidence / practical limit |
|---|---|---|
| Hosted PDA | Unchanged, v4 | Existing Sites project metadata read; no source push/save/deploy |
| Approved navy/yellow styling | Preserved | style.css byte-identical to prior committed review |
| Scanner/manual capture/torch-off default | Preserved | camera-scanner, decoder, core and original policy modules unchanged; existing camera checks reused |
| Existing real mobile contract | Owner-confirmed, partial runtime proof | Exact routes/auth/read shape; owner saw anonymous 400/401. No enrolled-device live read |
| Mobile read adapter | Implemented; fixture-tested | Strings/leading zeros, null/zero/negative, unknown pack/uniqueness/cutoff; no fresh/current claim |
| Real mobile stock freshness | Unknown | Full Sync without stock observation timestamp; price/fetch timestamps excluded |
| Hosted-to-production mobile access | Blocked | Owner reported OPTIONS 403 at 11:19 ICT; no bypass attempted |
| Shared count/lot/date storage | Implemented locally | Real SQLite WAL + transaction + immutable rows, synthetic products/accounts only |
| Authentication/assignments | Implemented fixture isolation | Server verification, branch/task/role constraints, expiring session+CSRF. Not production PIN/enrollment |
| Receipts / dedup / conflicts | Implemented and HTTP-tested | Original receipt on same request retry; altered/scoped replay denied; stale revision retained |
| Corrections / source-choice audit | Implemented and tested | New linked record + original retained; source history survives restart |
| Offline queue / cold reopen | Implemented and browser-tested | IndexedDB + app-shell cache; no API/receipt caching; actual reconnect required |
| Multiple browser clients | Tested locally | Separate authenticated contexts see same persisted records. Not a remote phone test |
| Real server-process restart | Tested | SQLite evidence/session/receipt/source history survive a new process; UI records also reopened afterward |
| ScProductDev integrated local run | Verified by coordinator on Windows | Exact R2 artifact/hash; Node v24.11.1 win32; read-only preflight, eight portable checks and browser receipt. [Recorded host evidence](evidence/PDA_SCPRODUCTDEV_ACCEPTANCE_2026-10-31.json) |
| ScProductDev Windows offline / camera / HID | Not tested in host acceptance | Prior cloud browser checks remain separate; no camera permission granted |
| Old ScProductDev port-8765 HTML | Unchanged static review | Not the integrated port-4180 API run |
| Physical Android acceptance | Pending | No physical-phone scan, torch, Volume+ or Bluetooth acceptance claimed |
| Real inventory / financial writes | Excluded | No production SQL, Sync, receiving, transfer or official-stock mutations |
| Real staff enrollment / new credentials | Not performed | Original fixture PINs unchanged; no production account/key/permission operations |
| Remote staging / APK deployment | Not performed / pending approval | No staging service was established or exposed |
| Branch-001 real-count integration candidate | Implemented and isolated-tested; production activation pending | New default-off backend PostgreSQL ledger plus real-enrollment client/screen; [activation review](PDA_001_PILOT_REVIEW_2026-11-01.md). No deployed/live count or human stock override claimed |
| Shared StockDay website / PDA reads | Implemented and cloud-integrated | Existing product-list entry, lot/receipt/correction/expiry views and source resolver use the same PostgreSQL evidence; [current delivery](PDA_SHARED_INTEGRATION_2026-11-01.md) |
| Team stocktake sessions / floor rounds | Scope and independent-round primitives implemented; full session workflow pending | Immutable event/area/round scopes, separate heads and same-counter rejection now work. Formal task leases, blind entry, lead reconciliation/finalization and workbook export remain outside this milestone |

## Worker interface update — 2026-11-04

The existing branch-001 pilot has a guided Count / Records / Operator interface based on read-only research of official InvenTree/OCA GitHub projects. The original SC implementation preserves the API client, count payload, outbox, scanner and backend. [Research, scope and verification](PDA_WORKER_UX_2026-11-04.md). Actual cloud-local HTTP/PostgreSQL/browser roundtrips passed with the revised UI; targeted touch/focus/fake-camera checks passed. This is not an update to hosted v4, an APK, new ScProductDev acceptance, staging or a physical-phone trial. Existing integration and production gates remain in force.

## Actual verification

Prior cloud-local measured results: 37 actual HTTP/SQLite assertions passed; 6 mobile-contract fixture tests passed. Integrated UI, real offline cold reopen, existing camera/torch-off controls, and static correction-flow regressions passed without browser errors. These checks were already scheduled for the implementation; the later status-only clarification did not restart work or trigger duplicate tests. ScProductDev's later bounded Windows acceptance is recorded separately below.


- `apps/pda-demo-server/tests/api_roundtrip.py`: actual HTTP requests to a separate real Node process and isolated SQLite file, with process termination/restart. Covers authorization, role filtering in the existing handler, assignment/branch/CSRF/origin enforcement, quantity/date/unit checks, idempotency, original preservation, lost-response replay, source history, conflicts and restart.
- `tests/ui_roundtrip.py`: real UI -> API -> durable receipt -> another browser client; two-lot correction with manufacturing/expiry dates; offline queue and retry.
- `tests/offline_reopen.py`: actual network-offline cold reload via app-shell cache; original request/capture time retained; real receipt only after reconnect; API routes absent from cache.
- `apps/pda-preview/tests/mobile-contract.test.mjs`: explicit contract fixtures, including absent pack identity, ambiguous mapping and price-vs-stock time. These are not live authenticated production tests.

Sanitized evidence is retained in the integration handoff artifact. Session cookies, CSRF tokens, bearer tokens and SQLite session files are excluded from distributable artifacts. Paths/receipt/event IDs in evidence identify synthetic test records only.

## Next smallest blocked step

To run a remote-phone pilot, the existing owners must approve an isolated, reachable HTTPS staging endpoint and its auth/count schema/route contract. Current production CORS denial must remain in force until explicitly reviewed. The local demo is complete enough to review/test that contract; it is not proof that those staging decisions have been approved or implemented.

## Continuation: concrete local usability/startup gaps

The completed 37 HTTP/SQLite checks and 6 read-contract tests are retained as prior verified results; consultation was not repeated. The next isolated phase fixes three discovered gaps:

- `/index.html` previously bypassed the server's API marker and could open browser-only mode. Both root and index now serve the integrated entry; the offline shell includes both.
- The sample always targeted staff01's item. Samples now respect current assignments; unauthorized count/correction entry points are disabled/guarded before data entry. Backend authorization remains authoritative.
- Delivery now includes read-only runtime/database/route-contract preflight and a portable Node-only verification command. Windows line endings are supported; missing runtime/dependencies, actual route drift, unrelated SQLite files and occupied ports are bounded failures without installation, overwrite, external binding or interference with existing listeners.

Targeted evidence is recorded separately from the prior full regression results. At R2 packaging, ScProductDev execution was **PENDING**; that checkpoint is superseded by the coordinator-supplied Windows acceptance below. A cloud-local run, a generated review artifact, or the old static port-8765 page is not that host result. No physical Android was needed for these startup/HTTP/browser checks.

### Targeted results for this continuation

Cloud-local startup checks: 7 passed (existing-store read-only compatibility, missing backend, foreign-database refusal, route drift refusal before execution, CRLF compatibility, occupied-port preservation, forbidden network option rejection). The new portable Node verifier passed count/receipt/retry/second-client/correction/source-history checks. The targeted browser test passed integrated `/index.html`, staff02 assignment/sample, disabled unauthorized controls, direct scan guard, real receipt and offline index reopening. The existing pending-queue cold-reopen test was rechecked only because the offline cache/entry changed; it passed. No prior consultation or full 37-check suite was repeated.

`style.css`, camera/capture/decoder, original count policy, API client and owner-confirmed mobile normalizer, and the durable SQLite store core remain byte-identical to the previous delivery. Startup guards and entry/assignment wiring are isolated additions. The source bundle was handed to the coordinator via `PDA_SCPRODUCTDEV_ACCEPTANCE.md`; its original packaging reports retain their historical PENDING checkpoint.

### ScProductDev bounded acceptance received — 2026-10-31

**VERIFIED_SC_PRODUCTDEV_LOCAL_FIXTURE_ONLY.** The coordinator supplied sanitized host evidence, checked at `2026-10-31T15:40:11.8400766+07:00`. This owner recorded the handoff without rerunning tests, opening the remote screenshot, or changing implementation. The normalized [evidence supplement](evidence/PDA_SCPRODUCTDEV_ACCEPTANCE_2026-10-31.json) identifies its provenance and remote evidence paths.

- Exact artifact `SC-PDA-LOCAL-R2`: 928392 bytes, SHA-256 `449e2548bab056732c670985657b446e7f4e198fd67cfedb5c9f9b12fe87ae7c`, source commit `ae9a5aef375873d2d3f9703fe4c1e098128eaefa`; identity matched before guarded extraction of 45 members. The verified ZIP and original artifact identity remain unchanged.
- Existing Windows Node `v24.11.1` and backend dependencies passed read-only preflight against the pinned canonical mobile route hash. The portable verifier passed all eight prescribed checks, including a durable count receipt, exact retry, second authenticated client, linked correction with two lot dates, and source-selection audit. These remain synthetic SQLite fixture results, not live API compatibility proof.
- Normal browser `/index.html` showed `DEMO · SHARED API` as staff02. DEMO-001–003 count actions were disabled; the HOME assignment-aware sample opened DEMO-004. A partial count of 1, lot `SCPRODUCTDEV-LOCAL-CHECK`, explicit unknown manufacturing/expiry dates and complete-product unchecked produced receipt `d6788587-5b08-47c7-84b6-ec998cd4d045`, displayed as received at 15:34 ICT. The screenshot remains on ScProductDev.
- Initial extension navigation was rejected by the existing cross-site guard; ordinary address-bar navigation succeeded with the guard unchanged. No camera permission was granted. Windows offline/camera/HID and physical-phone acceptance were outside this run.
- Fixture staff02 logged out and only the acceptance tab was closed. Ctrl+C did not stop the listener; after checking executable, start time and ownership, the coordinator stopped only Node PID 18708. PID absence and port-4180 `ECONNREFUSED` confirmed cleanup; post-stop read-only preflight recognized the existing isolated fixture store. This is a reported cleanup outcome, not a graceful-shutdown acceptance claim.

No software installation, remote exposure, production/staging deployment, official inventory write, schema/permission/auth/CORS change, or change to another repository/listener or old port 8765 was reported. Hosted v4 is unchanged. Approved reachable HTTPS staging, accepted real auth/count/product-identity contracts, deployed count/lot/receipt/offline routes, and physical-device acceptance remain pending. Recording this handoff triggers no new implementation or retest.

## Branch-001 production request — 2026-11-01

The user selected branch 001 for the real integration. Existing main was refreshed to `f49f7d2`; its mobile read remains Full Sync without a stock observation time or stock unit basis, independent of the branch-004 Hourly display. A candidate count ledger was prepared in an isolated worktree of the existing backend. The original main checkout, R2 archive, accepted demo/scanner/theme and hosted preview were preserved. The existing read adapter received only a fetch-receiver binding fix exposed by a real browser check.

The new candidate passed 11 Node tests over actual isolated PostgreSQL/HTTP, 7 read-contract tests, and the browser receipt/second-client/correction/offline queue-to-online-reopen flow. It is not an actual ScProductDev run, a physical-phone test or production proof. After resolving missing dependencies only inside the isolated review worktree with scripts disabled, both existing full-server mobile regression files passed (13 tests, with production runtime variables excluded). No dependency install was performed in the owner checkout. PostgreSQL test containers and review-worktree dependencies are isolated cloud test resources, not installed production/ScProductDev software.

Production activation is pending the exact migration/deployment/CORS/preview approval and enrolled branch-001 acceptance described in the [review](PDA_001_PILOT_REVIEW_2026-11-01.md). The hosted origin still received OPTIONS 403. Render workspace selection is also unconfirmed. The proposed pilot records real observations separately; it does not feed them into branch-stock source selection or change official inventory.

### Supplied twice-yearly stocktake examples

The user then provided the June-16/17 branch-001 workbooks and confirmed that count 1/2/3 are independent recounts of the same stock. The [read-only findings and architecture addendum](PDA_BIANNUAL_STOCKTAKE_WORKBOOK_FINDINGS_2026-11-01.md) preserve that requirement, blanks versus zero, identity-based matching across reordered rows, and branch/code ambiguities. No workbook was modified or operationally imported. This is workflow context, not approval to activate the earlier production candidate. Sessions, area/round ownership and main-website reconciliation/export remain unimplemented; they are required before claiming a replacement for these workbooks.

## Shared web/PDA integration continuation

The later pasted request explicitly authorized completing the code and integrated candidate while retaining production restrictions. [SC-PDA-SHARED-INTEGRATION-R1](PDA_SHARED_INTEGRATION_2026-11-01.md) now connects the real StockDay React app's feature-gated product entry and lot/history/expiry workspace to the same PostgreSQL count/receipt/correction records as the PDA. It adds scope/round isolation, shared source decisions, GUI enrollment, offline draft/queue cold reopen, expired-enrollment recovery and actor-safe drafts. The old original/correction and independent-round quantities are not added.

Measured results: 12 HTTP/PostgreSQL tests, 18 existing-mobile/policy tests, 46 React tests, one async auth-race test, actual full-app browser roundtrips, and production-target builds passed. The isolated browser harness uses synthetic baseline product/navigation data plus actual existing auth/enrollment and candidate count/read implementations. No live authentication/write, new ScProductDev acceptance, staging or physical-phone acceptance is implied. Original R2/earlier archives and accepted scanner/theme core remain unchanged. Count receipts are live in the test database only; human operational selection remains held because real unit/movement proofs are absent.

Deployment assets, a merge-only exact-origin CORS plan and rollback are prepared. Production actions and first enrolled branch-001 live acceptance remain pending. No new project, Site, remote service, permissions or credentials were created; no production or official stock changes were made.

## Category / round update — 2026-11-04

[Current category/round interface and verified scope](PDA_CATEGORY_ROUND_2026-11-04.md). Existing server scope IDs carry the chosen counting group and independent round. Actual cloud-local HTTP/PostgreSQL checks passed; no production scope creation, deployment, live catalog classification or new host/phone acceptance is claimed.
