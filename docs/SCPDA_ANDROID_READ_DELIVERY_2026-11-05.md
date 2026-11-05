# SCPDA Android read integration — 5 November 2026

The existing SC StockDay PDA now has a signed Android **SCPDA** internal test APK, an SC blue/yellow/white launcher icon, and an explicitly selected real-data read path. No Site/StockDay/backend deployment or production stock/schema/permission change was performed.

## Live findings, read only

Render's confirmed **My Workspace** reported backend revision `3ab71e7131739887cda6c216e30a031daf198565` as live. Its product/branch-stock/auth/me handler files match the local handler files used in the isolated run.

Actual read-only queries against `sc_drug_db` found:

| Source | Rows / state |
|---|---:|
| `ada.branch_stock_snapshots` | 6,865 |
| `ada.products` / `ada.product_barcodes` | 1 / 2 |
| `ada.product_effective_branch_prices`, branch 001 | 0 |
| `public.skus` / `public.barcodes` | 7,075 / 18,607 |
| `public.sku_unit_prices` | 10,774 |
| `public.prices`, open-ended rows | 5,964 |
| Stock snapshot products matching public SKU company code | 6,860 |
| `ordering.pda_count_events` / fixture operator code table | absent / absent |

The old mobile read contract was accurately documented, but its catalogue is not populated for this trial. Merely packaging that adapter would not supply the website's products/prices. This discovery does not authorize filling tables, changing sync jobs or altering production authentication.

## Selected contract

SCPDA uses the existing website's authenticated API from the start:

- `POST /admin/auth/login`, followed by `GET /admin/me`: require the server's branch role and effective branch `001`.
- `GET /admin/products?keyword=…&limit=200&offset=0` and `GET /admin/products/:sku_id`: verify exact barcode aliases or exact company/IC code. Shared identities require human selection; truncated searches are refused.
- `GET /api/branch-stock?search=…&limit=200&offset=0`: match the same exact product code. No Hourly/Delta/Shopee parameter or source substitution is used. Stock-only products remain readable with price unavailable.
- `POST /admin/auth/logout`: existing cookie and CSRF semantics, with native memory cleared even if the network request fails.

These are reads of actual Ada-synced records maintained by StockDay, not a direct SQL connection from the phone into the on-premises Ada POS system. They do not prove business freshness. Stock's physical observation time, scanned pack and canonical conversion remain unknown. Fetch time and price timestamps are not relabeled as stock time. A legacy mapped zero is disclosed as potentially missing; negatives/fractional source values are retained.

The app uses the existing **web branch account**, not the undeployed reusable-PIN/count candidate or a fabricated mobile session. It does not mint tokens, create accounts or export database credentials. The earlier three public demo codes remain confined to the count demo. Native HTTPS uses normal authenticated requests and default TLS checks; no CORS setting, public proxy/tunnel or auth weakening was added.

## Android and common code

`apps/scpda-android` owns the Android shell/build target in this same project. `apps/pda-preview/scpda-*` and `stockday-live-contract.mjs` provide the common interface/read model; the existing camera and WASM decoder are reused. The original preview/count files and backend worktrees are unchanged by this phase.

The native bridge only accepts typed login/logout/product/stock operations and explicit open-website/open-demo actions. Remote pages cannot load into the bridge-bearing WebView. Packaged assets use an HTTPS app-assets origin, restrictive CSP, disabled file/content access and disabled cleartext traffic. Only trusted-origin video capture can request Android camera permission. No microphone permission is requested. The count demo has its own Activity without the native bridge or native web-session cookie jar.

The app icon is an original generated white SC monogram framed by yellow scan corners on royal blue. Existing SC assets supplied the palette `#0b1fb8 / #f6e96b / white`. The source image is retained under `branding/`; Android icon resizing is part of packaging. Font/decoder notices are included in APK assets.

The APK is an internal test distribution, package `th.co.scgroup1989.scpda.preview`, label **SCPDA**, version `0.1.0-test.1`, minimum Android 8, target SDK 35. It is aligned and signed with a retained private local internal-test certificate. No keystore/password or SDK is included in the review package.

## Actual verification

- **7 contract tests passed**: branch auth, exact/leading-zero identity, ambiguity, null/zero/negative/fractional handling, unit prices, stock-only rows and bounded search.
- The exact packaged HTML ran in Chromium through a **host JVM of the shipping Java session class**, existing HTTP auth/product/branch-stock routers and an isolated real PostgreSQL fixture. Verified branch-004 denial; branch-001 sign-in; stock 6 and prices 3/60 by unit; shared-barcode choice; stock-null mapped-zero disclosure; negative stock; missing price; escaped names; offline failure without demo/stale substitution; logout; forbidden count operation; and unchanged fixture reference rows.
- Embedded WASM initialization and explicit Volume-event aiming/capture policy passed with fake browser media; torch starts off. No automatic read happened while aiming.
- APK inspection checks app name/package/minimum API, declared permissions, alignment/signatures, expected assets and absence of the host-only QA class. The public demo remains separate from native credentials/requests.
- No live username/password was used in the cloud. Anonymous live probes confirmed auth enforcement. Production database query results and fixture execution remain separate evidence.

**Not verified:** Android OS/WebView execution, physical camera/torch/Volume+/Bluetooth, or an authenticated live product lookup on the user's phone. No emulator/device result is implied by the browser/JVM run. Installation, entering the existing branch credentials and granting camera permission are device-owner actions. These are the next acceptance steps; the APK is ready to attempt them.

## Remaining gates

The deployed database has no count ledger table. This APK does not send live counts or adjust Ada stock. The existing count/lot/date/audit candidate and accepted contract/migration/deployment gates remain as previously documented. Its synthetic count demo is available through settings and remains visibly labeled. Hosted v4, old ScProductDev static port 8765, prior Windows R2 acceptance and iPhone support are unchanged/separate.

No production writes beyond future user-initiated normal sign-in/out are enabled by this build. This session performed no live login, deployment, inventory write, migration, permission/CORS modification, new remote service or scheduled job. Only owned disposable fixture resources were used for integration testing and cleaned up.

Artifacts: `/workspace/artifacts/scpda-android-2026-11-05/`; see `APK-IDENTITY.json`, `qa/native-read-roundtrip.json`, `live-contract-tests.tap`, `build.log`, and the sanitized live-findings report. [Build/source guide](../apps/scpda-android/README.md).
