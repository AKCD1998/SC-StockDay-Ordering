# Daily companion R17 — mobile candidate

Base: delivered R16 `98f479db1edd479cb3b218dabc3e7d3568892a57`.
Candidate Android0.8.0-test.17 / versionCode17 uses the existing package, signer,
Keystore identity, IndexedDB count drafts/history and three-tab UI. No new app.
The Android/PWA version constants must match at build time. `build-scpda-browser.py`
extracts that same APK's HTML and adds only the browser transport and PWA wrapper.

Primary01005 can sign a daily selfie login and create a short-lived QR, using its
actual installed package version. The iOS Home Screen installation scans the QR,
uses02005, and stores a nonextractable P-256 key. Only a public daily session ID is
saved for proof-only resume; bearer capabilities and passwords stay in memory.
A different installation is rejected by the server's operator binding, including
a later QR. This is installation binding, not physical iPhone attestation.

The first login uses the front camera with preview/retake and close controls.
Camera tracks stop on exit/background. An authenticated daily selfie appears next
to the operator. No screenshots or background photography are added. The same
count/price UI, branch scoping, dated lot entry, pending-send behavior and saved
count evidence are preserved. Sessions reset at midnight Bangkok and do not
extend when the app is reopened.

**Not activated.** The API/PWA production deployment,02005 provisioning, real Drive
OAuth connection, image retention job and physical iPhone acceptance remain open.
The matching API candidate contains migration089, daily QR policy and the private
Drive archive adapter. Do not publish this candidate through App Center or install
it for the demonstration until those prerequisites are complete. Current published
App Center release remains R16;001/004/005 production behavior is unchanged.

Build candidate:

```
python scripts/build-scpda-android.py --sdk /workspace/toolchains/scpda-android --out /workspace/artifacts/scpda-daily-r17-2026-11-18/android-candidate --signing-dir /workspace/private/scpda-signing
python scripts/build-scpda-browser.py --apk /workspace/artifacts/scpda-daily-r17-2026-11-18/android-candidate/SCPDA-0.8.0-test.17.apk --out /workspace/artifacts/scpda-daily-r17-2026-11-18/pwa-candidate
```

The exported PWA is prepared for the existing StockDay web host's `/scpda/` path;
this candidate does not silently publish it. The shell's service worker never
caches API responses, photos or credentials. Fresh API access is still required.
QR fragments are removed from browser history; an HTTP GET/download never consumes
the server grant. Install on the iOS Home Screen before enrollment to avoid binding
a Safari tab's separate storage instead.

Synthetic verification:25 existing app model/transport tests, Android API35 compile
and existing signer check; shipping JVM session → isolated HTTP/Postgres primary
login/count proof/resume/QR; Chromium fake-camera QR → selfie → catalog → real count
receipt → persistent browser reopen. Source stock stayed unchanged. Real Google
Drive and physical iOS tests have not been claimed. Preserve the independent Local
product connector; these reader/count grants do not grant product-creation rights.
