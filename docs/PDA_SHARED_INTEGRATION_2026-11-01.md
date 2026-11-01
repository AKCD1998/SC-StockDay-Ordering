# Shared branch-001 PDA / StockDay integration

Date: 2026-11-01, Asia/Bangkok. Candidate **SC-PDA-SHARED-INTEGRATION-R1**. This continues the same project, Site and owner. The pasted request authorized code/integration/testing and explicitly retained the previous production boundary. No production migration, deployment, CORS change, real enrollment or official stock/financial write was performed.

## Implemented connection

The existing StockDay React product list now has a feature-gated branch-001 lot/count entry and expiry workspace. It uses normal StockDay web-session authentication. The PDA uses existing mobile enrollment/Bearer authentication. Both call the existing backend and share `ordering.pda_count_*` PostgreSQL records and the same source-selection service. Existing products remain products; lots are child evidence, never new SKUs.

The backend production composition mounts both routers. Isolated runtime verification used their actual factories and existing auth/enrollment routers over HTTP/PostgreSQL; baseline catalog/navigation responses in the browser harness were explicit synthetic fixtures. This does not prove deployed schema/authenticated live-product compatibility.

| API | Authentication / result |
|---|---|
| Existing `/api/mobile/enroll/start` | Existing branch web session + CSRF, or mobile manager. Website button issues the one-use code |
| Existing `/api/mobile/enroll/roster`, `/redeem` | PDA UI selects an eligible name and redeems the code. No manual Bearer copying, new PIN or refresh route |
| `/api/mobile/counts/capabilities`, `/scopes` | Existing enrolled device, active staff/role and branch 001; contract `sc-pda-count-ledger-001-v2` |
| `/api/mobile/counts/products/by-barcode/:barcode?scopeId=…` | Exact string lookup, explicit unit and scope revision, shared source decision |
| `POST /api/mobile/counts` | Immutable scoped request; transaction stores event/lots/receipt/head/source audit |
| `/api/mobile/counts/history`, `/products/:productCode/summary` | Actual stored evidence and the shared read model |
| `/api/stock-counts/capabilities`, `/scopes` | Existing web session. Server fixes pilot branch to 001; other effective branch contexts rejected |
| `POST /api/stock-counts/scopes` | Existing branch master or admin + CSRF creates immutable event/area/round scope |
| `/api/stock-counts/products/:productCode` | Product reference, active scoped observations, original/correction history, receipts and source decisions |
| `/api/stock-counts/events/:id` | Read an original event, including one outside the current history page |
| `/api/stock-counts/expiry` | Last-observed lot/date evidence, with explicit scope/round and uncertainty |

## Data and concurrency

Migration 077 from the previous candidate is retained; additive candidate migration 078 creates immutable count scopes and adds them to events/heads. The head/revision identity is **branch + existing product + chosen unit + scope**. Scope includes event/session key, area key, round 1–3 and whole-branch/location coverage. Round 2 is not a correction to round 1. The same staff member cannot supply another independent round for the same event/area/product/unit. Full stocktake assignment leases, blind-entry controls, lead reconciliation/finalization and workbook export are not claimed by these scope primitives.

Scope is read from the server, not trusted from a free-form client branch. Each lot stores code, decimal quantity, explicit unit and nullable full manufacturing/expiry dates. Null means unknown; invalid/missing day fields are rejected. Month-only printed date precision remains a separate unfinished contract; no day is invented. Quantity total uses integer thousandths. Source barcode/SKU strings retain leading zeroes. Missing factors remain null and are never inferred from names/prices.

One count uses one explicitly selected unit; mixed packs require separate unit observations until a conversion contract is verified. Neither round totals nor different units are automatically combined. History displays the frozen reference at scan and at submit separately from today's reference, retaining the original discrepancy context.

An identical event/actor/device/payload retry returns the original receipt. Altered or different-device replay and stale scope revisions fail. Transaction locks cover event retry, independent-round checking and the product/unit/scope revision. HTTP-process restart retains committed records/receipts. PostgreSQL fixture storage was temporary container tmpfs; no host/disk or PostgreSQL-reboot durability claim is made from that fixture.

Original events/lots/source audit reject UPDATE/DELETE. A correction links the current original in the same product/unit/scope, preserves its effective observation time, records its reason/current actor, and exposes separate capture, received and corrected times. Only the original staff member or existing mobile manager may correct. Different-round and original/correction quantities are not added.

## Shared stock-source rule

`pdaStockSource.js` evaluates complete coverage, branch enablement, comparable canonical unit/owner/version, validated event, reconciled rounds when applicable, and a complete deduplicated movement stream verified through selection time. HTTP clients cannot supply those proofs. Library tests exercise qualified selection with explicitly synthetic trusted proofs.

The actual current contract supplies **no canonical stock-unit/movement proof**, so production-facing reads keep human evidence unselected and explain why. The fallback is the verified existing mobile Full Sync reference with unknown stock observation time/unit basis. Null, zero and negative quantities remain distinct. Price timestamps, fetched-at and receipt time never become stock observation time. No eligible Hourly-001 contract was established; the 004 Hourly/Shopee readers and existing stock table/recommendation totals are unchanged. The new website/PDA count views read the same resolver; no human override or official-stock writer is activated.

Expiry views use unsuperseded observations after the latest complete scope snapshot, retaining later partial observations per printed lot identity. A later partial survey does not erase earlier observed lots it did not inspect. Superseded originals are excluded from active expiry evidence. Unknown lot identities remain separate evidence. Rows are never summed across independent rounds and are labelled **last observed at count**, not current lot balances. Subsequent sale allocation and global lot identity remain unverified.

## PDA recovery and UI

Token material stays in memory. Origin/actor/device-scoped IndexedDB retains an immutable serialized queue and separate draft/context metadata. A cached public identity can restore local drafts within its stored expiry, with an explicit local-only banner; it grants no server authentication. Explicit logout prevents automatic actor restoration. Re-enrollment uses the existing one-use-code UI, then submits the same queued UUID/payload/capture and observation times. Switching operators never relabels the previous operator's draft.

Statuses correspond to evidence: draft is local; queued has no receipt; received requires the actual compatible server receipt; HTTP 409 stays a visible conflict with its original request; rejected input remains retained. No silent rebase/re-ID is performed. A stale 401 response from an old enrollment cannot clear a newly enrolled identity. Server revocation/expiry remains authoritative on every mobile request.

The pilot app shell has a file-specific service-worker scope `/pilot-001.html`, leaving the accepted R2/index worker unchanged. Only explicit public shell/decoder assets are cached; API/auth/receipts are never synthesized or cached. The preparation script fingerprints its own shell cache without deleting another worker's caches. Existing navy/yellow/white CSS, scanner, deliberate capture and torch-off default remain intact. A native APK, Volume+ adapter and physical camera/HID acceptance are still pending.

## Actual verification in this phase

- **12 Node PostgreSQL/HTTP tests** (one parent and 11 scenarios): exact identity/null/zero/negative semantics, actual counts/lots/dates/receipts, web-session reads of PDA records, branch/CSRF denial, dedup, concurrent conflict, immutable correction/source audit, HTTP-process restart, rerunnable migration, separate independent rounds and same-counter rejection.
- **18 backend regression/policy tests**: 13 existing mobile product/enrollment tests plus 5 source-selection tests. Existing auth contracts were not replaced.
- **46 React tests**: 40 existing branch-stock regressions, 3 lot/history/expiry/session tests and 3 feature-entry isolation tests. Branch 004 has no new entry even with the pilot frontend flag enabled.
- **1 asynchronous client test**: delayed old-session 401 preserves new enrollment.
- Actual full StockDay React app + separate PDA browser contexts + HTTP/PostgreSQL: web-login UI → enrollment-code UI → PDA name selection → count receipt → website refresh/cold reload → lot/date/operator readback → linked correction/original → expiry. The same source decision was compared between both endpoints.
- Real browser offline draft and queued-count cold reopen, immutable payload after re-enrollment, expired enrolled-device recovery, two-phone conflict with retained queue, and actor-switch draft isolation passed. The offline event had exactly one PostgreSQL row; the conflicting event had none. API cache keys were empty. No browser script errors.
- Production-target website/PDA artifacts built successfully. A separate real-app visual check verified the modal heading contrast on white (13.15:1) after fixing inherited styling; that visual check did not repeat count writes.
- Direct local fixture CLI started on loopback, enforced anonymous 401 and stopped its owned process. Test dependencies were local workspace resources only; no production/ScProductDev software was installed.

These are **cloud-local fixture/database/browser results**. Existing ScProductDev R2 acceptance remains tied to its old exact SQLite ZIP; it is not acceptance of this PostgreSQL candidate. No live enrolled 001 read, deployed count write, staging acceptance or physical-phone acceptance is claimed. Earlier Transfer Delta consultation and R2 suites were reused, not repeated. The original R2 and prior candidate archives are unchanged.

## Open and prepare locally

Use the existing two repositories and their dependencies. Never point the fixture commands at production. The fixture tests require a fresh isolated PostgreSQL named `pda_001_fixture`; they refuse a populated database rather than resetting one.

```text
# Seed/verify a separate local fixture PostgreSQL (POSIX shell example):
PDA_FIXTURE_PG_PORT=<loopback-pg-port> PDA_PILOT_CLIENT_MODULE=<SC-root>/apps/pda-preview/mobile-count-pilot.mjs node --test tests/pda_001_postgres.test.js

# Full browser run builds the existing StockDay app against its owned loopback API,
# then stops its owned HTTP process. Run from the existing backend worktree:
PDA_FIXTURE_PG_PORT=<loopback-pg-port> PDA_FIXTURE_FRONTEND_ROOT=<SC-root>/apps/pda-preview PDA_PILOT_EVIDENCE_DIRECTORY=<review-dir> node tests/pda_full_browser_runner.js
```

For interactive review, build StockDay with `VITE_API_BASE_URL=http://127.0.0.1:4182`, `VITE_FEATURE_PDA_COUNTS_001=true`, `--base /stockday/` and a separate review output directory. Then, from the backend worktree:

```text
node tests/fixtures/pda-001-http.js --isolated-fixture-only <loopback-pg-port> --enabled <SC-root>/apps/pda-preview <local-web-build-dir> 4182
```

Open `http://127.0.0.1:4182/stockday/#/branch-stock`, fixture web user `fixture-branch001`, public fixture password `fixture-only-password`. Open PDA at `http://127.0.0.1:4182/pilot-001.html` in another context. Issue enrollment from the website and select Fixture Alice/Bob on the PDA. No token copying. The launcher refuses nonfixture DB identity, binds loopback, installs no service, and does not stop an occupied port's listener. Stop only its foreground Node process. These fixture credentials/routes are test-harness-only and are not production login accounts.

Prepare the actual deployment assets, without provider access or DB writes:

```text
node scripts/prepare-pda-001-candidate.mjs --out <new-review-artifact-dir>
```

It consumes `deployment/pda-001-candidate.json`, copies the existing PDA source with a reviewed API origin and builds the existing StockDay website. Optional `--current-cors <public-origin-array.json>` creates a merge-only review plan; absence is explicitly unverified, never a replacement allowlist. It does not deploy, push, create credentials or alter CORS. Linux execution is verified; this new launcher/build flow is not Windows/physical-phone accepted.

## Bounded production admission and rollback

Production actions remain pending under the user's explicit scope:

| Action / target | Effect | Rollback |
|---|---|---|
| Confirm existing Render My Workspace / `paasrtsm-project` | Select the intended existing backend; no new service | No mutation from selection |
| Review/apply migrations 077 and 078 to existing StockDay PostgreSQL | Add evidence/scopes; do not change official stock tables | Disable pilot; retain immutable evidence. Do not drop counts |
| Deploy existing backend and enable 001-only flag after schema readiness | Authenticated pilot routes only; 004 unchanged | Disable `FEATURE_MOBILE_COUNTS_001` |
| Append exact existing PDA origin to CORS if absent | Allow the actual reviewed origin; preserve all existing entries/credential policy | Restore only the reviewed diff, preserving concurrent changes |
| Publish existing StockDay website and same PDA Sites project | Expose matching feature-gated views and `/pilot-001.html` | Restore prior builds/site version; retain DB records |

Before applying, refresh concurrent source/migration numbers and deployed revision. Inspect actual migration history/separator style under backend AGENTS.md; never blindly run the Windows migration runner. The Render workspace and current CORS snapshot were not re-established by this local phase. The last actual hosted-origin OPTIONS check returned 403; no bypass, public tunnel or production proxy was used.

First live acceptance then requires an existing branch-001 authenticated web account and eligible mobile staff enrollment through the UI. If login/OTP is needed, the user completes that screen; no password or Bearer token is requested in chat. No new cost, remote service or persistent access is proposed. Official human-stock publication still requires accepted unit/identity/movement evidence and remains disabled independently of count-record receipt.
