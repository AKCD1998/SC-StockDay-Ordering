# SCPDA R14 — date separators while typing

Follow-up to the user’s late batch-scope reply after R13 delivery: insert `/` while typing and explicitly label manufacturing/expiry dates as day/month/Gregorian year.

- Both count-form and calendar-dialog fields insert separators after the second/fourth digits. Numeric keyboard, empty/partial drafts, invalid-date validation and existing ISO/null submission remain.
- Form labels are **วันที่ผลิต (วว/ดด/ค.ศ.)** and **วันหมดอายุ (วว/ดด/ค.ศ.)**; the dialog also labels its Gregorian format. Existing Buddhist-year acceptance/conversion at confirmation remains.
- Input handling preserves caret position; backspace/delete crosses inserted separators, selected-month replacement preserves the remaining digits, and ISO/separated/Thai-digit pastes keep their meaning. Composition waits for completed input.
-12 focused date/count model tests and13 actual source-form/dialog browser checks passed, including keystrokes without blur, deletion, month replacement, date paste, multiple lots, unknown values and320/390/496px layouts. Browser errors empty. The initial editing test exposed premature padding during selected-month replacement; padding is now confined to paste/full replacement and the check passes.
- Version prepared as0.6.4-test.14/versionCode14. Retains the R13 pending-only queue panel and the existing package/signing/storage identities. No backend/web/permissions/data change or new production API test is required by the formatting-only change. R13 exact-APK/Java/isolated-DB/admin-web evidence remains scoped to that prior release. This release’s physical phone acceptance is pending.

Build/delivery proofs are recorded in the canonical PDA ledger after verification. Continue source on `codex/scpda-next-ui-batch`; preserve the separate Preorder owner and paused OCR.
