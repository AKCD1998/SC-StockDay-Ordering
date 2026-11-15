# SCPDA R9 — prominent stock and information popup

The user annotated the R8 price screen: replace the company-code label with **รหัส SKU**, enlarge stock quantity, and move branch/sync/routine details behind a small orange information icon following **จำนวนตาม StockDay**. Keep those details updated even when hidden. The earlier count-form annotations were already implemented in R5/R6 and are retained, not new requirements for this release.

## Result

- Android **0.5.1-test.9**, code9; existing package/key and local databases preserved.
- Main stock card shows its heading, orange i and 56px quantity. Unknown quantity stays explicitly unknown with appropriate smaller type. The visible SKU is still the exact company IC/630 code; do not substitute the internal numeric `sku_id`.
- Accessible 44px information action opens a labeled modal with branch, source, actual source ingestion time, approximate user-reported 08:30 routine, last successful read time and additional unit/price references. X, native dialog back and escape return to the same price page.
- Refresh via the existing registered-device read endpoints when the modal opens, every60seconds while the price view is active/foreground, and immediately on foreground return. New quantities, prices and metadata come from the same freshly validated SKU response. Hidden metadata uses the current response; it is not an independently cached label.
- Refresh requests coalesce. Leaving the view, switching products/tabs, background or logout cancels timers and invalidates old results/errors. An identity mismatch returns to lookup. Current authentication errors still require login. A canceled queued read does not start a network call.
- Network failure preserves the last successful response and actual sync/read times; the popup says the latest read failed. A later successful read clears the error. No response failure or app foreground event invents a new source sync time.

The actual backend may still hold the same morning snapshot after repeated reads. R9 refreshes available data; it does not alter the server's sync schedule or guarantee that a new morning snapshot exists. The approximate routine is user-supplied, not fetched from a scheduler contract. Current source remains branch001 Full Sync, with unknown physical observation time and stock-unit basis. Reviewed PDA stock-source selection and the separate count-activation boundary remain pending. Preorder remains pending its separate accepted mobile adapter.

## Validation and delivery

37 Node model/reader/recent/refresh checks pass, including coalescing, stale-result rejection, paused/resumed reads, failed-refresh timestamps and canceled queued requests. 9 exact-APK price/navigation checks pass and additionally exercise the info popup, live minute refresh using a controlled browser clock, foreground/background behavior, failed-read reporting and in-flight tab isolation. 10 exact-APK recent-list regressions pass and cover retained drafts/counts and account-scoped shortcuts. Browser fixtures use synthetic native read responses and real IndexedDB, not production login or physical hardware.

Java foreground notification is compiled into this APK; Android WebView/Keystore, native resume timing, camera/Volume+ and the installed phone still need physical acceptance. APK signature/alignment/archive and unchanged icon resource checks are separate package evidence. No backend/admin deploy, migration, flag, credentials/device/CORS, official Ada/CRM write or stock-source activation is part of R9.

Artifacts: `/workspace/artifacts/scpda-price-info-2026-11-15/`. The finished APK, installation ZIP, instructions and fixture screenshots go to the existing **เภสัชอู๋ / pdaAppProject** Drive folder, with names/sizes/parent metadata read back. No PINs/setup JSON/keys or sharing changes. Common-ledger handoff preserves the Preorder owner's event012 through `cba0b7e`.
