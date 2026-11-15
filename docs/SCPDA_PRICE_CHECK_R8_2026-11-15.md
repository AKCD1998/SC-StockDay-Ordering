# SCPDA R8 — catalog price check

User-confirmed request: add a third main tab **เช็คราคา**, alongside **นับสต๊อก / พรีออเดอร์**, with company IC/630 identity, full wrapped Thai name, single and quantity-unit prices, and StockDay stock with its source/time. Remain in the existing PDA project; keep the other owner's preorder work separate.

## Delivered behavior

- Android `0.5.0-test.8`, version code 8; same `th.co.scgroup1989.scpda.preview` package and signing key as R7.
- Price lookup uses the existing registered-device read transport, not new credentials or a public browser bypass. Exact barcode/IC/630 identity and ambiguity handling are retained.
- The single-price group matches the known recorded unit label. Other raw selling units appear separately; absent unit knowledge shows an ordinary per-unit list. Do not infer factors, minima, automatic discounts or price-level semantics.
- Full Thai names wrap. Ten recent identity-only shortcuts are shared across lookup tabs; opening one always fetches current source data. Count drafts/history remain separate.
- Tab changes save the draft, close the camera and invalidate late product reads. Android back consumes detail/tab navigation before exiting. Existing account/camera dialog close priority is retained.
- The preorder tab honestly says it is being prepared. It has no fixture cases, local role picker, member calls or unauthorized web-cookie adapter. Read the common ledger through `9f55152`; accepted mobile preorder auth/domain contracts remain pending. Catalog เช็คราคา is distinct from customer สอบถามราคา.

## Verified source facts and limits

Read-only StockDay database evidence on 15 November found SKU 1844 / `IC-000981`, ปกติ สามเบียน วิตามินบี 1 6 12 10 เม็ด: แผง 40, `3 ชิ้น` 90 and โหล 300 baht in active `public.sku_unit_prices`, imported via `adapos_excel_dataonly`. This supports displaying those recorded unit prices. It does not prove current POS automatic promotion behavior or a bundle-to-stock conversion. Source price date is null; row ingestion/update was 20 February 2026. No native Ada pricing row was available to verify its raw field mapping.

The queried branch-001 Full Sync row was 45, unit label แผง, table `synced_at` 15 November 2026 01:21:30 UTC / 08:21:30 Bangkok. The app reads its own live authorized responses, not this fixed example. The UI's approximate 08:30 routine comes from the user; it is never substituted for the actual response timestamp. The existing API does not attest the physical count time or stock-unit basis.

This reader currently selects Full Sync only. A future source-selection contract must return a reviewed, complete, unit-compatible PDA baseline with its actual observation time and adequate subsequent movement coverage before the price tab can call it a current PDA-derived balance. A local draft, uploaded receipt, partial lot count or newer timestamp alone cannot win. Current code makes no PDA balance claim and does not implement that server selection.

## Validation

- 31 Node model/reader/recent checks passed: raw units/prices, unknown base unit, escaped full identities, missing/zero/negative/fractional stock, actual timestamp and rejection of untrusted PDA-shaped extra fields.
- 7 exact-APK price/navigation checks passed with synthetic native read responses and real browser IndexedDB: three tabs, exact IC/630/barcode reads, 40/90/300 prices, name wrapping at 320/390/496px, footer clearance, retained drafts, no local count override, pending preorder, late-read cancellation, no stale fallback and in-app back behavior.
- 10 exact-APK recent-list regression checks passed, including capped MRU identities, re-reads, corrections/draft retention, cross-account isolation and reload.
- APK archive, v2/v3 signatures and alignment passed; signing certificate matches R7. Icon resources are unchanged and retain the validated safe geometry.

The exact-APK browser host is synthetic; physical Android WebView/Keystore/camera/Volume+ acceptance and a fresh production authenticated roundtrip are not claimed by these UI checks. Java back code was compiled into this APK; the native phone behavior still needs the user's installation test.

Artifacts: `/workspace/artifacts/scpda-price-check-2026-11-15/`. Completed files go to the existing Google Drive **เภสัชอู๋ / pdaAppProject** destination. Delivery manifests contain no PINs, setup JSON, tokens or signing material. No production migration, backend/admin deploy, flag, device/account/CORS change, Ada adjustment or stock-source activation occurred. The previously reserved production count-activation approval remains pending.
