# PDA R18 —004 front/Shopee area release

19 November2026. User explicitly requested an Android update and01004/01004SHPEE accounts after confirming the separate physical areas and internal emergency picking.

## Implementation and live rollout

- Android0.8.1-test.18/versionCode18, source branch `codex/scpda-004-areas-r18`, commit `25f217921af34cd45d3890a5e9d960d1354ab959`, [source PR110](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/110). Isolated from R17 and web main; do not merge R17 backend to deliver this APK.
- Backend [PR72](https://github.com/AKCD1998/PaaSRTSM-project/pull/72), merged `08999348f391aab1fbf9c9a0744836000516c64b`. Additive migration090 recorded with Linux slash style. Compatible code deploy `dep-dbv5oprrjlhs73e550cg` live; subsequent same-commit deploy `dep-dbv5q1utlv9c73ft3oa0` loads the explicitly saved new account/area configuration. Configuration deploy verified live; account/hash/allowlist readback passed at09:22 Bangkok. Existing account records and invitations are byte-preserved apart from the single new addition.
- Website [PR109](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/109), merged `705ac25e337ea1abd375985efa4965bb0933bf41`, live deploy `dep-dbv5ncnf3r2c73fgbh3g`.
-01004 remains the existing front account, existing hash/version/invitation preserved.01004SHPEE maps server-side to branch004 and004-shopee, is explicitly count-admitted and has a one-device/operator-bound invitation. No password/hash/activation code belongs in this ledger. Full alias validation and native transport support are required together.

## Business contract

01004 covers front floor plus front warehouse;01004SHPEE covers rear Shopee and explicitly declares packed/unshipped coverage. Count scope cannot be chosen or spoofed by the phone. Whole-product completeness in a scoped payload means only that area; all downstream consumers must honor `countScope`/`completenessMeaning`. Legacy observations/drafts keep unspecified scope and original hash; old unsent payloads are not relabeled. Corrections cannot change scope.

The web shows latest evidence per area, unknown missing coverage and **null combined quantity**. Do not sum asynchronous observations or independent rounds. Scoped FEFO remains unknown until area-specific movement proof exists. Counts are still observations, not current stock/Ada adjustments.

The count tab adds internal front-warehouse→Shopee packing/shelf picks, optional order/lot, exact positive quantity/unit, local durable queue and one replay-stable receipt. Both004 teams read the shared log. These records conserve branch physical quantity and do not create interbranch files, stock adjustments, order reservations or shipment deductions. Existing SC-official Shopee commitment authority/cutover remain untouched.001/003/005 interbranch procedures remain unchanged.

## Validation and boundaries

-114 mobile model tests passed.
-26 isolated HTTP/PostgreSQL tests passed, including legacy hash/replay, scoped counts/dates, device/operator binding, spoof/other-branch rejection, completeness, immutable pick replay, migration rerun and unchanged reference balances.
-27 targeted React/navigation tests and production build passed.
-8 exact-APK HTML→shipping Java session/proof→actual isolated HTTP/PostgreSQL→actual React admin checks passed, including matching phone/web receipts, offline pick durable retry,001/005 and account switch.
-Backend PR CI44442399576 passed:920 total,811 passed,0 failed,109 skipped. Main CI44442930359 passed. Web PR CI44442403175 passed.
-Physical Android/Keystore/camera acceptance is pending the user's installation. No production phone was enrolled and no synthetic production count/pick or Ada TEST was written. Existing005 observations remain preserved.
-Only owned fixture API/Vite and `scpda004-areas-r18-pg-20261119` stopped; fixture data retained.

## Delivery and continuity

APK SHA256 `1067b82f77bad62f3c7de094b61005ab4a0dee9b71490dd16a65cf99e655bd31`,3,023,685bytes. Existing package `th.co.scgroup1989.scpda.preview`, signer `3d11b6af0d2f472632e313d6b94fab745cc4af8c360dfe356be7bf627847c20a`. Install over the existing app; do not uninstall/clear data.

SC App Center release `88d9d87c-816e-4849-b532-dc41169b430b` is published at version18; server publication read back the stored APK bytes and verified SHA256/size. Live unauthenticated session/count/pick/stock-check requests remain denied401; health200. Production evidence still has five005 counts and zero internal picks; no004 pairing/count was introduced by QA.

Private Drive destination remainsเภสัชอู๋/pdaAppProject. Metadata confirms correct parents/names/sizes and existing owner/writer-only permissions; no public sharing added. APK/ordinaryZIP contain no credentials. [Delivery links](../DELIVERY_LOCATION.md). The separate private guide/setup files contain authorized access details.

R17 daily/02005/Drive runtime OAuth remains inactive at its existing Google Cloud project-ID/client/grant checkpoint. Its migration089 must be renumbered above the then-current main/production ceiling and its operator constraints/loader must retain01004SHPEE before future integration. Production already records a separate `migrations/089_add_stock_discrepancy_pipeline.sql` although that file was absent from inspected main; preserve it. Current R18 is version18, so future shared QR/PWA version policy must match the new current version rather than publishing old17. Do not deploy the stale R17 branch wholesale.

The independent Local Ada product connector and single TEST-round ownership are unchanged. This release supplies no product/CEO authority and consumes no Ada test round. Coordinate through this ledger; do not start a parallel product writer.
