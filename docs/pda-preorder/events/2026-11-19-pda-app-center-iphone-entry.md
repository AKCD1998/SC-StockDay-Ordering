# Android and iPhone entry in SC App Center — 19 November 2026

User explicitly requested publication in App Center after the verified Drive/005 daily QR activation. The existing SCPDA listing now has separate Android download and iPhone web app actions on its home row, details and updates tab. The iPhone action opens the existing `/scpda/` app; details instruct Safari Home Screen installation before login and identify the enabled branch 005 QR pilot. Search recognizes iPhone/iPad/iOS. Android remains published R20 / 0.8.3-test.20; no new binary or backend configuration was needed.

Website PR [112](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/112), head `c3471196d67265431452ff6d3b7e2943360c2168`, merged at `8ead53c5ab208b3f6a497ea9f633b9aa5d0c08d8`. PR CI `44460234676` and main CI `44460360485` passed all workspace tests and three web builds. Render static deploy `dep-dbv7t8rm8hqs73apdm6g` became live at 11:44:34 Bangkok. Shipping bundle `/assets/index-C9W_l70O.js` and stylesheet `/assets/index-Dr2LutjA.css` contain the new platform actions.

Production readback confirms the PWA entry matches its BUILD SHA-256 and source APK `613556f7825acebcb485bfab13fe08dfd9e86b93d375cd30b6a7ebdf4240fb09`, code 20. Public daily policy remains enabled for 005 at version 20; a read-only database query confirms Android R20 is still the latest published release. Existing backend, credentials, 01004/01004SHPEE scopes, APK releases and PWA files were untouched by this UI change.

Validation: production Admin Web build passed. Isolated Chromium exercised the actual component at 320/390/1280 px with no horizontal overflow or page errors, iPhone opening `/scpda/` without requesting an APK, search and updates navigation, and non-admin management remaining hidden. Android download retained CSRF ticket validation and verified the actual published 3,040,069-byte APK by SHA-256 and filename. This is isolated UI verification plus public shipping-asset readback, not authenticated production device enrollment or physical iPhone acceptance. No binding, employee photo, count or stock adjustment was created.

Entry: https://sc-stockday-ordering.onrender.com/#/app-center
PWA: https://sc-stockday-ordering.onrender.com/scpda/
Executor evidence: `/workspace/artifacts/sc-app-center-iphone-2026-11-19/` (`UI-VERIFICATION.json`, `LIVE-VERIFICATION.json`, mobile screenshots).
