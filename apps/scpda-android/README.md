# SCPDA Android internal test build

This is the Android target of the existing SC StockDay PDA project. It retains the navy/yellow/white identity, manual camera capture, decoder and separate count demo. It does not publish the existing Site.

## Current Android build — R10

Version `0.6.0-test.10` (code10) supports the user's requested alphanumeric credential for existing reader01001. The login field is **รหัสผ่าน**, accepts text up to64characters, disables automatic capitalization/correction and preserves the exact value. Existing four-digit readers remain compatible. Android Java, the shared browser host and backend validation accept the same legacy4digits or6–64visible-ASCII password policy. The request key `pin` stays compatible with reader-v1. No production password/hash is in the APK or this repository.

Install over R9 with the same signing key/package to retain enrollment and local drafts/counts. Log in again after the server changes01001's credential; peer accounts remain unchanged. Device proof, rate limits, scope and password/token non-persistence are retained. This build does not create a new production registration or enable count intake.

Validation includes38 model/reader/refresh checks,5 exact-APK → shipping JVM → isolated HTTP/PostgreSQL assertions with a synthetic alphanumeric password,9 price-screen checks and10 recent-list regressions. Hardware/Keystore and the user's production phone login remain separate. See [R10 delivery notes](../../docs/SCPDA_PASSWORD_R10_2026-11-15.md).

## Historical Android build — R9

Version `0.5.1-test.9` (code 9) follows the user's annotated price-screen feedback. The company IC/630 identity is labeled **รหัส SKU**; its underlying identifier is unchanged. Stock is 56px, and an orange information icon immediately after **จำนวนตาม StockDay** opens branch, source, actual sync timestamp, approximate normal morning routine and last successful read time. The icon has a 44px touch target; metadata is removed from the main stock card.

The existing reader refreshes this active price view every 60 seconds, on opening the information dialog, and on returning from background. Requests coalesce; tab changes, logout, background and replaced views invalidate late results. Failed refreshes retain the last successful values/timestamps and show an explicit failure in the information dialog. A read does not update the source's ingestion timestamp or prove a new physical observation. The normal 08:30 routine remains user-provided metadata, not a verified scheduler API.

Source/authentication, per-unit pricing, local count storage and production activation boundaries are unchanged. Java resume now notifies the page to refresh. Validation uses 37 model/reader/refresh checks and exact-APK browser fixtures; physical Android lifecycle acceptance remains pending. See [R9 evidence](../../docs/SCPDA_PRICE_INFO_R9_2026-11-15.md).

## Historical Android build — R8

Version `0.5.0-test.8` (code 8) adds authenticated bottom navigation: **นับสต๊อก / พรีออเดอร์ / เช็คราคา**. The price tab reuses the registered-device reader and exact barcode/company-code lookup, including `IC-…` and `630…`. Thai product names wrap in full. It shows the price matching the recorded Ada unit as ซื้อเดี่ยว, then the other stored unit prices without inferring bundle factors, quantity thresholds or POS promotions. Unknown base units stay unclassified. The shared ten-item recent list is still identity-only and re-reads each shortcut.

Stock in this reader remains branch-001 **Full Sync**. Show the returned table-ingestion timestamp, not a physical observation time or an invented daily 08:30 timestamp. The approximate morning routine is the user's stated schedule. Missing/zero/negative/fractional references remain distinct. Local drafts and saved observations never override the reference balance. Reviewed PDA balance selection needs a separate accepted server read contract; it is not enabled by this APK.

Preorder is a visible pending tab until the other workstream supplies an accepted registered-device auth/domain adapter. Catalog **เช็คราคา** is separate from the future customer **สอบถามราคา** workflow. No mock cases, role selector or customer writes are shipped. Tab changes preserve count drafts, close the camera and reject late reads; Android back returns within the app before exiting.

Count upload negotiation from R4 and later is retained, but production collection activation is still pending the existing explicit activation boundary. This build does not activate a migration/flag, deploy a backend or select PDA stock as the current balance. The package, signing certificate, safe-zone icon, local count database and operator identities remain compatible with R7; install over the existing app without clearing data.

Validation: 31 model/reader/recent tests, 7 exact-APK price/navigation checks and 10 recent-list regression checks. Browser UI checks use a synthetic native host and real IndexedDB; they are not fresh authenticated production or physical-phone tests. See [R8 delivery evidence](../../docs/SCPDA_PRICE_CHECK_R8_2026-11-15.md).

## Historical local count capture R3

Version `0.3.0-test.3` uses dedicated SCPDA readers `01001`, `02001`, `03001`, each with a reusable four-digit PIN. These are separate from existing StockDay web/mobile accounts. First activate this installation by selecting the privately supplied device-setup JSON, then choose an operator and enter its PIN. The PIN rotation reminder is six months; it does not change PINs automatically.

The Android Keystore holds a non-exportable P-256 key. The public device certificate is saved locally; PINs and reader Bearer tokens are not saved. A one-use server challenge and device signature precede every PIN check. Native HTTPS uses the fixed existing StockDay backend and its normal certificate validation. The embedded page never receives a PIN hash, private key or Bearer token. No secret is packaged in the APK.

The additive `/api/scpda` backend contract is default-off until explicitly configured. It reuses the populated public SKU/price queries and branch-001 Full Sync snapshot. It preserves null, zero and negative quantities, exact leading-zero barcode strings and unknown stock observation time/pack identity. Costs, other branches and existing admin privileges are excluded. Network failure does not switch to demo data.

The APK looks up products, per-unit retail prices and stock. After lookup, **นับสินค้า** opens lot, manufacturing/expiry date and whole-quantity entry, with explicit unit, category and independent round. Multiple lots, deliberate unknown dates, device-local drafts and append-only saved corrections are supported in IndexedDB. Each saved record stays **ยังไม่ส่ง**, with no server receipt, conversion, source override or official adjustment. It does **not upload counts/lots or adjust Ada stock**. The existing local count demo remains a separate Activity without the native API/session bridge. Counts and official adjustments require their separate accepted contracts and schema authorization.

The previous R1 web-password design and evidence remain available at commit `5aed5e6` and in the November 5 delivery report; those are historical, not instructions for R2.

## Build

Requirements: existing repo dependencies (esbuild), Java 21 with compiler/keytool, Python/Pillow, Android SDK platform 35 and build tools. Standard SDK and scoped review-toolchain layouts are supported.

```sh
python scripts/build-scpda-android.py \
  --sdk /absolute/android-sdk \
  --out /absolute/new-artifact-directory \
  --signing-dir /absolute/private/scpda-signing
```

Retain the private signing directory for installable updates. The same app ID and internal signing certificate are used as R1. Signing files are excluded from source and delivery archives. Result: the versioned APK from AndroidManifest.xml, `APK-IDENTITY.json` and generated build files; Android 8+, target 35. Public-store signing/distribution and iPhone acceptance are separate decisions.

## Verification boundaries

The exact APK HTML is tested through the shipping Java session/proof interface and actual candidate HTTP handlers against disposable PostgreSQL fixtures using `tests/ui-registered-access.py`. This covers PIN entry, device admission, wrong-PIN feedback, exact barcode/IC lookup, ambiguity, prices, null/negative stock, logout, offline errors, escaped product names and scanner aim/capture behavior. Host software signing emulates the DeviceProof interface; this is **not Android Keystore, WebView or physical-phone acceptance**. The old script name forwards to this current harness.

Backend tests cover activation replay/expiry, proof replay, all three identities, rate holds, credential rotation, device revocation, durable logout, existing-session isolation, default-off health and denied writes. Fixture credentials/keys are excluded from all delivered app archives. Live authentication, if completed, is recorded separately in the dated delivery report.

Only the phone owner can install the APK, import the private setup file, grant camera permission and test actual Volume+, torch and Bluetooth hardware on that Android. No credentials need to be pasted into chat. Clearing app data or reinstalling after removal deletes the installation key and requires a new invitation.

R3 scanner copy is reduced to **สแกนบาร์โค้ด** and **อ่านบาร์โค้ด**; the capture button is red. Aiming, one-capture gating, torch-off default and pause/release behavior are retained. Local records are scoped to operator/branch and survive a same-origin browser reopen; Android WebView storage/hardware acceptance remains pending. Uninstalling or clearing app data can delete local records. The existing online PIN login remains necessary after Android process death; no offline login contract was added. See [R3 delivery](../../docs/SCPDA_LOCAL_COUNT_UI_R3_2026-11-08.md).
