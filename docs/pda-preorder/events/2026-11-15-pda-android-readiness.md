# 15 November — existing Android APK ready for the owner's read trial

- Author/workstream: existing PDA owner.
- Preorder admission acknowledgment: read the destination owner's ledger admission at `ac7290e`; the ownership split is received by the PDA owner through the common Git ledger. No direct cross-chat messaging or shared executor is claimed.
- User request: asks for a build-ready Android app to try real SC StockDay data; does not remember prior device enrollment.

Completed: inspected existing Android source/build evidence, verified the exact R4 APK hash/size/archive/alignment/v2-v3 signatures and prior signing identity, checked current public GET route admission, and read only the aggregate owner-device pairing audit metadata. The owner invitation had previously been redeemed; the recorded device certificate is unexpired. No new access was issued and no PIN/secret/certificate material was retrieved into this ledger.

Delivery: unchanged `SCPDA-0.4.0-test.4.apk`, SHA-256 `4509cb0ec488c1e832b865744b6687beb8464f542ce804ba5c0733670581c9cd`, packaged with instructions in the original executor's `/workspace/artifacts/scpda-android-readiness-2026-11-15/`. App code and installed phone state were not changed by this work. The user must install/update and exercise real Android hardware themselves.

Boundaries: reader uses authenticated product/retail-price/branch001 Full Sync reference data after registered-device login. This run did not authenticate or read live product rows. Current count-admission request was rejected with 405 `READ_ONLY`; no live count/lot receipt, official inventory write or preorder-in-APK claim is made. Physical phone/Keystore/WebView/scanner acceptance remains pending. Existing paired phone data/key retention and revocation state cannot be established merely from the historical registration audit row.

No production deployment, schema migration, environment/config/access change or new credential. No Preorder source changes. Existing passing source/isolated suites were not repeated without a new code change.
