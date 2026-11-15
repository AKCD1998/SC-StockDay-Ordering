# SCPDA R11 — branch001 count submission and StockDay stock-check

The user explicitly authorized real count submission initially for operator01001, including available manufacturing/expiry dates, and a new StockDay submenu **ข้อมูลสินค้า → เช็คสินค้า** for existing branch001 web accounts/admins. This supersedes the earlier pending approval for this precise pilot. Other operators/branches, device enrollment, Site browser admission, general CORS, official Ada adjustment and current-stock-source overrides are excluded.

## App

Android **0.6.1-test.11**, code11, same package/signing certificate and storage origin. Retain the installed device key, saved drafts/counts and R9 price-check UI; R10's exact alphanumeric password support is included. Credentials are not in source/delivery files. Fresh login negotiates a distinct count-purpose grant; server admission permits01001 only. Other readers can still look up products but cannot send.

Send explicit SKU/barcode/unit/category/round/scope, lot quantities and supplied manufacturing/expiry dates. Explicit unknowns stay null. The server returns one durable receipt per immutable event; retry/response recovery does not duplicate it. Corrections link to the original, and independent rounds remain separate. Old records saved as local-only require an explicit send by their original operator; enabling the server does not silently upload them.

## Website

`https://sc-stockday-ordering.onrender.com/#/stock-check` uses existing web sessions, independently scoped to admin or original/effective branch001. It reads the actual catalog and PDA observations. Latest server-received reports sort first, unsubmitted products last. Filters: เภสัช / ปกติ / สามัญ. A real zero is distinct from no report. Expand lots, dates, observation time, operator/round/scope and receipt; review status is visible and admin alone has review actions. This is reported count evidence, not an automatic Ada adjustment or current-balance replacement.

## Evidence and rollout

17 backend scope/default-off/auth/FEFO checks,15 actual isolated HTTP/PostgreSQL count/catalog checks and61 web regressions passed.10 exact APK→shipping JVM→actual isolated HTTP/PostgreSQL→actual admin React assertions cover date-preserving receipts, reasoned late lots, offline cold reopen, lost-response recovery without another POST, immutable corrections and shared history.5 full-web/cookie-auth checks link to the same native correction/receipt, verify quantity and manufacturing/expiry, categories, admin menu, branch001 read-only access and branch004 API/navigation/direct-link denial.

Source/backend PR62 password compatibility is merged/live at f5e372e; count PR52 carries migration083 and explicit01001 admission; web PR92 carries the new page and review UI. Production flags/deploy/schema/credential status are separately recorded in `/workspace/artifacts/scpda-count-send-2026-11-15/`; code/build preparation alone does not prove activation. No synthetic count is posted to production to test it. Physical Android WebView/Keystore/camera and the user's first real submission remain separate acceptance evidence.

Release flags: backend `FEATURE_SCPDA_COUNTS_001=true`, `SCPDA_COUNT_OPERATORS_001=01001`; web `VITE_FEATURE_SCPDA_LOTS_001=true`. Scoped Site/browser flag remains off. The user separately authorized changing only01001's credential; peers, signing keys and registration remain unchanged. Rollback disables the count/UI flags while retaining evidence.

Completed APK/ZIP/instructions go to the existing **เภสัชอู๋ / pdaAppProject** Drive folder. No requested password, private setup JSON, provider key, signing key or test-device material is included.
