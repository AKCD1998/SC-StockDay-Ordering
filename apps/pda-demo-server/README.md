# PDA durable integration demo (isolated, loopback only)

This is a real HTTP + SQLite + browser-outbox integration using **synthetic catalog and account fixtures**. It is not a production/staging deployment, does not connect to production Postgres, and does not write official inventory. No existing production auth or credentials are changed.

## Run

Requires the already available Node 24+ built-in `node:sqlite`, and the existing PaaSRTSM checkout with its existing Express dependency installed. This task installed no dependencies. Do not install software or expose ports on another machine without its normal authorization.

From the SC-StockDay-Ordering repository:

```sh
node apps/pda-demo-server/server.mjs --fixture-demo \
  --database /absolute/isolated/path/pda-demo.sqlite \
  --backend-root /absolute/path/PaaSRTSM-project \
  --port 4180
```

Open `http://127.0.0.1:4180/` on that same machine. The server is hard-bound to loopback and rejects non-loopback Host and cross-origin requests. This localhost URL is **not a phone-accessible staging URL**. Do not point a remote tunnel, production proxy, or Sites deployment at this public-PIN fixture server.

The original fixture PINs are unchanged: staff01 `1111`, staff02 `2222`, lead03 `3333`. They identify synthetic accounts only. Staff01 is assigned DEMO-001–003; staff02 DEMO-004–006; lead03 all six. Roles/assignments are enforced on the server. There is no credential/permission provisioning endpoint. Temporary fixture sessions expire after one hour; they do not grant access to the real mobile API.

The unchanged existing `PaaSRTSM-project/.../routes/mobile-products.js` handler is mounted in this separate app with injected fixture-session authentication and a SQLite synthetic catalog adapter. Production middleware, flags, schemas and routes are not edited. Local fixture execution does not prove deployed JWT authentication, enrollment, real SKU data, or staging compatibility.

## Actual implemented behavior

- Real same-origin HTTP requests; real SQLite WAL transactions and server receipts.
- Staff/branch/device identity binding, server PIN verification using scrypt over the existing public fixtures, expiring HttpOnly SameSite=Strict sessions, CSRF checks, login throttling and assignment checks.
- Stable UUID request IDs and canonical payload hashes; exact retries return the original receipt, altered or cross-device requests are rejected.
- Integer thousandths for lot quantities, date-only manufacturing/expiry validation, canonical fixture unit/catalog checks, server-recomputed totals.
- Database-enforced append-only observations, lot rows, receipts and source-selection history; linked corrections preserve originals. Projection revisions use a transactional compare-and-swap.
- Different clients see the same branch's persisted evidence. Conflicting or unconfirmed records remain evidence and cannot silently replace the selected count.
- IndexedDB outbox persists original actor, request and capture time before showing saved-on-device. Only the same authenticated actor/device uploads that request. Reauthentication never relabels someone else's queue.
- Offline app-shell caching is enabled only by this server's HTML marker. API requests, tokens, sessions and receipts are never cached or fabricated by the service worker. A cached, still-time-bounded identity can make **local drafts only** during an outage; the API authenticates and validates again before acceptance.
- Network reachability is checked by actual requests, not just `navigator.onLine`. A bounded periodic foreground reconnect attempts authenticated bootstrap/sync. Explicit offline simulation suppresses this. Pending requests are never discarded on auth or network failure. Permanent 400/403/409 validation denials remain as local rejected evidence (no server receipt) and do not retry forever; the UI permits a new corrected submission without claiming the rejected request was accepted.
- Source selection and audit history apply only to this fixture store. Fixture baseline times are recorded once in SQLite and do not refresh when the server restarts. A late upload never refreshes `observedAt`.

The root static browser preview is preserved as a separate mode. Without `<meta name="pda-api" content="/api/demo">`, there are no API logins/uploads/service-worker registration; the original static storage namespace remains separate. The isolated server inserts that marker while serving the existing frontend. The approved navy/yellow CSS, camera/capture/flashlight-off modules and original count policy are unchanged.

## Tests

The API harness starts/stops its own real Node server and uses a new isolated SQLite file. Evidence contains no cookies, bearer tokens, CSRF values or private credentials:

```sh
python apps/pda-demo-server/tests/api_roundtrip.py
```

With the demo server running on loopback 4180, browser harnesses use the already installed Playwright/Chromium:

```sh
python apps/pda-demo-server/tests/ui_roundtrip.py
python apps/pda-demo-server/tests/offline_reopen.py
node --test apps/pda-preview/tests/mobile-contract.test.mjs
```

Set `PDA_EVIDENCE_DIR` to an absolute output directory to retain evidence. Tests use synthetic values and never target production. Physical-phone access, native Volume+, actual device flashlight/audio behavior, and any remote staging deployment remain unverified.

See `docs/PDA_DEMO_INTEGRATION_CONTRACT.md` and `docs/PDA_DEMO_INTEGRATION_STATE.md` for the owner consultation, exact local contract, measured results and real integration blockers.
