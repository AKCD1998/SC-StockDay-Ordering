# SCPDA R20 — Android updater signer metadata compatibility

The user reported `ลายเซ็นแอปไม่ถูกต้อง` in R18 while downloading R19.
In the shipping updater, this exact message is thrown when the selected Android
certificate array is absent or its length differs from one. An actual
fingerprint mismatch uses a different message. The canonical R18 and R19 APKs
both independently verify with the same single SC signing certificate:
`3d11b6af0d2f472632e313d6b94fab745cc4af8c360dfe356be7bf627847c20a`.
This does not identify which PackageInfo result the user's phone returned.

## Change

- Request both modern and legacy certificate metadata on API28+, preferring a
  nonempty modern result. On older Android use the existing legacy API.
- If metadata remains missing, re-query the archive/installed package with
  GET_SIGNATURES explicitly. An archive fallback must have the same package and
  version as the primary archive result.
- Retain strict single-signer, pinned SC fingerprint, matching installed
  fingerprint, server-declared fingerprint, file hash/length, package, version
  and minimum Android requirements. A different or ambiguous modern signer
  cannot be replaced with a convenient legacy signer.
- Distinguish unreadable metadata from an actual signer mismatch in user errors.
- Explicitly request v1/v2/v3 signatures in the existing builder. The earlier
  APKs already contained v1 signatures; this makes the build requirement explicit
  rather than claiming missing v1 caused the reported failure.
- Release version `0.8.3-test.20`, code20, includes all R19 camera changes.

## Verification and recovery

All 114 PDA module tests passed. The Android API35 build compiles. The signed APK
verifies under v1/v2/v3, including an explicit min-SDK23 verification to exercise
v1. The shipping pure-Java signer policy passes 18 cases using the actual release
certificate read from the signed APK, covering modern/legacy/missing metadata,
unexpected or multiple signers, wrong installed/server fingerprints and valid SC
identity. This does not execute the affected phone's PackageManager.

The updater in an already installed R18/R19 cannot be fixed from the server.
If it rejects this download too, install the signed R20 APK directly over the
existing app once, using Android's installer. Keep the package and original SC
signing key; do not uninstall or clear local count/enrollment data. Actual phone
installation and a subsequent App Center update remain device acceptance steps.
Publish R20 in App Center as part of delivery, following the user's preference.

Published and read back as the latest release at `2026-11-19T03:26:03Z`:
`57536673-20f3-4f48-9fb9-ed87968a31da`, versionCode20. SHA-256:
`613556f7825acebcb485bfab13fe08dfd9e86b93d375cd30b6a7ebdf4240fb09`.
The same APK is on Drive as `1ab-PYceO4K7PK1TiqwjzkgGNH-7OCcAI`.
