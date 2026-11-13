# Label OCR paused at user request — 13 November 2026

The user requested hiding label OCR and using manual lot/manufacture/expiry entry, then stopping work for today.

Removed the label-photo button, its event binding and the OCR module import from the existing PDA app and same private Site. Opening the count form no longer loads the label recognizer or exposes its camera/file flow. Manual lot, date, quantity and unknown-field controls remain. Barcode scanning is separate and retained. Historical saved label evidence is preserved; no data migration or backend/auth change is involved.

OCR implementation and earlier evidence remain in source for a future, separately requested revisit. This note supersedes earlier claims that OCR is enabled in the current preview. No additional OCR development is planned in this turn. The installed APK is not rebuilt or silently changed by publishing the browser preview.

Verification is bounded to manual field entry/save/reload, absent OCR controls/module requests and the existing barcode camera/close flow. Reports and exact preview archive: `/workspace/artifacts/scpda-ocr-paused-2026-11-13/`. All test counts are synthetic browser-local data; they are not official inventory writes or physical-device acceptance.
