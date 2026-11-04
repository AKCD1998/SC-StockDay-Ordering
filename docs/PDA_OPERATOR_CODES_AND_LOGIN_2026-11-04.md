# Reusable operator codes and compact login

Status: implemented and verified in the existing isolated PostgreSQL demo, 4 November 2026. Continues the same PDA project and navy/yellow/white design. No production account, permission, authentication route or hosted version was changed.

## Requested screen changes

Removed “ก่อนเริ่มงาน” and the paragraph about obtaining a short-lived one-use enrollment code. The heading is “เลือกชื่อ แล้วเริ่มงาน”. The masked code field and action now share a CSS grid with exact **7:1** tracks and a 12 px gap. The narrow action uses an arrow icon; its accessible name/title remains “ดึงรายชื่อพนักงาน”. Its extended touch target is at least 48 px wide and both controls are 54 px high. Actual browser measurement at widths 360, 390 and 496 returned ratio 7.0 with no horizontal overflow.

The reusable fixture mode accepts four ASCII digits and returns only the operator associated with that code. The picker selects that account; the server rejects a different staff identity. No person/global staff ID is inferred into a production slot assignment.

| Fixed fixture account | Public demo code |
| --- | --- |
| 01001 | 1111 |
| 02001 | 2222 |
| 03001 | 3333 |

The account ID and historical attribution stay fixed when its code changes. Codes can be reused across sessions, devices and HTTP-process restart until deliberately rotated. “Six months” is implemented as a **rotation reminder**, not an automatic lockout or automatic code change. When due, the account/gear dialog displays a reminder; no extra instruction paragraph is added to the default login. There is no separate reminder scheduler or staff notification integration.

## Implemented demo authentication boundary

The adapter is `PaaSRTSM-project/tests/fixtures/pda-operator-codes.js`, mounted only by the explicit `--reusable-codes` option of the existing fixture launcher. It refuses any database other than loopback `pda_001_fixture` under `pda_fixture`, and requires the known synthetic stock-write guard. **Production `server.js` does not mount it.** The existing live one-use enrollment endpoints are unchanged. The normal HTTPS mobile client continues using the accepted existing enrollment contract.

The client enables this adapter only when the server inserts the explicit reusable-code fixture meta flag on an HTTP 127.0.0.1 origin. Constructor guards reject enabling it for a production origin. Missing/invalid reusable-code responses cannot silently become a different auth identity. Code entry uses POST bodies, not a query-string PIN. The code is cleared after login and is not stored in localStorage, IndexedDB or API caches. Existing in-memory short-lived mobile tokens and row-based revocation remain in use; the reusable code is not a six-month access token.

Demo tables are created only by the guarded fixture adapter, not by a production migration. They store salted bcrypt hashes (test cost only), a code version/change date, six-calendar-month due date, durable attempt limits and rotation receipts. Five failed guesses trigger a 15-minute fixture-IP lock that survives process restart. The fixture limit is not an accepted production abuse-control policy.

An existing authenticated branch-001 master/admin plus CSRF can rotate through `POST /api/mobile/operator-access/rotate` with `{requestId,staffId,code}`. Codes must differ from the current and other operators' codes. Rotation is idempotent, changes the hash/version and due date, and revokes sessions issued through that operator-code adapter. It leaves counts, receipts, account identity and existing one-use enrollment sessions intact. Staff cannot use the picker to take another operator's role. A dedicated rotation settings screen was not added; the fixture API and due reminder are reviewable preparation.

## Actual evidence

- Eight reported HTTP/PostgreSQL tests pass, covering explicit fixture-only admission, all three accounts, code reuse/restart, hashed storage, identity/role selection, original count receipt retry, durable lockout, branch/CSRF/duplicate-code denial, rotation/revocation/history and the reminder policy.
- Eight existing mobile read/client contract tests pass. No production PIN or refresh-token contract is asserted by these tests.
- Real browser login passes for all three accounts, including repeating 1111 after logout; the due reminder is verified inside the account dialog. Exact 7:1 measurements, removed copy, masked numeric entry, account binding, cleared input, no persisted raw code/token and no code in URLs are recorded. No script errors. This is Chromium on cloud Linux, not physical Android or Windows acceptance.
- Existing count wire format, outbox, source selection, lot/date/correction logic, scanner and torch-off behavior are unchanged. A real count retry after new code login returns its original server receipt. Official fixture stock stays 6.

## Run the updated demo

Use the existing backend dependencies and a fresh owned loopback PostgreSQL fixture. The setup refuses a populated database. From the backend candidate:

```sh
PDA_FIXTURE_PG_PORT=<owned-pg-port> PDA_PILOT_CLIENT_MODULE=<SC-root>/apps/pda-preview/mobile-count-pilot.mjs PDA_ACCESS_EVIDENCE_FILE=<review-dir>/http-access-evidence.json node --test tests/pda_reusable_codes.test.js
PDA_FIXTURE_PG_PORT=<owned-pg-port> PDA_FIXTURE_FRONTEND_ROOT=<SC-root>/apps/pda-preview PDA_ACCESS_EVIDENCE_DIRECTORY=<review-dir>/browser node tests/pda_reusable_codes_browser.js
```

For interactive PDA review after the fixture setup, pass the explicit option to the existing launcher. The empty argument below skips the optional website build; supply the existing fixture web build there if needed:

```sh
node tests/fixtures/pda-001-http.js --isolated-fixture-only <owned-pg-port> --enabled <SC-root>/apps/pda-preview '' 4182 --reusable-codes
```

Open `http://127.0.0.1:4182/pilot-001.html` and use the public demo codes above. Without the option the fixture keeps the older one-use enrollment flow. Never attach this demo adapter to production or treat its public codes as real credentials.

## Remaining live work

The stable-three-account requirement is accepted for the product design, but real staff/slot assignments, approved device admission, production PIN storage/abuse/rotation rules and their deployment require the accepted production auth contract. This update neither weakens existing auth nor creates real permanent access. Hosted v4, production CORS, audit scheduling and official Ada writes remain unchanged. Earlier phase ZIPs and their test evidence are retained as immutable historical artifacts.
