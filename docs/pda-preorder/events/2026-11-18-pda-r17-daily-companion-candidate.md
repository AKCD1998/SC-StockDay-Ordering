# 18 November — daily QR/selfie companion candidate, not activated

User scope: primary01005 / branch005, secondary02005 on an iOS Home Screen web app.
Agreed: same Android/PWA UI and version; current-version primary creates a short-lived QR; one bound secondary installation; selfie at first daily login and work audit only; expiry00:00 Asia/Bangkok; private Drive selfie retention90 days. User accepted QR plus matching public IP as a temporary network check, not proof of SSID/LAN. A weekly reminder is enabled for Monday mornings around08:00 Bangkok, starting23 November.

Prepared review artifacts:

- Backend draft [PR70](https://github.com/AKCD1998/PaaSRTSM-project/pull/70), source `772ce61869f6b56c07c64250ee0510cb899a5c87`, branch `codex/scpda-daily-qr-r17`, base main `49f23bc6e2220561143cacf71d0471d5db678154`.
- Mobile draft [PR108](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/108), source `a1a83ae753feaba0df5f635fbc6f02b9dd448e3f`, same branch name, based on delivered R16 `98f479db1edd479cb3b218dabc3e7d3568892a57`.
- Android candidate0.8.0-test.17 / versionCode17, existing package/signer. Candidate APK SHA256 `d312e3e87efffc782e397fbea812f1ac114eb7f1a7773283df0adc7a2a24c2d6`. The prepared PWA is extracted from that APK with the browser host/manifest/shell wrapper. No new app/project.
- New migration089 is candidate-only, not applied to production. Re-fetch and check numbering before eventual activation.

Synthetic evidence:26 backend policy/provider/CORS/isolated PostgreSQL+HTTP checks;25 existing app model/transport checks; Android API35 compile and existing signer; shipping JVM primary login/count proof/resume/QR; actual QR decoded through Chromium fake camera, synthetic selfie login, fixture catalog/stock lookup, count quantity3 with lot/MFG/EXP and server receipt, persistent browser reopen without password/selfie. Server tests cover competing devices, replay, network change, midnight, preserved stock, upload-response loss and90-day image deletion. This is not physical iPhone/Android acceptance or a live Drive upload/retention test.

Production facts: connected Drive owner `admin@scgroup1989.com` has a newly created **empty, owner-only** folder `เภสัชอู๋/log scpda พนักงาน`, ID `1_JrtrlOJOIgmWA9PMOtknT1qgI_wGxZP`. No photos uploaded. ChatGPT Drive authorization is not backend OAuth; runtime Drive variables are absent. User confirms an existing company Google Cloud project; project ID/link and a suitable OAuth client/grant remain to be resolved. Never request/paste secrets in chat.

02005 is not active; only a private credential draft exists outside Git/ledger. No production migration, deployment, feature activation or release publication occurred. Published App Center release remains R16/version16, confirmed read-only18 November. Preserve live001/004/005 users and counts.

Do not reuse daily reader/count proof as product/CEO/enrollment authority. The separate Local product connector candidate still has its own owner/admission/SQL recipe/watcher prerequisites. No Ada product TEST, official stock write or Local source overwrite was performed. Follow the API/mobile activation notes and finish Drive + actual phone acceptance before publication.

Backend PR70 GitHub CI completed successfully at source `772ce618…` ([run44303239642](https://github.com/AKCD1998/PaaSRTSM-project/actions/runs/44303239642)). Mobile PR108 targets the delivered R16 source branch and has no configured hosted checks for that base; its local verification above is separate.
