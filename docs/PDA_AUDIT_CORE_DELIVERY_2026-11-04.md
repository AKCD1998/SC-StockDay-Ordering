# PDA audit core: isolated implementation delivery

Later login update: [operator codes and compact entry](PDA_OPERATOR_CODES_AND_LOGIN_2026-11-04.md). The prior audit-core artifact is unchanged; its earlier transport hashes refer to that pinned version. Count/audit runtime semantics remain intact.

Date: 4 November 2026, Bangkok. Continues the same SC StockDay/PDA and existing backend worktree. User requested implementation with a hard stop by 19:45. This delivery is a cloud-local synthetic integration; no production deployment, Ada stock write or scheduled task activation occurred.

Backend review commit: `e8cbcfa940bb6b11fb91c7b534b62bd99c93d702` on the existing isolated `codex/pda-001-count-pilot` branch. No push/merge occurred. Frontend source and artifact identity are pinned in the final bundle manifest.

## What is implemented

- Authenticated branch-001 audit input reads the existing durable PDA count heads/receipts and actual raw-transfer table contract from migration 015. It retains source/destination fields, document/line identity, raw status, references, nullable unit/factor/lot/date fields and separate source-sync times. It exposes no costs and performs no Ada mutations.
- Versioned durable audit cases, findings, branch questions/replies, reviewer resolution/reopening, immutable event receipts and immutable run receipts. A count correction or changed transfer evidence makes an earlier case stale. A subsequent finding updates/reopens the same scoped issue rather than deleting history.
- Exact original-request retry returns its original receipt; changed payload/actor and stale versions are rejected. Candidate lot links must cite an observed lot ordinal and a returned exact transfer line. All such links remain candidates; this phase cannot promote inferred lineage to verified.
- The existing StockDay count workspace now displays cases and replies, opens manual/reviewer findings and prepares an immutable Ada adjustment preview. Existing admin/branch-master authority manages review; existing enrolled branch staff can read and reply. No new production role, credential or permission was provisioned.
- The PDA's existing Records tab includes an optional question inbox. Replies use existing enrollment transport and real server receipts. A lost response retries the identical request; a version conflict preserves text, loads current context and requires another explicit send. Logout clears the inbox and pending in-memory reply state. Count drafts/outbox remain the existing durable mechanism. Unsent audit-reply drafts are not a new durable offline queue and must not be represented as one.
- An immutable adjustment preview binds the case/count receipt and current evidence digest. It retains quantity/unit/lots and explicit blockers. Official before/after/delta stay null when stock time, canonical unit and movements are unverified. The execution endpoint rejects with `ADA_WRITE_UNAVAILABLE`; the UI send control is disabled. This is concrete preparation for the required Ada feature, not an implemented Ada writer or an approval to adjust stock.
- A fixture-only bridge permits a manual Codex read/analyse/record iteration without an external LLM API. It starts only an owned loopback HTTP process, requires the synthetic database/write guard, uses existing fixture auth in memory, records findings/run receipts, then stops its process.

## Actual route contract

All paths below inherit the existing count-pilot default-off flag, auth and branch-001 guards. Responses use `Cache-Control: no-store`. Contract: `sc-pda-audit-001-v1`.

| Web path under `/api/stock-counts/audit` | Behavior |
| --- | --- |
| `GET /capabilities` | Branch/contract; official writes and execution false |
| `GET /work-items?afterProductCode=…` | At most 100 recorded-count product codes; explicit paging and counted-products-only coverage |
| `GET /products/:productCode/input` | Reviewer-only consistent read snapshot with stable input digest |
| `GET /cases?productCode=…`, `/cases/:id` | Cases and immutable history, stale-evidence indication, prior previews; list capped at 100 and flagged if truncated |
| `POST /findings` | Existing reviewer + CSRF; stable request UUID, expected case version, active count event and current input digest required |
| `POST /cases/:id/replies` | Existing authenticated branch identity + CSRF; immutable reply receipt |
| `POST /cases/:id/resolve`, `/reopen` | Existing reviewer + CSRF; resolution rejects changed evidence |
| `POST /cases/:id/adjustment-preview` | Existing reviewer + CSRF; persists a blocked preview with an independent receipt |
| `POST /adjustment-previews/:id/execute` | Always rejects; no executor or official stock write |
| `POST /run-receipts`, `GET /run-receipts/latest` | Actor-bound durable run evidence; cited events must already be accepted. No verified movement checkpoint is invented |

Mobile routes under `/api/mobile/counts/audit`: capabilities, case list/detail and `POST /cases/:id/replies`. They inherit the existing enrolled-device/staff eligibility checks. Mobile staff cannot create findings, resolve cases or prepare/execute adjustments through those routes. Bearer auth remains the existing enrollment contract; no PIN/refresh API was added.

Finding fields: `requestId`, `expectedVersion`, `productCode`, `countEventId`, `inputDigest`, `issueType`, `title`, `message`, optional `question` and candidate `lotLinks:[{lotOrdinal,transferLineKey}]`. Server derives actor, branch, case identity and lineage status. Issue types: quantity-review, lot-origin, movement-review, unit-review. Replies/resolutions use `requestId`, `expectedVersion`, `message`. Preview creation accepts only request UUID and expected case version.

Raw-transfer input is capped at 100 lines, count scopes at 100, with explicit truncation. Transfer coverage and complete movement ledger remain unknown/false. A process flag is not independently certified physical arrival or stock effect. This phase does not connect every purchase/sales/return/adjustment movement type, establish canonical unit equivalence, infer FIFO/FEFO depletion or confirm statutory ขย.9/10/11 completeness.

## Migration reconciliation

Read-only fetch found upstream `3ab71e7131739887cda6c216e30a031daf198565` with `077_add_focus_freeze_audit.sql`. The older isolated PDA candidate had independently used 077. Its count/scope SQL was renamed byte-for-byte to **080 / 081**, and the new audit schema is **082**. Current tests and the deployment review configuration reference these names. No upstream file or migration history was modified; prior artifact ZIPs remain unchanged.

Do not blindly run these files in production. Before a future merge/deploy, refresh concurrent source/numbers, reconcile the full migration chain and inspect the actual `schema_migrations` path style under backend AGENTS.md. This work applied only the new isolated fixture schema. Renaming a review candidate is not proof of production migration compatibility.

## Verification completed

- **11 PostgreSQL/HTTP audit tests**: actual existing auth/enrollment/count receipt, branch/CSRF/default-off denial, exact transfer schema reads, null/negative/leading-zero semantics, stable digest, concurrent receipt deduplication, candidate-only lot links, mobile reply/actor isolation, stale edits, blocked preview/execution, durable run receipts, source-state and linked-count correction invalidation, append-only journal/previews, rerunnable migration and actual HTTP-process restart.
- **12 existing count PostgreSQL/HTTP tests**, rerun because shared routers gained an audit mount and candidate migration filenames changed. Count/lot/date/receipt/retry/correction/concurrency/source rules and independent rounds still pass.
- **6 existing website tests**: count entry/workspace/session behavior pass with the audit panel added.
- **Actual existing React website + PDA + HTTP/PostgreSQL browser flow**: separate authenticated sessions; branch question; stale reply retains text and requires an explicit new send; response deliberately lost after actual server acceptance; identical retry returns the same receipt; SQL confirms exactly one row; reply visible in the website; blocked adjustment preview; real offline shell/draft cold reopen with the new inbox module; no API-response caching; logout clears inbox; no browser script errors. Camera/HID/physical-phone behavior was not retested.
- **One manual Codex iteration**: Codex read the synthetic input, distinguished missing units/time and multiple possible transfer origins, and recorded a movement-review case plus a real run receipt through the API. No external LLM API was used. It did not infer a numeric shortage from incompatible evidence and did not write official stock. This is not a scheduled production run.
- SQL readback: two count events retain original 3 and correction 6, two audit cases, nine immutable audit events, two previews and two run receipts; official fixture stock stays 6. These counts describe the delivered fixture evidence, not production.

Evidence is packaged as `http-postgres-evidence.json`, `http-postgres-tests.tap`, `count-regressions.tap`, `website-regressions.log`, `browser/browser-audit-roundtrip.json`, `sql-readback.json` and `codex-manual-{input,finding,result}.json`. Browser screenshots contain synthetic products/accounts only. Cookies, CSRF/Bearer material, session tables and database files are excluded.

## Run within the existing isolated repositories

Prerequisites are existing dependencies, Node and a fresh isolated PostgreSQL at an explicitly selected loopback port, database `pda_001_fixture`, fixture account `pda_fixture` with public password `pda-fixture-only`. Do not use production connection strings. The fixture setup refuses an existing populated database rather than resetting it. No software installation or public tunnel is performed.

From the backend candidate:

```sh
PDA_FIXTURE_PG_PORT=<owned-loopback-pg-port> PDA_PILOT_CLIENT_MODULE=<SC-root>/apps/pda-preview/mobile-count-pilot.mjs PDA_AUDIT_EVIDENCE_FILE=<review-dir>/http-postgres-evidence.json node --test tests/pda_audit_postgres.test.js
PDA_FIXTURE_PG_PORT=<owned-loopback-pg-port> PDA_FIXTURE_FRONTEND_ROOT=<SC-root>/apps/pda-preview PDA_AUDIT_EVIDENCE_DIRECTORY=<review-dir>/browser node tests/pda_audit_browser_runner.js
node scripts/pda_audit_fixture_iteration.js --fixture-demo <owned-loopback-pg-port> --read
node scripts/pda_audit_fixture_iteration.js --fixture-demo <owned-loopback-pg-port> --record <reviewed-synthetic-finding.json> <result.json>
```

The browser runner builds the existing website against its own loopback API and stops its HTTP child. For interactive review, rebuild the existing website with `VITE_API_BASE_URL=http://127.0.0.1:4182`, `VITE_FEATURE_PDA_COUNTS_001=true`, `--base /stockday/` into a separate review directory. Then use the existing fixture launcher:

```sh
node tests/fixtures/pda-001-http.js --isolated-fixture-only <owned-loopback-pg-port> --enabled <SC-root>/apps/pda-preview <fixture-web-build> 4182
```

Open `/stockday/#/branch-stock` and `/pilot-001.html` on that loopback origin. The fixture web user/password are `fixture-branch001` / `fixture-only-password`; obtain a one-use enrollment code in the website UI and choose a fixture operator on PDA. These are synthetic fixture identities only. Stop only the owned foreground process. This new workflow is verified on cloud Linux, not on ScProductDev/Windows or a physical Android.

## Exact remaining gates

1. Existing reconciliation/Ada owner contract acceptance and a verified Ada-capable execution environment. Only repository/source-contract review occurred this phase; no new owner consultation was delivered or fabricated.
2. Approved reachable staging/production count + audit API, existing-auth runner admission and one bounded real read/result roundtrip in the target environment. Hosted-origin CORS was previously reported denied; no bypass/change occurred. Only after that should one existing-owner hourly Codex task be enabled. Schedule/prompt files are prepared; no task was created or changed.
3. Confirmed lot lineage requires accepted physical receipt/dispatch evidence and reviewer authority. The current stored links are candidates, not automatic confirmation.
4. Official adjustment needs the proven Ada physical-count/adjustment operation, numbering/warehouse/unit semantics, complete movement alignment, exact approval contract, idempotent executor and verified document/stock-effect readback in an approved sandbox. An old transfer Type 4/7 writeback proposal is not that adjustment contract. Unknown evidence is not permission to calculate a delta.
5. Future production activation requires the separately scoped deployment/migration/CORS and official-stock authority approvals. No new credentials, permissions, costs or persistent access were added. Native APK and device acceptance remain separate.

Hosted v4, old ScProductDev port-8765 HTML and the earlier accepted R2 SQLite package are unchanged. The actual ScProductDev R2 acceptance is not evidence for this new PostgreSQL/audit phase. The final package records cleanup of only this phase's owned loopback HTTP processes and disposable PostgreSQL containers.
