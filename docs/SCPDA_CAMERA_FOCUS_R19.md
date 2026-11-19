# SCPDA R19 — scanner touch focus and simplified controls

Based on R18 source `25f217921af34cd45d3890a5e9d960d1354ab959` in an isolated
worktree. Package, signing identity, WebView origin and all stored count/device
identities are preserved. Version `0.8.2-test.19`, versionCode `19`.

## Behavior

- Android's product/price/pick barcode scanner owns a rear camera preview through
  `AndroidScannerCamera`, rather than relying on WebView to expose touch-focus
  constraints. The native preview occupies the existing HTML camera viewport;
  the existing read/confirm flow and decoder remain in use.
- A tap maps through the preview's center crop and display rotation to a native
  focus/metering region. Autofocus completion updates the indicator. Fixed-focus
  cameras and cameras without focus-area support are identified without claiming
  that a point was focused. Supported continuous autofocus resumes after a pause.
- Tapping never decodes or confirms. Pressing Read waits briefly for an in-flight
  focus attempt before taking the displayed target crop. Only that crop is sent
  to the bundled barcode decoder, in memory; no camera image is uploaded or saved.
- Torch and sound controls, audio initialization and barcode beeps are removed.
  The rear camera's flash is explicitly off. Existing short success vibration
  remains.
- Existing browser/demo scanning still uses the browser camera. It does not
  claim that every browser exposes point autofocus.

## Bridge and lifecycle

`hasNativeScanner()` identifies the Android scanner implementation. The existing
fixed-operation bridge adds only `scannerOpen`, `scannerLayout`, `scannerCapture`
and `scannerClose`; active app authentication is required except for closing.
Each request carries a unique scanner session. Layout coordinates are viewport
CSS pixels with the visible dialog clip and normalized scan target. Camera
capture replies contain only the cropped JPEG data URL. Stale replies cannot
close/replace another session. Closing, logout, background and Activity teardown
release the camera. Hardware errors expose the existing restart action.

No backend, inventory, account, device-enrollment or storage migration is needed.
This is a common Android APK for all branches, including both 004 teams.

## Verification and remaining acceptance

- All 114 existing PDA module tests passed, including count identity/corrections,
  prices, offline handling and the 004 area/pick contracts.
- `ScannerGeometryHarness` checks center crop, four rotations, center and edge
  metering without Android hardware.
- `ui-scanner-focus.py` uses the real bundled WASM barcode decoder with a simulated
  native transport. It covers explicit capture, layout changes, decode retry,
  hardware-error restart, close/reopen and stale image replies. No browser errors.
- The complete API35 Android sources compile and the APK verifies against the
  existing signing certificate. These checks do not execute Android's camera or
  Android WebView.

Physical-phone acceptance is still required: focus response and indicator,
preview alignment/crop in portrait and landscape, runtime camera permission,
scrolling on a short screen, background/reopen and repeated capture. No actual
phone was connected in this workspace. App Center publication is separate from
building this candidate; the existing published release is not changed by the
build.
