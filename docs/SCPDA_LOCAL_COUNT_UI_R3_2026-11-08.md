# SCPDA local count capture R3 — 8 November 2026

Version `0.3.0-test.3` adds lot/quantity/date capture to the existing Android reader UI, after a successful product lookup. It also removes the requested scanner instructions and uses a red **อ่านบาร์โค้ด** action. The APK retains its package ID, internal signing certificate, registered-device PIN login and existing reader transport. There is no backend deployment, credential change, permission change, schema migration or official stock write in this release.

## User flow

Scan or enter an exact barcode/IC, check the product, choose **นับสินค้า**, then specify category, independent recount round and the unit actually counted. Enter one or more lots with manufacturing date, expiry date and whole quantity. Unknown lot/date values require an explicit **ไม่ทราบ** selection and are stored as null. A blank quantity is not zero. Totals add lots within this one observation; recount rounds are never added together.

**ตรวจจำนวน** opens the concise confirmation with IC/name, unit/barcode and per-lot quantities/dates. **ยืนยันและบันทึก** saves an immutable local record marked **ยังไม่ส่ง**. **ผลนับ** shows saved records and unfinished drafts. A correction creates a new record linked to its original, requires a reason and preserves the original count time, product/unit/context and original evidence. A unique correction index prevents a second successor to the same original. The IndexedDB transaction commits the new record and clears its matching draft together. A stable event ID and disabled save action prevent a double tap from duplicating a count.

Scanner changes remove the Volume+ instruction, image-processing/privacy paragraph, long page-hide message, English technical kicker and “เล็งก่อน แล้วแตะอ่าน” heading. The title is **สแกนบาร์โค้ด** and the button is **อ่านบาร์โค้ด**. Real camera/permission errors remain visible. Trigger gating, crop/decoder behavior, torch-off default, camera release and paused/disabled state remain unchanged.

## Architecture and boundaries

`scpda-local-counts.mjs` owns validation and the local IndexedDB record/draft stores. `scpda-count-ui.mjs` owns the form, review and local history. The UI-review export uses a different database name from the Android reader. Browser-demo public PINs never become live authentication credentials.

Records preserve barcode/IC strings, the selected unit label, exact unknown dates, the operator/branch context from the active reader UI and the reference snapshot read with the product. Unit factors, stock-unit basis and physical stock observation time are not invented. The website reference remains visible; local counts do not replace it. `syncState` is `local-only`, `serverReceipt` is null, `sourceSelectionChanged` is false and `officialStockWrites` is false. The selected unit label is not a verified base-unit conversion or an accepted backend product-identity contract.

Count times and corrections are device timestamps, not server timestamps or server-accepted audit evidence. Attribution is local to the active operator UI. Records are filtered by branch/operator; current reader authentication/assignments are not expanded. Existing online login is still required after Android process death. No offline PIN verification, saved Bearer token or background count uploader was added.

The deployed backend still has no accepted mobile count/lot/receipt upload contract in this work. Reader product/price/stock requests retain their existing API and auth behavior. Local count records are not a shared multi-phone ledger or official Ada adjustments. Removing the app or clearing its data can remove local records. Android WebView cold-restart persistence and physical-device acceptance remain pending; browser page reopen persistence was verified. The synthetic demo's storage is tied to its loopback origin, which can change when its launcher is restarted.

## Evidence

- 24 targeted checks passed: local count validation, whole-number input, scanner gates and existing reader identity/lookup/null semantics.
- Final APK assets were exported into the synthetic browser demo. The served HTML SHA matched the final artifact. The browser run passed lot/date/quantity entry, two-lot total 5, explicit unknowns, a draft restored after page reopen, offline local save, duplicate-tap prevention, correction to 6 with the original unchanged, saved records restored after reopen and unchanged reference stock 6. No external requests or page errors occurred.
- Camera checks used simulated video: red capture, short label, removed copy, aiming before capture and pause/release with capture disabled. No physical Android camera/Volume+/torch/Bluetooth acceptance is claimed. A QA polling expression initially encountered the existing CSP; locator polling fixed the test without weakening CSP.
- APK compilation, alignment and v2/v3 signature verification passed with the existing signing certificate. Native Java/auth/HTTP transport files were not changed.

Artifacts: `/workspace/artifacts/scpda-local-counts-2026-11-08/`, including APK identity, `domain-checks.tap`, `UI-CHECK.json`, screenshots and browser-demo ZIP. These are cloud-local UI/storage checks, separate from the previously verified live reader backend, hosted v4, old port-8765 HTML and the historical ScProductDev fixture acceptance. No hosted version was published.
