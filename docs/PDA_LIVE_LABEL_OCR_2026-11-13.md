# Live label aiming and hold-to-choose — 13 November 2026

This continues the same SCPDA project and private Sites preview. It replaces the v8 captured-photo-only aiming flow and tap-to-cycle interaction. Backend/admin/auth/count transports, installed R4 APK, official stock, audience and credentials are unchanged.

## Interaction

1. Open **ถ่ายฉลาก · LOT / MFG / EXP**. The large rear-camera view starts sampling real frames for on-device OCR before the shutter is pressed. Detected text rectangles are green LOT, red MFG, blue EXP, with text labels as well as colour.
2. If an area is missed, hold a finger there for 500ms. A temporary rectangle and three explicit buttons appear: **LOT เลขล็อต / MFG วันที่ผลิต / EXP วันหมดอายุ**. The video continues playing while the menu is open. A moving finger cancels the pending hold; a short tap on empty space does nothing. A short tap or hold on an existing box opens the same menu; it never cycles the field automatically. The menu also supports cancel and removing an existing selection. Keyboard Enter on the view provides a central-region fallback.
3. Selecting a type creates a screen-area hint, with a dashed outline until a value is read. There is at most one manual hint per field. It guides subsequent live OCR locally. Automatic rectangles refresh from recognized frames; this is sampled OCR, not a high-frame-rate object tracker. Manual regions are screen-space aiming guides, not promised physical-label tracking.
4. **ถ่ายฉลาก** captures the visible viewport. Live values are discarded; only normalized region/type hints carry forward. The new still image is OCRed again, then **ตรวจข้อมูล** leads to explicit review. Existing differing values remain unselected by default. Only confirmed selected fields fill the draft. Quantity is never extracted or changed.
5. **×** works from live aiming, the type menu, captured photo and review. It stops all owned camera tracks, timers and worker activity, clears in-memory images/text/hints, and returns without applying suggestions.

## Implementation constraints

One OCR request runs at a time in a self-hosted Tesseract worker. A small frame signature detects camera changes, discards results from an obsolete scene, and clears old automatic boxes; detections also expire. Significant movement pauses fresh analysis until the view settles. The shutter and long-press interaction remain available while live recognition is running. The worker and callbacks are invalidated on capture, retake, close and backgrounding.

Live and capture use the same object-fit-cover viewport crop. Normalized rectangle coordinates transfer between analysis and final-capture resolutions. Optional photo-picker guidance uses the same explicit choice menu. Blank label fields remain allowed, month dates remain `YYYY-MM`, uncertain calendar/year readings are not guessed, and employees still review before applying. No image or whole-frame OCR text is uploaded or persisted. Previously approved quantity, correction, source-selection, offline/receipt behavior and production contract gates are unchanged.

## Verification

- 35 parser/date/crop-coordinate/motion/domain/barcode unit checks.
- 17 dedicated live-camera browser checks with real Tesseract on a clearly synthetic generated video stream: boxes visible before shutter, camera changes clear old boxes, physical touch long press opens all three choices, playing video continues while the menu is open, explicit reclassification/removal/cancel, no empty-tap creation, region transfer and fresh captured-image OCR, confirmation, quantity preservation, and × cleanup.
- 27 updated captured-photo/count/browser regressions, including 360/390/430 widths and the supplied product photo. That photo still needs guidance; LOT and EXP were read, uncertain MFG required review/manual entry. No original user photo is in the Site or review bundle.

These are cloud Chromium tests, not physical Android acceptance. Phone camera focus, dot-matrix print quality, shake, heat/battery and recognition speed vary by device. First use downloads the same pinned free OCR assets. No hosted inventory API, paid service, database migration, new auth permission or APK rebuild was introduced.

Evidence: `/workspace/artifacts/scpda-live-label-2026-11-13/`. Screenshots labelled SYNTHETIC show test camera frames, not proof of automatic extraction of the supplied label.
