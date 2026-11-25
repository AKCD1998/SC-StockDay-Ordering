# R24 — password confirmation for every real annual page submission

User clarified that the password is required **every time staff submit a completed page**, rather than adding a separate incomplete-page trial button. They subsequently corrected the intended confirmation value; only its bcrypt hash is configured in Render. Do not put the value in source, ledger, client defaults, count history or audit.

## Delivered source and artifacts

- Android source `340aca5ec9a5ff2d72d45fe57eb326a28aad4843`, branch `codex/scpda-annual-delivery-test-app-r24`, continuingR23 and the PWA single-QR correction. This is the delivered mobile branch, not webmain.
- Backend [PR77](https://github.com/AKCD1998/PaaSRTSM-project/pull/77), source `58111eb50918bafdb64d4926c9fa738686131612`, merged `840ead98337f28fb41ec861c10998c053ee83735`. No migration.
- PWA [PR117](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/117), source `db4c84f7b924015a0ae2bcd70d8b2596ca1a4e66`, merged `53d82bcb44a1cb72edd06479d7788a2b03db3178`.
- Android0.9.2-test.24/code24,3052357bytes; APK SHA256 `634865cdd7efd5aae8c67e9b6d10baec752413f59c9d4ae730394fd504e8b003`, same package `th.co.scgroup1989.scpda.preview` and original signer SHA256 `3d11b6af0d2f472632e313d6b94fab745cc4af8c360dfe356be7bf627847c20a`.
- AppCenter release `37253e78-edfa-423d-a2a1-20c90a7d46c7` published. [Private Drive APK](https://drive.google.com/file/d/1yoVRJMooavbJ0eIb2akLDTG2oi77TCWa/view) and [guide](https://drive.google.com/file/d/1AGbnmxe30EwHtWYb7lauv2E6SaXVq520/view) delivered to the established `เภสัชอู๋/pdaAppProject` folder with existing sharing retained.
- Matching PWA entry SHA256 `2746cfbeec62b02a825ffbb337d919d2a9b9cb9d5d3e3bb8eb40ad8326b696a0`. The signed APK identity above remains its source.

## Behavior and server contract

Sending a page still requires all its rows counted; explicit0 remains distinct from uncounted. ส่งหน้าให้เครื่องแม่ opens a password dialog. The password is attached only to the in-memory final request, never its durable outbox operation. Draft saves, บันทึกพักงาน and normal progress remain available without this extra confirmation.

Server `/annual/save` checks the configured bcrypt hash only for a **new final commit**, inside the existing scoped transaction after revision/idempotency checks. Missing/incorrect passwords cannot finalize the page. Exact replay of an already committed UUID/body returns the original receipt; it is not a second send and does not need another password. Rate limiting, daily authentication, branch/device ownership, complete-count validation and existing audit rules remain.

Explicit confirmation rejection proves no final commit occurred: the outbox preserves counts, cancels the rejected final intent and restores editing. Ambiguous network failures keep the original immutable operation for safe retry; when needed the user re-enters the password. No password is persisted for retries or background sending. No separate trial-submit route/button or incomplete-page bypass was shipped.

Runtime key `SCPDA_ANNUAL_SUBMIT_CONFIRMATION_HASH` enables this guard. A malformed configured hash fails closed; absent configuration retains prior server behavior for staged rollout. Preferred version24;004 accepts21/22/23/24 and QR21/22/23/24,005 accepts21/22/23/24 and QR22/23/24. Ordinary older-client work is retained; final submission with the new confirmation requiresR24. Keep the hash private and use a deliberate configuration action for any future change.

## Verification and retained state

PR77 and PR117 CI passed.141 mobile regressions include rejected-confirmation editability versus uncertain-response idempotency;23 daily HTTP/PostgreSQL regressions and2 annual PostgreSQL/layout checks passed. Annual transport checks prove missing/wrong confirmation leaves the revision unchanged, correct confirmation returns a receipt, replay returns the same receipt, and audit does not contain the password.

Final exact signed-APK UI with real Java sessions/HTTP/isolatedPostgreSQL covers QR/password/selfie, primary self-count, queued/offline drafts and preserved001↔005 profiles, plus wrong then correct final confirmation and no password in IndexedDB. A separate browser-host flow with actual browser cryptographic identity/QR/selfie validates the same rejection/success, reload receipt and no persisted password. No browser page errors. Physical phone installation/acceptance is not claimed.

No new production staff login/selfie, fake count, assignment, event reset, Ada/product write, credential rotation or schema migration. Existing credential/invitation/revocation/ordinary allowlist/branch values were compared privately and retained. Existing005 event remains the same74-page/3035-item event; runtime release/state evidence is in the owner's `/workspace/artifacts/scpda-annual-delivery-r24-20261125` and is not shared executor storage.

Install over the previous Android app; iPhone settings → อัปเดตเว็บแอป. Keep original device/operator codes for next-day QR and retain unsent installation data. Product/Preorder owners must preserve the R23 profile-switch/session boundaries and this R24 final-confirmation/outbox behavior; no writer grant is implied.

