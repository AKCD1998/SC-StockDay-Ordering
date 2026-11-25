# R23 PWA correction — one QR activation action

User explicitly asked to remove the confusing duplicate QR button on the iPhone activation screen,25November2026.

Web [PR116](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/116), source `693ba63ed95807dbc1a335035caec03a7a64d9ab`, merged `dd6a6ece069c962301076a1a1da79a8594f3f843`. The only generated entry change is adding `hidden` to `joinBranchFromActivation`; the blue สแกน QR จากเครื่องหลัก action remains connected to the existing QR scanner. BUILD entry hash and shell-cache identity follow the regenerated entry.

Source followup `eda958591cbb6918e6842a8539ac03adae6c218b` on `codex/scpda-r23-single-qr-source` contains the PWA-only conditional hide and export transform. Native Android retains separate invitation-file and QR actions. This branch follows deliveredR23; it is not a new signedAPK. Do not merge the complete mobile branch into webmain.

PWA code stays23, source signedAPK SHA256 `73a9c164a6ee8d4cb05aa815861f81ffd0a438084947c01db6d0b3386aa63f9f`. Corrected entry SHA256 `00e1ab0fe34d9bdd9fccbc304724ca0a81189102ed1932e886b72746efb6c505`. Existing AppCenter/Drive APK23, backend, accounts, daily expiry, QR grants, profiles, storage and annual work are unchanged. No APK reinstall or database/configuration migration.

Validation: production web build and PR CI passed. A mobile Chromium run of the generated PWA verified exactly one visible activation button, that its click still requests the QR camera, and zero page errors. Camera permission denial was synthetic; this does not claim actual iPhone camera acceptance. The previous screenshot's camera-access message is outside this narrow correction.

Evidence: current owner's `/workspace/artifacts/scpda-single-qr-r23-20261125`, including UI-VERIFICATION.json, SINGLE-QR.png and RELEASE-MANIFEST.json. Live deployment/byte verification is recorded alongside it. User reloads or uses settings → อัปเดตเว็บแอป; do not uninstall or clear unsent data.

