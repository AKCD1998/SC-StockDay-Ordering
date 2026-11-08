# SCPDA reader activation — 8 November 2026

Real branch-001 reader access is live and verified at `https://paasrtsm-project.onrender.com`. The new Android reader uses reusable operator PINs, not an unknown existing StockDay web password. This release does not activate count/lot uploads or official Ada adjustments.

## Delivered and admitted

- Existing backend PR [51](https://github.com/AKCD1998/PaaSRTSM-project/pull/51), merged revision `a04e8a49ba81c06652c82b068a7dead7a0fc8c52`.
- Default-off code deploy `dep-dbo5jftg1s2s73855oe0`: live; core health 200 and reader 404 `SCPDA_DISABLED` verified before configuration.
- Merge-only configuration of `FEATURE_SCPDA_READ_001`, `SCPDA_OPERATOR_CREDENTIALS_JSON` and `SCPDA_DEVICE_INVITATIONS_JSON`. Existing environment values were not replaced or retrieved. No CORS, existing-account, infrastructure or schema settings were changed.
- Configuration started its own deploy `dep-dbo5kop5efls73cu9ka0`; observed live at 11:19:15 UTC. No duplicate manual deploy was triggered.
- Only the reader change was merged. The separate pending count-migration branch was not included. All 72 SQL files in the live source were already recorded; 74 historical migration records remained after deployment. No migration file was added.
- Hosted Sites v4, the old port-8765 static HTML, and ScProductDev were not updated in this release. This is not a new ScProductDev or physical-phone acceptance run.

## Live proof

At 18:19:48 Bangkok, controlled HTTPS verification paired a separate temporary device, authenticated `01001`, `02001`, `03001` and verified each session's reader-only branch-001 context. The verification certificate lasted 600 seconds; reader sessions were bounded by that expiry. The owner's separate phone invitation was not consumed.

Real exact lookup of barcode `8851743003658` matched SKU 1 / IC `630010001`, returned two retail unit prices and Full Sync branch-001 stock 0. Stock observation time remained unknown. The reader uses populated StockDay SKU/price data and Ada-synced snapshots; this is not a direct phone connection to an Ada SQL database or an atomic physical-stock snapshot. Pack identity/factors remain unknown. Retail responses exclude cost fields and other branches.

The existing mobile product route rejected the reader token with 401. All three verification sessions were logged out and then rejected with 401. Core health remained 200. A subsequent read-only SQL check found three successful reader logins, three logouts, one verification admission, zero owner-phone admissions and no PIN/token/activation-code fields in SCPDA audit metadata. The temporary verification private key was deleted. These were authentication audit writes and product/stock reads, with no official inventory or financial writes.

## APK and owner setup

- Artifact ID `SCPDA-ANDROID-ACCESS-R2`, version `0.2.0-test.2`, package `th.co.scgroup1989.scpda.preview`, app name SCPDA. Android 8+, target SDK 35.
- APK bytes 3,011,397; SHA-256 `cba14064ca2d81ab889b2dbad7b7458653be7c0d1ded7a7e40acbae0c0206c97`.
- Same internal signing certificate as R1: SHA-256 `3d11b6af0d2f472632e313d6b94fab745cc4af8c360dfe356be7bf627847c20a`; v2/v3 signature verification passed. The app can update R1 without changing its package identity.
- Private owner download contains APK, `SCPDA-001-device-setup.json`, `SCPDA-001-logins.txt` and instructions. It is excluded from source/review archives. PINs and activation secrets are not in this document or APK.
- Install the APK, tap **เลือกไฟล์เชื่อมเครื่อง** and select the setup JSON once. Choose an operator and enter its four-digit PIN from the private login file. No existing StockDay password is required.
- The setup invitation expires **10 November 2026 at 18:06 Bangkok** and admits one Android installation. All three operators can use that admitted phone. Another installation needs a separate invitation. PINs are reusable; six months is a rotation reminder, not automatic replacement.

The app stores its non-exportable P-256 key in Android Keystore and its public admission certificate in app preferences. PINs and session Bearer tokens are not saved. Normal native HTTPS and existing CORS remain intact; no public tunnel or `no-cors` workaround was introduced.

## Validation and limits

| Evidence | Actual result |
| --- | --- |
| Isolated HTTP/PostgreSQL access tests | 13 passed, 0 failed: invitation retry/expiry/reuse denial, three operators, proof replay, existing-session isolation, read whitelist, null/negative stock, logout, device revocation, credential rotation and five-failure hold |
| Existing branch/mobile/default-off regressions | 28 passed |
| Frontend read-contract checks | 9 passed |
| GitHub PR CI | Run 42474333508: 854 tests, 749 passed, 105 skipped, 0 failed |
| Main CI | Run 42474665771: success before automatic deployment |
| Exact signed APK assets → host JVM session → candidate HTTP handlers → disposable PostgreSQL | Passed: activation/PIN, actionable wrong-PIN feedback, 7:1 entry row, leading zeroes, ambiguity, escaped names, prices, missing/negative stock, offline errors, logout, scanner aim/capture and torch-off default |
| Actual live HTTPS API | Three logins, product/price/stock reads, session logout and old-mobile denial passed |
| Android OS / Keystore execution / WebView / physical camera / Volume+ / Bluetooth | Pending on the owner's phone; host software proof and browser events do not establish hardware acceptance |

An initial broad cloud-local run had 649 passes, 194 skips and one pre-existing no-API-key test affected by the execution environment's OpenAI key. Its nine-test file passed with that environment key absent; the subsequent GitHub suite passed. No unrelated video code was changed.

An additional isolated setup-configuration check verified the 600-second certificate and lease clamp for two generated logins; its third login received the expected 429 from the deliberately locked fixture account. No lockout was cleared or bypassed. The main 13-test run and later live three-account acceptance are separate successful evidence. Only owned synthetic Node/PostgreSQL resources were removed afterward.

## Remaining boundary

The deployed `ordering.pda_count_events` table is still absent. Counts, lots, manufacture/expiry dates, server count receipts, accepted source-selection history and official Ada adjustments are not enabled by this reader release. The older isolated count demo and its durable fixture evidence remain separate. No live count receipt or phone count roundtrip is claimed. Production count/auth/product-unit contracts and the separate count schema/approval remain the next gate.

Release evidence lives under `/workspace/artifacts/scpda-access-2026-11-08`: `RELEASE-EVIDENCE.json`, `live-reader-acceptance.json`, `live-default-off.json`, `post-live-read-only-evidence.json`, test TAP files, exact-APK UI screenshots, source review patches and APK identity. The sanitized evidence archive excludes private setup, PINs, signing files, database/session material and test-device keys.
