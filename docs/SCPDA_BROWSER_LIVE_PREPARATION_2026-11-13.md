# SCPDA browser live connection preparation

The requested “ยอดนี้มาจากไหน?” rail and long bottom explanation were removed
from the staff dashboard source. The same existing Site was updated with that
change, retaining its currently live layout and compact DEMO indication. The
prepared browser live connection is a separate saved candidate; it is not
presented as a working production count service.

`scpda-browser-host.mjs` implements the existing reader/device/PIN/count
contracts in the browser, using nonextractable WebCrypto P256 keys and DER
ECDSA signatures compatible with the existing backend. A stable key/device ID
and public admission certificate persist in browser IndexedDB. The invitation
file, PIN, reader JWT and count JWT do not persist. Session requests are
serialized; count tokens have their own purpose and remain private to the
transport. Logout clears capabilities even if the network is unavailable.

The API origin is fixed to the existing Render backend. Fetch uses no cookies,
no redirects and no proxy; count availability is negotiated, not assumed.
An absent/reader-only count service leaves product reads and local-only counts
available. There are no demo credentials, sample products or simulated receipts
in the live browser build. Legacy demo storage is not imported as live counts.

`scripts/build-scpda-browser.py` derives the accepted R4 UI from its verified APK,
adds the browser transport and restrictive CSP, and retains the same branding,
scanner/capture/torch defaults, local queue and correction history. It does not
rebuild/change the Android APK. The hidden native demo button remains in the
DOM because the shared UI binds its handler during startup.

The new backend `FEATURE_SCPDA_WEB_001` gate is default-off and permits only the
existing preview origin and SCPDA bearer routes, without credentialed cookies.
It does not add any admin/Sync permission or alter the general CORS allowlist.
The current real preflight still returns403; no proxy/no-cors workaround was used.

Verified: 4 browser contract unit checks; 12 linked real WebCrypto/browser →
isolated HTTP/auth/PostgreSQL checks; 4 scoped CORS checks; 38 backend checks on
current main and45 admin checks/build. The browser run includes stored lot/mfg/
expiry data, actual receipts, late-lot reason, network interruption/cold reopen,
lost accepted response without another POST, immutable correction, a second
registered browser and CSRF admin review returning to the first browser. Fixture
official stock stayed6/null/-2. Physical Android/browser camera, production
counts and live Ada movement coverage are not established by this evidence.

During verification the browser builder was corrected to retain the hidden
native demo element; the fixture seed now uses its actual current as-of time;
and the test uses locator waiting compatible with the production CSP rather
than enabling unsafe-eval. Consumed disposable admissions/evidence were never
reset to make retries pass.

Evidence and prepared output: `/workspace/artifacts/scpda-live-prep-2026-11-13`.
Backend/admin existing PR52/92 were merged with current main in their isolated
branches, preserving unrelated PJK work. They remain drafts, not production
merges. Earlier user scope requires separate approval for the new production
tables, count-submit capability, exact-origin browser access and a new browser
admission. No production invitation, token, credential, permission or schema was
created by these isolated checks. Once approved, activation can use the existing
accounts; the user must perform the one-time file selection and PIN entry on
their phone because its private browser key never leaves that phone.

Counts are StockDay observations for review, not official Ada adjustments. Real
FEFO inference still needs accepted unit/movement coverage; no LLM schedule or
official Ada stock-write path was activated.
