# PDA integration contract and owner consultation

Date: 2026-10-31 (Asia/Bangkok). Scope: isolated synthetic HTTP/SQLite demo. No production deployment, schema migration, official inventory/financial writes, credentials, CORS, proxies or access permissions changed.

## Consultation delivery and evidence provenance

The PDA conversation had no cross-thread send capability and no reachable existing owner agent. The request was **relayed once by the coordinating conversation to the existing Transfer Delta owner** (`01a13f4a-ffa9-7e72-9976-4184ffa2a94d`, local, SCPRODUCTDEV/PaaSRTSM-project). No replacement owner or engineering conversation was created. SERVER004/CPU-v5 work was not accessed or changed.

The owner returned a preliminary finding and then a complete **PARTIAL** handoff through the coordinator. Received, not pending. Owner read-only inspection: **31 October 2026, 11:15–11:23 ICT**. Reported deployed revision: `40ef239a43b7ba2104376aad296242b062ba28d1`. Owner's handoff file: `C:/Users/scgro/Documents/Codex/pda-contract-consult-20261031/PDA-CONTRACT-HANDOFF.txt`. This workspace received its contents by relay; it did not independently open that Windows file.

A read-only `git fetch origin main` in this workspace matched the same backend SHA; mobile route/auth files were unchanged from that SHA. Existing hosted PDA metadata was independently read as project `appgprj_6ae54eda9d888191b6b2dda641eb34a7`, hosted version 4. The navy/yellow review remains a local artifact/source change; no hosted version was saved or published.

Evidence categories must remain separate:

| Category | What it establishes | What it does not establish |
|---|---|---|
| Owner's reported live requests | Enrollment without code returned 400; scan without token returned 401; preview-origin OPTIONS returned 403 at 11:19 ICT | Authenticated real-device scan, usable CORS, staging access, real count writes |
| Local backend source at matching SHA | Implemented route shapes and middleware semantics | Runtime data completeness or live SQL result values |
| Unchanged mobile route executed locally over HTTP with SQLite fixtures | Actual existing handler serialization, exact synthetic SKU read, sales/manager response filtering | Production JWT/enrollment or real inventory freshness |
| New local demo HTTP + SQLite + browser tests | Actual persisted fixture count/lot/receipt/correction/retry/restart behavior | Any deployed count contract, official stock mutation, remote multi-phone readiness |

## Existing real mobile read/enrollment contract (owner confirmed)

Origin `https://paasrtsm-project.onrender.com`; mobile base `/api/mobile`; product alias `/api/pda`.

| Route | Existing behavior |
|---|---|
| POST `/api/mobile/enroll/start` | Web branch session + CSRF, or enrolled mobile manager; returns code, branchCode, expiresAt |
| GET `/api/mobile/enroll/roster?code=...` | Valid code; returns branch roster with staffId/displayName/role |
| POST `/api/mobile/enroll/redeem` | code, staffId, deviceId, optional deviceLabel; returns token/expiry/branch/staff/role/device |
| GET `/api/mobile/devices` | Mobile manager, own branch |
| POST `/api/mobile/enroll/revoke` | Mobile manager, enrollmentId |
| GET `/api/mobile/products/by-barcode/:barcode` | Mobile Bearer identity; exact trimmed barcode |
| GET `/api/pda/products/scan?barcode=...` | Same product lookup contract |

Enrollment codes are single-use, default TTL 60 seconds. Tokens default to 24 hours, subject to runtime configuration. Every request rechecks the enrolled-device row for revocation/expiry and uses server-side branch/role. **No backend PIN-login or refresh-token contract exists in these routers.** Legacy `PDA_TOKEN_*` and Sync keys are not interchangeable with mobile enrollment tokens. This task did not enroll a real device, mint a production token or reuse a production secret.

Lookup returns barcode, branchCode, productCode, names, S/M/L unit metadata, retailPrice, priceTiers, unitPrices, stockByBranch (enrolled branch and total), and manager-only costByBranch. Sales receives retail prices; manager can also receive wholesale and branch cost.

### Required uncertainty

- Barcode and product code are strings; preserve leading zeros and trim only. Do not coerce numbers or infer an alias.
- S/M/L metadata does **not** identify the scanned pack. Conversion-rule version and canonical shared-stock owner are absent. A missing factor is not 1.
- The source schema permits barcode ambiguity and the handler uses LIMIT 1. A single returned row does not prove uniqueness. Current aggregate observations of no duplicates are not an invariant.
- Mobile stock is **Full Sync**, with no Hourly/Shopee composition, no stock observation time, and no returned freshness contract. The adapter reports `source=full-sync`, `observedAt=null`, `freshness=unknown`.
- `unitPrices.sourceUpdatedAt/sourceSyncedAt` describe prices, not stock. Fetch time is a separate client fetch timestamp and never substitutes for a stock timestamp.
- Preserve `null`, actual zero and negative reference quantities separately. Do not infer equivalent zero semantics from the legacy admin branch-stock mapper.
- The real branch-stock reader's Hourly/Shopee projections have separate web-session contracts and uncertainty states. Do not subtract Shopee twice. There is **no deployed human-count override** in that contract.

`apps/pda-preview/mobile-contract.mjs` implements a read-only transport/normalizer for this known shape. It does not mint tokens, refresh them, proxy requests or write counts. It requires an existing enrolled identity supplied by its caller and keeps that token out of persistent storage. It is **not enabled against production by the demo UI**. Contract tests use explicit fixtures; they are not authenticated live proof. Production count eligibility is false until pack/canonical/unit-rule/ambiguity and observation semantics are supplied by a verified contract.

The owner reported the preview-origin OPTIONS denial. No `no-cors`, proxy, CORS change, privilege increase or repeated access attempt was used to work around it.

## New isolated demo contract (implemented, synthetic)

The demo is a separate opt-in Node process in `apps/pda-demo-server/`, **not** an edit to the production admin-api or SC legacy backend. It listens only at `127.0.0.1:4180` by default. The original mobile product router is injected into this separate process with fixture-session auth and a SQLite synthetic catalog; the production auth middleware remains untouched.

### Identity and authentication

The same three public fixture PINs/identities from the original preview are used, with server verification. No production accounts, credentials or permissions were created or changed. The fixture server is unsuitable for exposure to other machines; its loopback restriction is enforced at bind and Host/Origin checks.

The fixture login creates an ordinary temporary one-hour HttpOnly SameSite=Strict session and in-memory browser CSRF token, with hashed session-token storage. These are local fixture sessions, not real mobile Bearer enrollments and not a replacement production PIN contract. There is no credential-provisioning or permission-editing endpoint.

Assignments are fixed synthetic scopes: staff01 DEMO-001–003, staff02 DEMO-004–006, lead03 all six, branch 004, whole-product/all-storage-points scope. They are not team stocktake floor/round assignments. Task ID and assignment revision are checked server-side. A real team-session workflow remains a later feature.

| Local route | Auth / behavior |
|---|---|
| GET `/api/demo/health` | Environment and explicit officialStockWrites=false |
| POST `/api/demo/auth/login` | Existing fixture account/PIN/device ID; server throttling, temporary fixture session |
| POST `/api/demo/auth/logout` | Session + CSRF; invalidates fixture session |
| GET `/api/demo/bootstrap` | Session; own-branch records, assigned tasks, fixture catalog, revisions, source choices/history, session expiry |
| POST `/api/demo/count-events` | Session + CSRF; assigned scope; transactionally validates and stores original evidence, lots, receipt and projection revision |
| GET `/api/mobile/products/by-barcode/:barcode` | Existing unchanged mobile handler, fixture auth/catalog only |

### Immutable count request

Fields: UUID `id`; authenticated `staffId` and `branchCode`; synthetic product/canonical stock identity, canonical unit/factor and catalog version; assignment ID/revision; original startedAt/observedAt; expected item baseRevision; lots; absolute total; complete flag; note; optional reference-at-scan claim; correction original/incident/reason; optional explicit discrepancy confirmation bound to reference quantity/source/observation time and count quantity.

The server derives actor display name and identity from session, checks branch/product/unit/task mapping, recomputes lot total in integer thousandths, validates day-only manufacturing/expiry chronology, rejects forged acceptance fields and stores client reference claims separately from its own reference-at-submit. Nullable dates explicitly mean unknown; month-only printed dates are not implemented and must not be converted to invented days. Existing fixture pack factors are explicit synthetic mappings; they do not come from real API inference. Ambiguous fixture mappings fail startup/contract validation.

- Same event ID + identical canonical payload + same actor/device/branch returns the original durable receipt and original receivedAt, including after process restart.
- Altered payload or cross-device/actor/branch replay returns 409/403, not another record.
- A stale expected revision is stored as conflict evidence; it does not win by upload order.
- A changed reference invalidates an earlier discrepancy confirmation. Retain as review evidence; do not overwrite the selected count.
- Full product counts can lead only this demo's reference projection. Partial lot surveys never become branch totals. Missing stock is null, not zero.
- A correction is a new full snapshot with a new UUID and linked reason/incident ID. It replaces the selected observation only after acceptance. Original evidence and receipt rows cannot be updated/deleted due to SQLite triggers.

### Receipt, persistence and source history

Response: receiptId, eventId, status, receivedAt, original/normalized event, replayed flag, environment=`isolated-fixture-demo`, officialStockWrites=false. Distinguish stored (`synced` in the existing UI), held-for-review, and conflicting receipts. A successful HTTP delivery is not proof of a production stock update.

SQLite WAL, foreign keys, full synchronous durability and a single transaction retain event, lot rows, receipt, revision and source-selection evidence. The mutable revision/selection cache is derived; original events/lots/receipts/source-history are append-only. Roles and CSRF are checked before the write transaction. No SQL is sent to production Postgres or AdaAcc.

Source history records before/after source, quantity, event ID, effective observation time, reason and server recorded time. Fixture baselines have their own recorded synthetic observation time stored once in SQLite. Restarting the process does not refresh it. Staff count `observedAt` never comes from Hourly or upload time. Future capture times are rejected/held; counts older than the demo policy window are retained for review, not refreshed into a current count. These local projection rules do not alter any deployed reader.

### Offline and reopening

The browser commits immutable request + actor/capture identity to IndexedDB before saved-on-device feedback. UI cache is separate from the original static-preview namespace. Auth and CSRF material are not stored in that cache. Different fixture logins do not relabel or upload another actor's queue.

The opt-in service worker caches only the public app shell and decoder assets. API routes, sessions and receipts are never cached/synthesized. Offline cold reopening can resume local drafts only from the cached previously authenticated identity inside its stored expiry; this is not server authentication. On reconnect, actual session/assignment/CSRF checks are repeated before any acceptance. A network error never creates a server receipt. `navigator.onLine` is advisory; actual network responses determine reconnect success.

## Boundary to real staging / phones (not implemented or approved)

1. No owner-verified dedicated PDA staging backend exists; the existing hosted page still has production-origin CORS denial.
2. No deployed count/lot/date/receipt/idempotency/correction/assignment schema or route contract was found. Do not reuse receiving, transfer or Sync writes as counts.
3. Authenticated live-device mobile reads remain unverified; this task had no approved existing mobile enrollment session. Do not invent a PIN/refresh contract or mint one from production secrets.
4. Real barcode pack/canonical ownership, conversion version, uniqueness and stock cutoff metadata remain unresolved.
5. Loopback execution proves local integration only. Connecting real phones needs an approved reachable staging endpoint, HTTPS and an accepted auth/count contract. Any hosting/CORS/access/schema/deployment step remains a separate approval boundary.

The current safe handoff is reviewable code, local runnable integration, fixture execution evidence and a clear list of unresolved production/staging decisions. No publish, deploy, migration, proxy, permission or credential operation is included.
