# R12 — user-authorized01005 / new branch005 Android trial

Owner: existing PDA workstream.16 November2026, production verification09:37 Bangkok (02:37UTC). Ledger base `63b6e81`; Preorder owner/source preserved.

## Authorization and result

User asked to create **01005** because they are working at **branch005** today and want to test the Android app. The user explicitly confirmed a **new/unregistered phone**. Prepared and enabled the narrowly scoped account, a new one-device005 enrollment invitation and necessary branch-safe app/backend changes. No005 web account, Preorder/HQ/CRM role, official Ada write or current-stock-source override was created.

Account configuration and its credential hash were verified in memory; existing01001/02001/03001 records and all previous invitation records preserved. No password/hash/activation secret is in this ledger. New invitation expires **18 November2026,09:35 Bangkok**; Android installation certificate lasts up to180days after enrollment. The invitation has not been consumed in production; no synthetic pairing/count was posted there. Actual Android enrollment/first real005 count remains user acceptance work.

## Source and live versions

- App **0.6.2-test.12**, versionCode12, `codex/scpda-005-app-r12`, **`c74eaeb2ccd5de25e698a6e5912715c10d44954d`**, original executor `/workspace/reviews/scpda-005-app-r12`. This is the new mobile continuation baseline; it retains R11's count/password and R9 price/recent/safe-icon work. Future mobile Preorder integration must preserve the005 changes instead of restoring the old001-only baseline. Existing app package, signing certificate, storage origin and histories retained.
- Backend PR[63](https://github.com/AKCD1998/PaaSRTSM-project/pull/63), head `e7ba5226010a0056a77e0cf327d8c3bc7e58b29e`, merged **`f4e617eef9a9eb805bec3383828a5ac97705e4e2`**. Compatible code deployed first as `dep-dbt6mjijnfac73d1ia60`; after appending the005 account/invitation, activation deploy **`dep-dbt6nr6c6qcc73at0spg`** became live02:36:34UTC.
- Web PR[101](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/101), head `b72eab5cb98d8cbf4d381cc2fab7d3030acd5749`, merged **`f9bf49d4054cb8424573800806d2552c548d4c52`**. Activation deploy **`dep-dbt6nrm1egvs73fj1n2g`**, live02:35:43UTC. Admin-only005 selector verified in deployed bundle. Existing branch001 web sessions remain001-only.
- Migration **`migrations/084_enable_scpda_branch005.sql`**, applied02:33:32UTC using Render's Linux predeploy. Extends immutable evidence constraints only, with exact operator/branch matching. Read-only production check verified migration/constraints and no incompatible evidence; post-activation005 observation/pairing counts were zero. No manual runner replay or official-stock mutation.
- Flags verified: existing read/count001 flags true; **`FEATURE_SCPDA_BRANCH_005=true`**, **`SCPDA_COUNT_OPERATORS_001=01001,01005`**, **`VITE_FEATURE_SCPDA_BRANCH_005=true`**. Other operators remain reader/local-only. Browser Site/general CORS admission and Preorder flags unchanged.

## Branch and identity contract

New005 invitation/certificate, reader/count JWT audiences, operator mapping, stock column, payload interpretation, local records and receipt must all agree on005.005 responses use `scpda-read-005-v1` / `scpda-counts-005-v1`;001 response schemas/fingerprints remain compatible. New005 phone selects01005 and disables001 operators;005 certificate cannot log in as01001 and001 certificates cannot log in as01005.

The API selects only the authenticated branch's whitelisted stock column.005 returns neutral `quantity`;001 keeps `qtyBranch001`. Explicit null/zero and unknown stock-unit/time meanings are preserved.005 counts/lots/MFG/EXP, correction references, history, lost-reply retrieval and duplicate IDs cannot cross into001. Admin can select005 in stock-check and review the same receipt; this does not grant a branch005 website login.

Count acceptance is physical evidence pending review. No automatic post-count sales deduction, current-balance adoption or official Ada adjustment is implied. Preorder's separate enrolled mobile identity/capability adapter remains a draft owned by the existing domain/PDA workstreams;01005 reader/counter credentials are not a shortcut into that domain.

## Verification and delivery

Passed18 backend policy/default-off/auth/FEFO checks,15 existing001 HTTP/PostgreSQL regressions,6 new005 HTTP/PostgreSQL scenarios,35 app model checks,61 existing focused web checks plus the updated6-case stock-check suite, production web build and CI for the backend/web PR/main revisions.8 exact shipping APK-assets → shipping Java JVM → isolated real HTTP/PostgreSQL → actual React admin browser checks passed, including new005 pairing/selection, alphanumeric login,005 stock, typed lot/date receipt, admin branch selection/CSRF review returning to the phone and001 isolation.3 final admin branch-envelope checks passed. Migration reapplication preserved six existing fixture observations and rejected a mismatched operator/branch. Software device proof does not certify physical Android Keystore/camera/WebView behavior.

Existing **เภสัชอู๋ / pdaAppProject** delivery folder retained. Metadata verified each file's name/size/parent and no public/domain permission; same individually shared owner/writer permissions, no sharing changes. Remote checksums unavailable.

| File | Bytes | Link |
|---|---:|---|
| SCPDA-0.6.2-test.12.apk |2995013| [APK](https://drive.google.com/file/d/1K-JEn0hS76QUIlwQnZ6PggjrMse2H4DE/view?usp=drivesdk) |
| SCPDA-005-device-setup.json |297| [User-requested new005-phone enrollment](https://drive.google.com/file/d/1Xz9eY4H6uwBuuRyborX2-pItNQdeMxqU/view?usp=drivesdk) |
| SCPDA-0.6.2-test.12-Android-005.zip |2738842| [Installation ZIP](https://drive.google.com/file/d/1xvNAk_VvYyjbcdRVno7_KoBrKYDLTZS7/view?usp=drivesdk) |
| START-HERE-SCPDA-0.6.2-test.12-005.txt |5469| [Instructions](https://drive.google.com/file/d/1tNGLn7avJVSTq2q_p-Nx0rSODpPCSi--/view?usp=drivesdk) |

APK SHA256 **`2d6980f023ff89480d2167751756505f6bbbb987f1261aa90fcd547c5a7ec997`**; existing signing certificate SHA256 `3d11b6af0d2f472632e313d6b94fab745cc4af8c360dfe356be7bf627847c20a`. ZIP SHA256 `f68b039c4f2dae26bc4d8c1a90740b9c26a33df7fb4a2e0444ee3e53c59cdde2`. ZIP/APK contain no password/invitation/private key/test fixture. The separately delivered setup JSON is the intentionally authorized new-phone enrollment credential; do not copy its contents into Git, comments, or normal reports.

Original executor evidence `/workspace/artifacts/scpda-005-2026-11-16/`: activation/provisioning/delivery manifests, local test logs/screenshots, APK identity and cleanup. Only this task's loopback39755/5205 listeners and label-verified PostgreSQL container were stopped at09:39 Bangkok; data/container retained, unrelated listeners and production services untouched. Release worktrees clean; peer source/owner files preserved.
