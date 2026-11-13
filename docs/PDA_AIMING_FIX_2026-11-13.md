# Empty aiming view: recorded-failure fix — 13 November 2026

The detector described here remains in use. Its single-frame shutter and pre-initialization sampling are superseded by [capture stability v4](PDA_CAPTURE_STABILITY_2026-11-13.md).

The supplied three-second phone recording showed the fixed outer guide, no detected text rectangles, and a reader-preparation message. Previous live checks used a clean generated video; they did not establish reliable operation on the user's handheld packaging. The recording alone cannot tell whether the phone's OCR initialization was still loading or stalled, and no physical-device fix is claimed from cloud tests.

## Changes in the same PDA project

- Text localization now runs independently of Tesseract/model initialization, in a small self-hosted module Worker. Adaptive local contrast, connected components and line grouping locate both light-on-dark and dark-on-light print. Only image-derived candidate regions are drawn; a blank image produces none. The old large fixed outline is hidden.
- Light outlines mean **text found**, with no invented LOT/MFG/EXP value. Typed colours require an OCR reading matched to the current patch or an explicit employee selection. Local normalized patch comparisons help carry selections between adjacent frames; this is not a guaranteed perspective/object tracker.
- Whole-frame motion no longer prevents all aiming/recognition progress. Fresh candidate locations refresh while the phone moves. OCR results are associated with current text patches instead of painting an old reading at an unrelated location. Failed associations stay unclassified; semantic tracks expire. Shutter capture still discards live values, carries only selected areas/types and reruns OCR on the still image for review.
- Reader loading shows progress separately. A failed reader does not disable detection, long press, capture, manual review or ×. Both the vision and OCR workers and all timers are stopped on close/background/capture.
- Month/year printed as `03 2026` / `02 2028` is supported without inventing a day. Adjacent OCR words are joined into the correct rectangle. Three-number spaced dates retain day precision or explicit day/month ambiguity.
- The lot-review screen calls attention to confusable O/0 and I/1. Characters are never automatically substituted. The reported label produced OCR proposal `VWJO6A`; the employee must verify the ambiguous character against the package.
- A hold begun before the first vision result stores its position in normalized screen coordinates, so an analysis-resolution change cannot move the selected area away from the finger. Three focused startup checks cover the transition from width 970 to 485.
- Changed entry/module URLs are versioned with `aim=3`, so a refreshed preview does not mix the old camera module with the new detector/parser.

No stock/backend/admin/schema/auth/CORS/audience/credentials or installed APK change is included. Existing count quantity, corrections, source-selection, receipt and offline contracts remain unchanged. All camera pixels/templates are transient device memory. No image, video or whole-frame OCR text is uploaded, published or included in the review bundle. The original video and camera-only replay frames remain local temporary test inputs.

## Evidence and practical limits

- **37** parser/date/crop/domain/barcode unit checks.
- **17** live synthetic-camera browser regressions with real Tesseract, including automatic typed boxes, running video while choosing, explicit type choice, capture/review and × cleanup.
- **27** previous captured-photo/count regressions, including the earlier dot-matrix photo and 360/390/430 widths.
- **12** recorded-failure checks replayed in Chromium. OCR script loading was deliberately blocked. Three different hand-held label positions each had all three printed-value regions located using independently hand-annotated rectangles; a blank negative control drew no boxes. First three-line detection measured about **204ms in cloud replay**, not on a phone. Long-press selection and × worked with OCR unavailable. Re-enabled real OCR on a held captured frame read manufacture `2026-03` and expiry `2028-02`; the lot retained an O/0 ambiguity and stayed subject to review.

The replay contains existing camera/UI overlays from the screen recording; assertions target the actual printed label, not those overlays. Numeric evidence is retained, and no real-footage screenshot is published. Physical iPhone/WebKit and Android latency, initialization, focus and thermal/battery behavior still need device acceptance. The detector can also find background text and can miss small/blurred/strongly tilted print; long press remains the fallback. This is not CamScanner-grade perspective tracking and is not evidence of production inventory integration.

Artifacts: `/workspace/artifacts/scpda-aiming-fix-2026-11-13/`. `RECORDED-RESULTS.json` records the actual replay scope and ambiguous lot proposal. Hosted smoke results, when present, are separate from local replay and physical-device acceptance.
