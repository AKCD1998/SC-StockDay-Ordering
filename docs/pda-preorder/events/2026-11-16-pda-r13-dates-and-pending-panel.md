# SCPDA R13 — combined pending-count and long-range date update

16 November2026,11:20 Bangkok. PDA owner completed the user's two UI requests in one Android build, after first holding the queue-panel update for the additional date request. No Preorder ownership, backend/website deployment, account/permission/configuration or production stock/count data was changed by this release.

## Behavior

- Normal history with received counts has no queue panel/button, including receipts awaiting review. Only unsent/unconfirmed items show a pale-red medicine list and red/white **ส่งรายการค้าง** action. Offline/correction/reason-required states retain their actual actions; intentionally local-only historical rows are not silently uploaded. Review status refreshes on history entry/foreground and every30seconds while appropriate.
- Manufacturing/expiry fields accept direct numeric DDMMYYYY or separated day/month/four-digit year, normalize valid entries to DD/MM/YYYY, accept Thai digits and Buddhist years2400–2999, and keep ISO/null API payloads. Calendar month/year headings open12-month/12-year grids; arrows move years or12-year pages. Empty fields do not assume today, invalid dates are rejected, and changing an impossible leap day asks for a new day. Cancel/close preserves the original field. Unknown checkboxes and separate lot targeting remain.
- Existing001/005 identity, quantity/unit rules, storage identity, signing key, receipts and count/price tabs remain. OCR stays paused; no mobile Preorder adapter or official Ada/current-balance writer was enabled.

## Source and evidence

- Source branch `codex/scpda-next-ui-batch`; compiled source `65324c4bef39659c3bdcf71eb7391e34e925166e`; QA/documentation head `7c8cf60b7bff2137f06b0138936b3cfc1e80237b`. Both verified pushed. Earlier queue-only source `ec2227b` is included. Original isolated checkout `/workspace/reviews/scpda-next-ui-batch-20261116`; R12 release and peer worktrees retained.
- APK **0.6.3-test.13**, versionCode13; package `th.co.scgroup1989.scpda.preview`;2,999,109bytes; SHA256 `93969624752039529cfbfa78f94ad6052cac428a7bc47adb31e5653d1128bd3b`.
- Archive integrity, alignment and v2/v3 signing verified. Same signing-certificate SHA256 `3d11b6af0d2f472632e313d6b94fab745cc4af8c360dfe356be7bf627847c20a`; icon safe zone unchanged/verified. One combined APK build; only a test assertion and documentation changed afterwards.
-38 app-model/identity/date/payload/price/recent tests passed;10 date-browser and8 pending-panel regression checks passed, including320/390/496px layouts; browser errors empty.
-9 exact-APK → shipping Java → actual isolated HTTP/PostgreSQL/admin-web checks passed. Includes numeric/date-picker input, durable005 receipt dates, absence of a normal-state queue button, review return to phone,001/005 isolation and logout. The initial harness attempt hit404 because Vite was started at the repository root; corrected to apps/admin-web and retried with a fresh synthetic software device. No application rebuild was needed. Tests are host/software-device evidence, not physical Android camera/Keystore/upgrade acceptance.
- Original executor artifacts `/workspace/artifacts/scpda-ui-r13-2026-11-16/`, source UI proofs in `/workspace/artifacts/scpda-manual-dates-2026-11-16/`. `APK-IDENTITY.json`, `TEST-SUMMARY.json`, `PACKAGE.json`, `GOOGLE-DRIVE-DELIVERY.json` distinguish compilation, retained live count capability and release hardware acceptance. Synthetic fixture files remain private/local and are excluded from delivery. Own HTTP/Vite servers and labelled disposable PostgreSQL were stopped; test data retained.

## Delivery and continuation

Verified in the existing **เภสัชอู๋ / pdaAppProject** folder:

- [APK](https://drive.google.com/file/d/14oyKj_gsejrguUes9QLcVefrfwcuvVDz/view?usp=drivesdk),2,999,109bytes.
- [Combined update ZIP](https://drive.google.com/file/d/1z7wHjDHxLkVUa-rvqwZXEzzNX89hQ41S/view?usp=drivesdk),2,773,004bytes.
- [Instructions](https://drive.google.com/file/d/1hrYN2CGIEiuEueQcOP0id4qUXUQk6f--/view?usp=drivesdk),3,768bytes.

All three names/sizes/parent IDs read back; existing individually shared owner/writer access preserved, no anyone/domain permissions or sharing changes. No remote checksum claim. ZIP contains only explicit APK/instructions/sanitized proof/date-preview/hash files; no credentials, invitation, private key or fixture.

Install over the existing app; do not uninstall/clear storage or issue/import a new invitation on an already paired phone. Use the existing operator/branch. R12 user's005 upload was independently matched earlier as received; R13 installation/date-entry/hardware feedback is next. Count accuracy, audit/review, post-count sales reconstruction and official Ada adjustment remain separate from successful receipt collection. Preorder continuation remains with the agreed owners and ledger contracts.
