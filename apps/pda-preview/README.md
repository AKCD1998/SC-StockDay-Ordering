# SC StockDay PDA preview

## Isolated API integration mode

A separate, opt-in loopback server now supplies real SQLite persistence, authenticated fixture assignments, receipts, source-choice history, and IndexedDB/offline retry. Start it using [the demo server instructions](../pda-demo-server/README.md). The static preview described below remains browser-only; its existing storage namespace, public fixture PINs and hosted v4 are unchanged. No production/staging count endpoint is connected. See [the current integration contract](../../docs/PDA_DEMO_INTEGRATION_CONTRACT.md).


Interactive Thai mobile/desktop prototype. Synthetic data only. Does not call the live backend or create real staff accounts. PINs and mock sync are browser demonstrations, not real authentication or server acceptance.

Run from repository root:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory apps/pda-preview
```

Open `http://localhost:4173`. Accounts: staff01 `1111`, staff02 `2222`, lead03 `3333` (branch 004).

Try: login -> sample scan -> enter lots and dates (or explicitly unknown) -> check complete -> save. For a HID scanner, pair in OS settings, select English keyboard, set Enter/CR suffix, focus scan input. Test actual hardware before rollout.

Use Settings for offline simulation, account switching, JSON export and explicit reset. History allows mock sync. Pending events do not replace selected stock. Simultaneous offline counts preserve revision conflicts. Source scenarios demonstrate count expiry, hourly failure, Full Sync fallback and unknown stock. Data persists in this browser only; clearing site data deletes it.

Run policy and outbox tests:

```sh
node --test apps/pda-preview/tests/domain.test.mjs
```

See [implementation design](../../docs/PDA_STOCK_COUNT_DESIGN_2026-10-31.md) for verified source findings, existing native-app decisions, server-side auth, lot/date semantics, source-policy limits and rollout.

Discrepancy flow: the sample scan shows website reference 6. Enter a complete count of 3, save, review the side-by-side comparison, confirm a full recount and provide a reason. History -> "แก้ไขโดยเก็บประวัติเดิม" preloads the original lots. Add the omitted lot, provide a correction reason and submit the full corrected total. History keeps the original and shows the linked incident evidence; no existing count is overwritten. Offline corrections remain pending and cannot change the selected quantity until simulated acceptance.

Camera prototype: choose "สแกนด้วยกล้องมือถือ", grant camera permission on HTTPS/localhost, aim, then tap the capture button. Decoding is one frame per deliberate press; success stops the camera and previews the product before opening the count. Torch/audio/haptic support depends on the phone/browser. Android Volume+ requires a native adapter and is not intercepted by this web preview. The sample-image button performs a real decode of a bundled Code128 image without camera access. Unknown codes remain visible and cannot create or select a substitute product. Frames are decoded on-device, with native BarcodeDetector or the vendored, pinned zxing-wasm fallback.

Run all tests with `node --test apps/pda-preview/tests/*.test.mjs`. The forthcoming multi-phone stocktake architecture is documented in [team stocktake architecture](../../docs/PDA_TEAM_STOCKTAKE_ARCHITECTURE.md); shared sessions are not implemented by this browser-local prototype.

Lighting: the scanner now starts with the torch off and uses ambient light first, to reduce glare on glossy barcode labels. Torch remains an explicit on/off control on supported browsers and is off again when reopening the camera. The web preview does not claim physical LED brightness adjustment; a low-intensity torch requires supported device/native camera APIs.
