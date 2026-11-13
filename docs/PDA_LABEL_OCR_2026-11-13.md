# Captured-label OCR preview — 13 November 2026

Scope: the existing Sites phone preview and reusable source modules in this PDA project. The deployed baseline is the static v6 preview; saved v7 real-browser candidate remains separate and unactivated. No backend/admin deployment, schema, auth, audience, credentials, official stock write or APK change is part of this update.

## Employee flow

Open a product count, enter the actual quantity, then tap **ถ่ายฉลาก · LOT / MFG / EXP**. The rear-camera view is larger than the barcode view. Capture a photo or select one, then OCR proposes rectangles on that captured image. This is captured-photo OCR, not continuous live-video text tracking.

Tap an existing rectangle to cycle **green LOT → red MFG → blue EXP → green LOT**. **จิ้มช่วยหา** lets a tap create a nearby text region and runs OCR on it, with temporary dot-matrix stroke connection/upscaling/straightening. It is guidance, not a guarantee of recognition. Review the proposed values and explicitly select what to apply. Existing differing values are unselected by default. Quantity is never read from weight, pack size or label text. Missing lot/date fields may stay absent. Blank quantity is still invalid; a count of zero requires an entered zero.

The **×** always closes the label screen, stops its stream/worker, clears its image/text memory, and returns to the unchanged count form. Unapplied suggestions are discarded. Applying selected fields keeps quantity and the count/correction workflow. Later manual label edits clear the extraction metadata so it cannot misleadingly describe changed values.

## Date and evidence semantics

The date controls support CE day/month/year or month/year. `2026-02` stays exactly that value; no first/last day is substituted into a record. Calendar bounds are only used for ordering and expiry warnings. Ambiguous day/month formats require a choice. Two-digit years and implausible/calendar-uncertain printed years are not guessed. Future manufacture and definitely reversed manufacture/expiry dates are rejected before apply. An expired label may still be counted.

Confirmed label values and short selected-field OCR snippets can accompany the browser-local demo count. No image or whole-photo OCR text is stored or uploaded. Tesseract.js 6.0.1, core 6.0.0 and eng/tha fast models are self-hosted, pinned and licensed in `vendor/tesseract/VENDOR.json`; no paid OCR/LLM service is used. First use downloads the OCR assets. No physical-phone speed/accuracy claim has been made.

**No production month-date contract has been changed.** The old integrated fixture mode keeps day-only controls and hides this photo feature. The R4 installed APK, real browser auth/count adapter, immutable server payloads/receipts, offline queue and backend SQL date columns are unchanged. Moving these new month-precision fields into that real transport needs an accepted precision-preserving contract; do not coerce a month to a day, drop it or claim server sync.

## Evidence

- 31 passing parser/date/domain/barcode checks. Includes leading-zero lot values, varying anchors, month precision, invalid/ambiguous dates, no quantity from weight, source-selection and existing scanner behavior.
- 29 Chromium touch/browser acceptance checks on the actual static output. Widths 360/390/430; label stage about 515px versus barcode stage 244px at 390×844; ×, stream cleanup, confirmation, existing-value protection, local save/reload, quantity preservation and absent labels verified.
- The supplied busy-background dot-matrix photo was tested locally without uploading it. Full-photo OCR found no fields. Touch-guided OCR read lot `202308` and expiry `2026-02`; manufacture was left unconfirmed after an uncertain year reading and explicitly entered as `2023-02` during review. Earlier coordinate tests sometimes read it correctly; they do not establish reliable full-photo recognition.
- A separate **clearly synthetic sharp label** was really OCRed and produced all three visible automatic rectangles and exact month values. Its screenshot is synthetic evidence, not a claim about automatic recognition of the supplied photo.
- Network capture: OCR assets requested only from the same local origin; no photo/count upload. Existing font requests remain separate.
- Cloud Chromium/fake camera acceptance only. Physical Android camera/lighting/performance and installed APK acceptance remain pending.

Artifacts: `/workspace/artifacts/scpda-label-ocr-2026-11-13/BROWSER-RESULTS.json`, `unit-tests.tap`, `AUTOMATIC-BOXES-SYNTHETIC.png`, `DATE-FIELDS.png`. The user photo is intentionally absent from source, Site and review package.
