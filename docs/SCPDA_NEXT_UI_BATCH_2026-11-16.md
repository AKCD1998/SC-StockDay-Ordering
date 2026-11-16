# SCPDA combined UI batch — pending counts and manual dates

User instruction16 November: simplify the confusing **ส่งคิว / อัปเดต** control. Normal history should have no queue button/panel. When queued counts remain unsent, show a pale-red frame listing the medicines and a red button with white text. The user has another update to supply and explicitly asked to build the combined app only afterwards.

## Update1

- Received counts, including those still awaiting admin review, show no queue frame/action.
- Unconfirmed queued counts show **รายการค้างส่ง (N)** with medicine name, round and quantity/unit. Button is **ส่งรายการค้าง**, a single-purpose label replacing the combined send/refresh wording. The frame disappears after valid receipts are stored.
- Offline/session-unavailable state retains the list and explains why retry is disabled. A row requiring a reason or correction exposes the appropriate existing action; blindly retrying it is not presented as a fix.
- Historical records deliberately saved local-only retain their existing explicit individual-send confirmation. Opening history does not silently queue them. Branch/operator separation and receipt-first idempotent transport are unchanged.
- Review-status refresh is automatic on history entry, foreground/focus return and every30seconds while history is visible/online. No new count POST for received rows; no background/scanner refresh. Automatic redraw preserves expanded lot details/focus and does not navigate/scroll history back to the top.

## Update2 — numeric and hierarchical dates

The second requested update arrived: manufacturing/expiry dates may be3/5/10 years apart, so monthly swiping must not be the only input method.

- Both date fields accept8-digit DDMMYYYY or separated day/month/four-digit year; valid input formats as DD/MM/YYYY. Thai digits and Buddhist years2400–2999 are accepted and converted to Gregorian. Explicit ISO input and the existing API date strings remain Gregorian.
- The calendar button opens an app-owned dialog with direct numeric input, a12-month grid and a12-year grid. Tap the month/year heading to change scope; arrows move whole years or12-year pages. Selecting a year then month leads directly to the day grid.
- An empty field does not silently choose today. Impossible dates are rejected. Moving29February to a non-leap year asks for a real day rather than silently substituting another date. Incomplete label dates are still recorded as unknown rather than inventing a day.
- Cancel/close discards tentative dialog edits; the unknown checkbox disables the matching input/calendar. Each lot targets its own fields. Drafts preserve incomplete edits, while review/submission keeps the existing ISO/null payload contract, branch/operator identity and counts.
- Below480px date groups stack so a full date fits.320/390/496px day/year views were checked without horizontal overflow.

## Verification and release boundary

8 source-browser/real-IndexedDB behavior checks passed with synthetic transport, including normal invisibility, queued-only medicine list, red/white action, offline retention, one-receipt retry/hide, foreground admin-status update, reason-required handling and account separation;320/390/496px no-overflow layouts checked.35 existing app-model/identity/stock/price/recent checks passed. Browser errors empty. Source syntax/diff checks passed.

Update2:38 model/identity/stock/price/recent checks passed, including direct/Thai/Buddhist dates, invalid/partial inputs, leap centuries, untouched drafts and ISO/null API payloads.10 source-browser checks passed for typing, empty dates, year/month/day navigation,10-year jump, cancel, invalid-day handling, unknown flags, multiple lots and narrow layouts. The8 pending-panel browser checks passed again after date integration. No browser errors.

The user initially deferred the build to include one more update. That second update is now included in this combined batch. Manifest is prepared for **0.6.3-test.13 / versionCode13** with the same package and signing key. The exact-APK/native fixture harness now exercises numeric manufacture entry and direct year/month/day expiry selection, in addition to the existing005 count/receipt/admin review path. The combined APK was built once from `65324c4bef39659c3bdcf71eb7391e34e925166e`. Archive integrity, alignment, safe-zone icon and matching v2/v3 signing certificate passed.9 exact-APK → shipping Java → isolated HTTP/PostgreSQL/admin-web checks passed, including numeric/date-picker entry, ISO date receipt persistence, normal-state queue-button absence,005 identity/isolation and admin review returning to the phone. The first harness attempt used the wrong Vite working directory and stopped at a404; rerunning against the actual admin-web root with a fresh synthetic QA device passed. This is host software-device evidence, not physical Android hardware acceptance. Drive delivery is recorded separately in the canonical PDA ledger. No website/backend deploy, account/permission change or production count was performed for these UI changes.

Continue in `codex/scpda-next-ui-batch`, based on R12. Build/test/deliver the combined requested changes once. Keep001/005 support, signing key, storage identity, receipts, count/price tabs and paused OCR/Preorder boundaries.
