# PDA R9 — annotated price/stock refinements

- Date:15 November2026, Bangkok; owner: existing PDA app chat.
- Status: implemented/tested/built/delivered Android0.5.1-test.9, code9.
- Source: `codex/pda-price-info-r9`, `6cd7d160fa928c9c98ce0b696387885b214f7769`; R8 base `537e0fdc25438c128734a1825dd10bb7960e6b8e`.

The user marked the R8 price screen: use **รหัส SKU**, enlarge the number and move stock branch/sync/routine information into a small orange **i** following **จำนวนตาม StockDay**, with current metadata maintained. R9 shows56px stock and a44px info action; company IC/630 identity, wrapped names and raw unit prices are preserved. Earlier count-form comments were already implemented and retained.

The popup shows actual source ingestion and successful read times separately, branch001 and Full Sync, approximate user-reported08:30 routine and references. Refresh existing read APIs on popup open, every60seconds while active/foreground and on foreground return. Coalesce requests; pause background and invalidate data/errors after navigation, replacement or logout. Failed reads retain last values/times and report failure. Do not invent a new source timestamp or claim a newly ingested morning snapshot. No scheduler or current-PDA-stock-source API was added.

37 model/reader/recent/refresh checks pass.9 exact-APK UI checks pass with controlled browser clock and synthetic native read data/real IndexedDB, covering popup/minute/foreground freshness, background pause, offline times and in-flight isolation;10 recent regressions also pass. Java lifecycle hook compiled; physical Android acceptance and fresh authenticated production evidence remain pending. APK archive/signature/alignment passed; same package/key and unchanged safe icon.

APK SHA-256 `bae3b676407c9430e2f2dc88d99d223babd201c26f262de3817d1f2c7254c405`,2,995,013bytes. APK/ZIP/guide/two fixture previews uploaded to existing [Drive destination](../DELIVERY_LOCATION.md), exact names/sizes/parents verified, no remote checksum claim. Artifacts `/workspace/artifacts/scpda-price-info-2026-11-15/`; no credentials/setup/key files or sharing changes.

Read Preorder events012–013 through `7c81960`. Multi-item request and ADA receipt notification/product mapping/FIFO allocation are acknowledged as queued domain/mobile work with their stated pending evidence/auth contracts. Peer implementation and owner files preserved; this is a Git acknowledgment, not cross-thread messaging or API acceptance.

No backend/admin deploy, migration/flag/account/device/CORS, Ada/CRM write, stock-source activation or production count activation. Existing explicit count-activation approval remains pending. Current source remains Full Sync and Preorder remains pending the separate mobile adapter.
