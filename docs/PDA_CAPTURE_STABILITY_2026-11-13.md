# Capture stability and field retention v4 — 13 November 2026

Same SCPDA project, existing private Site and synthetic browser-local count flow. The user reported that aiming demanded an unusually steady hand and that a LOT visible during aiming disappeared after capture. Their screenshots also show the role badges covering adjacent lines. The screenshots are UI evidence, not clean camera inputs; typed overlays conceal some printed characters, so no claim is made that their hidden pixels were OCRed.

## Resulting behavior

- Small outline movement is damped for display only. Large movement snaps to the new position; OCR and touch targeting retain the actual image geometry. Role badges sit beside the value instead of covering the preceding text line.
- Live OCR now acquires its input **after** reader initialization. A cold download/initialization cannot cause the first pass to read an unnecessarily old frame sampled before loading.
- The shutter gathers three frames roughly 100ms apart and selects a clearer compatible image. The rolling unrecognised buffer is bounded to three recent frames (2.2s); two fully read frames can be considered for up to 4s. Frames are checked against current text patches. Known incompatible LOT patches veto old buffer frames; expired/unrelated frames are excluded. The employee sees the exact selected image, with a notice if it predates the shutter.
- Previously recognised fields are retained **only when they came from that exact selected image**. They remain visible while its repeat OCR runs, and survive a failed repeat read. This is not field-by-field fusion of values from different pictures. Older-image matches can provide search locations only; new OCR on the selected image must supply any additional values.
- Missing fields get focused crop retries using user hints, compatible prior regions or a printed LOT/MFG/EXP label. Normalisation handles both dark-on-light and light-on-dark print. Plain enlarged text is attempted first; dot-connection is a fallback.
- Different readings on the selected image become explicit choices. A conflicting field is unselected and cannot be applied until chosen or edited. A temporal LOT disagreement forces a fresh-image choice and separate LOT review. O/0 and I/1 remain employee verification cases, never automatic substitutions.
- × cancels even a pending burst, stops both workers/camera/timers and clears frame/read caches. Retake, a new count-camera session, or a gallery image cannot silently reuse a preceding image’s values. Quantities, identity/auth/stock source rules and corrections are unchanged.

Image buffers, grayscale patches and selected canvases remain local memory only. No photo/video or crop is uploaded or persisted. Confirmed local demo metadata records the selected frame identifier/method, whether it was recent, reading provenance and any conflicting candidates, with `imageStored:false`. No official stock write, production backend/admin/schema/auth/CORS/audience change, new service/cost, or installed APK change is included. Production month-date/count transport gates remain unchanged.

## Evidence and limits

- 43 parser/date/crop/quantity-domain/barcode and quality-selection unit checks, including a changed-LOT veto, expiry of old frames, blank-frame rejection, same-image conflict retention and rendering-only smoothing.
- 12 browser checks using real Tesseract on a generated stream with a deliberately blurred shutter interval. All three fields survived, quantities stayed unchanged, badges were beside values, an explicitly injected cached conflict required resolution, and × cancelled a burst without a late camera/overlay.
- 7 cold-reader/retention browser checks. The generated label changed from A2601 to B7788 during an injected initialization delay; the first real OCR read B7788. A deliberately failed second pass kept all three actual readings from the selected image, required explicit apply and recorded retained-value provenance. A new session cleared the old cache.
- 17 live-camera and 27 captured-photo/count browser regressions passed. The earlier real dot-matrix photo remains imperfect: guided LOT/EXP were read, MFG needed manual review. This release does not claim perfect OCR of it.
- 12 checks replaying the earlier actual failure recording still located all three printed-value lines and read the spaced month/year dates. That replay is distinct from the generated blurred-shutter and error-injection tests. No user recording/frame/screenshot is packaged or published.

These are cloud Chromium tests, not a physical iPhone/Android retest. The aim is less sensitivity to jitter and fewer erased readings; heavily blurred print, large pose changes and ambiguous characters may still require a close-up or manual correction. This is not optical stabilisation or CamScanner-grade perspective tracking. Phone focus, speed, memory and heat still need device acceptance.

Evidence: `/workspace/artifacts/scpda-capture-stability-2026-11-13/`. Hosted checks, when present, are recorded separately from local replay and physical-device acceptance.
