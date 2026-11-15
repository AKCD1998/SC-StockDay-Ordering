# StockDay เช็คสินค้า — R11

User-authorized15November2026: enable real mobile count intake initially for01001, including lot/manufacturing/expiry, and a product submenu **ข้อมูลสินค้า → เช็คสินค้า** visible only to existing branch001 web accounts and admins. The backend uses explicit operator admission; the web page uses existing cookie sessions, not the PDA password/device token.

## Delivered page

- `#/stock-check`, gated by existing `VITE_FEATURE_SCPDA_LOTS_001=true` plus admin or original/effective branch001. Menu and direct-route rendering are both restricted; backend independently rejects other branches/staff/anonymous.
- Reads actual `/api/stock-check`, showing the full catalog with most recently server-received PDA reports first and unsubmitted items last. It preserves a genuine zero separately from **ยังไม่มีผลนับ**. Display exact company SKU, wrapped Thai names, reported quantity/unit, received time and review status.
- Filters **ทั้งหมด / เภสัช / ปกติ / สามัญ**, search code/name/barcode, server paging. Refresh every30seconds while visible and on returning, plus a manual action. Changed filters cancel old requests; a failure is explicit, not a replacement zero.
- Expand a row for lot quantities, manufacturing/expiry if supplied, actual observation time, operator/round/scope and receipt. Unknown dates stay unspecified. Admin may open the existing review drawer; branch001 has no review actions.
- These are reported observations, not an automatic Ada or Full Sync adjustment. Independent rounds/corrections are not added into a balance. Earlier manual-entry/OCR and stock-source boundaries remain unchanged.

## Validation

61 web component/navigation/branch-stock tests pass.5 full-web checks use actual existing cookie auth and the new API over isolated PostgreSQL, linked to the receipt produced by the exact APK/shipping JVM. They cover matching quantity/manufacturing/expiry/correction, category filters, admin navigation, branch001 read-only view and branch004 API/menu/direct-link denial.15 backend HTTP/PostgreSQL count/catalog checks and10 APK/JVM/admin workflow assertions are separate linked evidence. No production fixture counts or physical Android claim.

## Release scope

Backend PR52 carries migration083 and the scoped read API, with only01001 admitted by environment configuration. Deploy it and verify schema/flags before this web release. PR62's password compatibility is already live; the user-requested01001 rotation is separate and preserves the other readers. No production device is registered by tests, no new public Site/CORS, no account creation or Ada/CRM write. The existing Preorder owner/source is preserved.

Artifacts: `/workspace/artifacts/scpda-count-send-2026-11-15/`. Live deployment/schema/configuration evidence is recorded separately; preparing/building this page alone is not activation. Roll back the UI flag/code while retaining submitted evidence.
