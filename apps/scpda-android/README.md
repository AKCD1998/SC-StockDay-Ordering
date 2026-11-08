# SCPDA Android internal test build

This is the Android target of the existing SC StockDay PDA project. It retains the navy/yellow/white identity, manual camera capture, decoder and separate count demo. It does not publish the existing Site.

## Reader access R2

Version `0.2.0-test.2` uses dedicated SCPDA readers `01001`, `02001`, `03001`, each with a reusable four-digit PIN. These are separate from existing StockDay web/mobile accounts. First activate this installation by selecting the privately supplied device-setup JSON, then choose an operator and enter its PIN. The PIN rotation reminder is six months; it does not change PINs automatically.

The Android Keystore holds a non-exportable P-256 key. The public device certificate is saved locally; PINs and reader Bearer tokens are not saved. A one-use server challenge and device signature precede every PIN check. Native HTTPS uses the fixed existing StockDay backend and its normal certificate validation. The embedded page never receives a PIN hash, private key or Bearer token. No secret is packaged in the APK.

The additive `/api/scpda` backend contract is default-off until explicitly configured. It reuses the populated public SKU/price queries and branch-001 Full Sync snapshot. It preserves null, zero and negative quantities, exact leading-zero barcode strings and unknown stock observation time/pack identity. Costs, other branches and existing admin privileges are excluded. Network failure does not switch to demo data.

The APK looks up products, per-unit retail prices and stock. It does **not upload counts/lots or adjust Ada stock**. The existing local count demo remains a separate Activity without the native API/session bridge. Counts and official adjustments require their separate accepted contracts and schema authorization.

The previous R1 web-password design and evidence remain available at commit `5aed5e6` and in the November 5 delivery report; those are historical, not instructions for R2.

## Build

Requirements: existing repo dependencies (esbuild), Java 21 with compiler/keytool, Python/Pillow, Android SDK platform 35 and build tools. Standard SDK and scoped review-toolchain layouts are supported.

```sh
python scripts/build-scpda-android.py \
  --sdk /absolute/android-sdk \
  --out /absolute/new-artifact-directory \
  --signing-dir /absolute/private/scpda-signing
```

Retain the private signing directory for installable updates. The same app ID and internal signing certificate are used as R1. Signing files are excluded from source and delivery archives. Result: `SCPDA-0.2.0-test.2.apk`, `APK-IDENTITY.json` and generated build files; Android 8+, target 35. Public-store signing/distribution and iPhone acceptance are separate decisions.

## Verification boundaries

The exact APK HTML is tested through the shipping Java session/proof interface and actual candidate HTTP handlers against disposable PostgreSQL fixtures using `tests/ui-registered-access.py`. This covers PIN entry, device admission, wrong-PIN feedback, exact barcode/IC lookup, ambiguity, prices, null/negative stock, logout, offline errors, escaped product names and scanner aim/capture behavior. Host software signing emulates the DeviceProof interface; this is **not Android Keystore, WebView or physical-phone acceptance**. The old script name forwards to this current harness.

Backend tests cover activation replay/expiry, proof replay, all three identities, rate holds, credential rotation, device revocation, durable logout, existing-session isolation, default-off health and denied writes. Fixture credentials/keys are excluded from all delivered app archives. Live authentication, if completed, is recorded separately in the dated delivery report.

Only the phone owner can install the APK, import the private setup file, grant camera permission and test actual Volume+, torch and Bluetooth hardware on that Android. No credentials need to be pasted into chat. Clearing app data or reinstalling after removal deletes the installation key and requires a new invitation.
