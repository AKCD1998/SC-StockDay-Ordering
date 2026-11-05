# SCPDA Android internal test build

This is the Android build target of the existing SC StockDay PDA project. It reuses the PDA camera/decoder, fonts, SC colors and count demo. It does not replace or publish the existing Site.

The initial app reads real Ada-synced product/price/stock records through the existing StockDay **web-session** API. Sign in using an existing **branch-001 StockDay account**. The browser demo's `1111/2222/3333` profiles are not production logins. There is no database password, server JWT key, service token or default live credential inside the APK.

The original `/api/mobile` catalogue was found to contain only one product and no branch-001 effective prices on 5 November. The website catalogue is populated. SCPDA therefore explicitly selects the existing authenticated web read contract from the start; a network/auth failure does not switch it to a demo or another source.

## What the APK does

- Exact barcode or IC lookup; leading zeros remain strings. Partial matches are not selected. Shared barcodes require the user to choose an IC/name.
- Per-unit retail prices from `/admin/products` and branch-001 stock from `/api/branch-stock` without an Hourly/Shopee projection parameter.
- Existing StockDay username/password login, server-confirmed branch role/context, and CSRF-protected logout. Session cookies stay in native memory for the current app process; reopening after process death requires login.
- Manual camera capture, torch off by default, and a native Volume+ event handler to aim/capture. Bluetooth scanners paired as keyboards can enter the barcode and Enter.
- Opens the existing StockDay website externally. The packaged count demo opens in a separate Activity with no native API/session bridge.

This build does not submit live counts, create enrollment/staff accounts, change permissions, execute Ada stock adjustments, run sync jobs or infer stock-unit/pack conversion. Its only POST operations are existing login/logout.

The stock API's legacy mapper can turn a missing value into zero. SCPDA shows that uncertainty rather than treating such a zero as a confirmed empty shelf. It does not use price/table/fetch timestamps as the time stock was physically observed.

## Build

Requirements: Node dependencies already installed for the existing repo (esbuild), Java 21 with `jdk.compiler` and keytool, Python with Pillow, Android platform/build-tools 35.0.0. Standard Android SDK layout and the scoped review-toolchain layout are supported.

```sh
python scripts/build-scpda-android.py \
  --sdk /absolute/android-sdk \
  --out /absolute/new-artifact-directory \
  --signing-dir /absolute/private/scpda-signing
```

Use a separate output directory. Rebuilding an existing marked SCPDA build is supported; unmarked build directories are refused. The signing directory is private, is not committed/packaged, and must be retained for updates to the installed internal test app. A new internal test certificate is created on the first build. Production distribution/signing is a separate decision.

Result: `SCPDA-0.1.0-test.1.apk`, `APK-IDENTITY.json` and generated build files. Label **SCPDA**, package `th.co.scgroup1989.scpda.preview`, Android 8+, target SDK 35; no native ABI-specific libraries.

## Verification and limits

The APK was compiled, aligned, and verified with v2/v3 signatures. Seven read-contract checks passed. The exact packaged HTML was exercised through a host-JVM instance of the shipping `StockDaySession` and the actual existing backend authentication/product/stock handlers against disposable PostgreSQL fixtures. The handler files match live backend revision `3ab71e7131739887cda6c216e30a031daf198565`. This is not execution of Android WebView or a live authenticated phone session.

The fixture integration covers branch rejection, exact identity, ambiguity, per-unit prices, missing/zero/negative values, offline failures, logout, forbidden count writes and unchanged fixture stock. APK extraction verifies the demo has no bridge and host-only QA classes are absent from dex. Camera/Volume+ browser-event checks do not establish physical Android acceptance.

Physical acceptance: install on the intended Android, sign in with the existing branch account, allow camera when requested, scan known products, compare IC/price/branch stock with StockDay, and test Volume+ and the paired Bluetooth scanner. Only the device owner can perform these actions on that phone. No live credentials need to be sent into chat.

See [delivery report](../../docs/SCPDA_ANDROID_READ_DELIVERY_2026-11-05.md) for live data findings and evidence boundaries. iPhone remains a later platform target; this shared HTML/read module does not constitute an iOS build.
