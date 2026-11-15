# SCPDA R10 — alphanumeric operator password

The user asked whether01001 can submit stock counts now and requested an alphanumeric password for that existing account. This release updates Android, the shared browser host and validation without changing the username, app identity, enrollment keys, local count database, roles or stock source. No production password/hash belongs in source, tests or delivery packages.

## Login behavior

Use **รหัสผ่าน**, a text keyboard, maximum64characters, no autocapitalization/autocorrection or numeric-only mask. Preserve exact case and characters; do not trim, normalize or truncate. Accept existing4digit numeric readers and6–64visible-ASCII credentials within bcrypt's input bound. Whitespace, control characters and oversized input are rejected. Keep reader-v1's `pin` body key, device challenge/signature, rate limiting and session behavior compatible.

Only server configuration for01001 is authorized to rotate. Preserve02001/03001 records, signing key, invitations, revocations and all unrelated variables. Credential-version rotation invalidates01001's sessions, so a fresh login on the registered installation is required. No replacement enrollment file is needed for an intact installation. The updated APK is signed with the existing key/package and keeps saved counts.

## Count-readiness evidence

Read-only production checks on15November2026 returned405 READ_ONLY from `/api/scpda/counts/admission`; all4dedicated `ordering.scpda_*` tables were absent and `FEATURE_SCPDA_COUNTS_001` was not enabled. Backend PR52 and admin PR92 were open drafts, unmerged. Android stores counts locally until the separate reviewed intake activation is authorized and applied. R10 does not apply migration083, enable count flags, deploy the admin drawer or adopt PDA stock as the current balance. No official Ada adjustment is included.

The password-compatible backend change is isolated in PR62 from deployed/main46985c9 with no migration diff. Live deployment/configuration evidence is recorded separately in the delivery's sanitized activation receipt and common ledger; preparing this document is not proof that the requested credential is live.

## Validation

-38 Node model/reader/browser/refresh/recent checks pass.
-17 backend policy/default-off/actual isolated HTTP/PostgreSQL assertions cover targeted rotation, preserved peer credentials/sessions, legacy logins, replay/logout/hold/audit behavior and unchanged stock. Additional newline/length boundaries pass.
-5 exact-APK checks use the shipping `StockDaySession` in the JVM, software P-256 device proof and actual isolated HTTP/PostgreSQL: full alphanumeric login, incorrect credential rejection, cleared input, real fixture price/stock reads, denied count writes and durable logout.
-9 price/navigation and10 recent-list regression checks use synthetic native reads and real browser IndexedDB. APK archive, signature/alignment and unchanged icon checks are separate evidence.

These are Cloud fixtures, not physical Android WebView/Keystore/camera or a fresh production phone login. No production device was registered to run them. Existing R9 price metadata/refresh behavior, manual lot/date entry and paused label OCR remain intact.

Artifacts: `/workspace/artifacts/scpda-password-2026-11-15/`. Finished APK/ZIP/instructions are delivered to **เภสัชอู๋ / pdaAppProject**. No credential/private setup file or test-device key is included; no sharing change.
