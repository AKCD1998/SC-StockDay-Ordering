# SCPDA — yellow-region-first label OCR (web preview v5)

The phone recording at 19:12 ICT showed yellow date regions, followed by a photo result that kept only LOT. The old recognizer still passed the entire visible camera/photo image to Tesseract before trying guided regions. This update changes recognition order in the existing project and private preview.

## Implemented

- The same contrast detector used for yellow outlines plans at most six crops from its ten displayed candidates. Nearby rows of the same polarity can share a compact crop. Context includes small printed LOT/MFG/EXP labels; row position never determines a date's role.
- Detection runs again on the exact image sampled after reader initialization, so screen coordinates from a moving camera are not blindly reused. OCR sees padded crops, with small text enlarged, white-on-dark print inverted, and isolated rows enhanced. Crop-local OCR coordinates map back to the original image.
- Both live aiming and photo recognition use crops first. There is no whole-frame pass when candidate regions exist. Live recognition waits for candidates; a photo with no candidates may use one explicit whole-image fallback. User-assigned regions are read first. Unlabelled dates remain unassigned until staff select their role.
- Printed year/month forms such as `2025. 10` and `2028. 10` retain month precision, without an invented day. O/0 and I/1 are never substituted in lot strings.
- Existing same-image reading retention, short burst selection, correction/review and quantity handling remain. A Tesseract cancellation race discovered during regression checks is fixed: closing rejects new OCR jobs, lets the admitted decode/read settle, then releases the worker. Camera and dialog close immediately; late results fail the sequence guard.
- Processing stays in the browser using the existing self-hosted Tesseract assets. Images/crops and complete OCR text are not uploaded or stored. Diagnostic crop coordinates stay in memory and clear on close. Metadata interaction is `yellow-region-first-v5`.

## Actual evidence

Reports are in `/workspace/artifacts/scpda-yellow-roi-2026-11-13/`.

- `roi/ROI-BROWSER-RESULTS.json`: 11 checks using real Tesseract. A camera-only still at 1.6 s of the latest user screen recording produced MFG `2025-10`, EXP `2028-10`, and the LOT proposal `1CEO247`. Two detected-text crops were read, with no whole-image OCR. Their value rectangles mapped to the printed black panel. The lot's O/0 ambiguity remains visible for employee review; this is not proof that the proposed lot spelling is correct. The report contains coordinates/values and an input hash, not the image or video.
- The same check exercised a generated reordered EXP/LOT/MFG layout, missing printed labels, explicit manual region classification, application into the existing draft with quantity 7 unchanged, and × cleanup. No image or stock uploads occurred.
- `unit-tests.tap`: coordinate mapping, candidate planning, date formats, cancellation, and existing parser/capture logic.
- `live/LIVE-BROWSER-RESULTS.json`: generated live camera stream with real OCR; long press, explicit roles, scene change, shutter/review/apply, quantity preservation and close.
- `best-frame/BEST-FRAME-RESULTS.json` and `cold-retention/COLD-RETENTION-RESULTS.json`: real OCR on generated streams; simulated blur/delayed initialization. The cached conflict and repeat failure are explicitly injected tests.
- `HOSTED-RESULTS.json`: same private Site deployment and actual hosted OCR path, checked separately after publication.

The initial ROI draft missed labels on dark packaging and altered a generated lot reading after unnecessary enlargement. Cropping/context, sparse-text segmentation and size-aware preprocessing were revised before the final checks. A generated-label check also exposed solid carton-edge artifacts after inversion; only solid padding columns are removed from the temporary OCR input. These were development failures, not successful device acceptance.

## Delivery and limits

Same Site: https://sc-stockday-pda-lab.scgroup1989-it.chatgpt.site . The existing owner-only audience and navy/yellow/white app remain. This changes the browser preview; it does not rebuild or update the installed APK.

The screen-recorded still and generated streams are cloud Chromium evidence, not a new physical iPhone/Android camera test, autofocus/motion guarantee, or phone performance measurement. Missing/blurred characters and varied layouts can still need manual correction. No claim of CamScanner-equivalent tracking is made.

Count transport remains the existing synthetic, browser-local preview. No production stock backend, Ada data, auth, schema, CORS, APK or other project was changed. Existing live integration gates remain pending as documented elsewhere.
