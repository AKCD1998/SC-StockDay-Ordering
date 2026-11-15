# PDA R8 — third tab: catalog price check

- Date: 15 November 2026, Bangkok.
- Proposer/owner: existing PDA chat; latest user request adds เช็คราคา.
- Status: app shell and existing reader UI implemented/tested/built/delivered; mobile preorder and PDA current-balance selection pending.
- App source: `codex/pda-price-check-r8`, `537e0fdc25438c128734a1825dd10bb7960e6b8e`, R7 base `6ef9f632a04463ddf0bbe69a54efa12aacbf9a11`.
- Version: Android 0.5.0-test.8 / code 8; same package and signing certificate, install over existing data.

## User-confirmed product direction

Three main tabs: **นับสต๊อก / พรีออเดอร์ / เช็คราคา**. Price check shows exact company IC/630 identity, full wrapped Thai name, single and quantity-unit selling prices and StockDay quantity/source/time. The user describes a normal morning sync around 08:30 and wants the future reviewed PDA stock source to improve accuracy. Record that direction without pretending the existing reader already selects PDA balances.

Catalog **เช็คราคา** does not create a customer request and is separate from **สอบถามราคา** in the Preorder workflow. Read the other owner's corrected mode flow/cancellation and product-picker refinements through events 009–011 at `18117da`; preserve their latest controls, mock-only status, role and API/auth prerequisites. The acknowledgment is through Git, not a direct message or a takeover of the domain implementation.

## Implementation and data evidence

The existing registered-device reader already exposes all retail unit rows. Read-only DB evidence found Sambion `IC-000981` / SKU1844 with แผง40 / `3 ชิ้น`90 / โหล300 baht. Do not derive quantity thresholds from price-tier numbers or bundle factors from unit labels. Match the recorded base unit for ซื้อเดี่ยว; if unknown, show per-unit prices without guessing.

The stock reader remains branch001 Full Sync; it carries table-ingestion time, not a physical count-time or verified stock-unit basis. Current Sambion DB evidence was45 at08:21 Bangkok; runtime values are fetched fresh and not fixed to this example. The UI labels the approximate08:30 routine separately. Missing, zero, negative and fractional reference amounts stay distinct. A saved local count or receipt cannot become the displayed balance.

No schema/auth/price/stock endpoint change was needed. A future server adapter must attest a reviewed complete/unit-compatible PDA baseline and intervening movement coverage before exposing a current PDA-derived balance, preserving actual source and observation/sync times. This remains proposed/unimplemented and is not accepted merely by this event.

## Verification and delivery

31 model/reader/recent checks passed; 7 exact-APK price/navigation and10 recent-list checks passed using synthetic native reads and real browser IndexedDB. Tests cover IC/630/barcode identity, raw prices, full wrapping320/390/496, footer clearance, draft retention, no local-stock override, tab isolation, late reads, failures and back navigation. Java back code compiled. No new live authenticated phone or hardware acceptance claim.

APK archive/signature/alignment passed. Compiled icon byte-identical to R7, safe radius0.24349. APK SHA-256 `498ad7a436df7b75e320add4d71dcef6fdb96b02f92f4931474041bae0afd69b`, 2,995,013bytes. [Drive files](../DELIVERY_LOCATION.md) verified by names/sizes/parents, no remote checksum claim; same destination and sharing. Evidence `/workspace/artifacts/scpda-price-check-2026-11-15/`.

No backend/admin deploy, migration/flag/device/account/CORS, Ada adjustment or CRM write; existing production count-activation approval remains pending. Peer owner/implementation files retained. The shared contract now records three tabs; no real mobile Preorder/auth or stock-source integration is accepted. Physical phone trial and those separate server contracts remain next.
