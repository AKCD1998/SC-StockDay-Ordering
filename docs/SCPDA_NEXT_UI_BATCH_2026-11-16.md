# SCPDA next UI batch — update1 prepared, APK intentionally deferred

User instruction16 November: simplify the confusing **ส่งคิว / อัปเดต** control. Normal history should have no queue button/panel. When queued counts remain unsent, show a pale-red frame listing the medicines and a red button with white text. The user has another update to supply and explicitly asked to build the combined app only afterwards.

## Update1

- Received counts, including those still awaiting admin review, show no queue frame/action.
- Unconfirmed queued counts show **รายการค้างส่ง (N)** with medicine name, round and quantity/unit. Button is **ส่งรายการค้าง**, a single-purpose label replacing the combined send/refresh wording. The frame disappears after valid receipts are stored.
- Offline/session-unavailable state retains the list and explains why retry is disabled. A row requiring a reason or correction exposes the appropriate existing action; blindly retrying it is not presented as a fix.
- Historical records deliberately saved local-only retain their existing explicit individual-send confirmation. Opening history does not silently queue them. Branch/operator separation and receipt-first idempotent transport are unchanged.
- Review-status refresh is automatic on history entry, foreground/focus return and every30seconds while history is visible/online. No new count POST for received rows; no background/scanner refresh. Automatic redraw preserves expanded lot details/focus and does not navigate/scroll history back to the top.

## Verification and release boundary

8 source-browser/real-IndexedDB behavior checks passed with synthetic transport, including normal invisibility, queued-only medicine list, red/white action, offline retention, one-receipt retry/hide, foreground admin-status update, reason-required handling and account separation;320/390/496px no-overflow layouts checked.35 existing app-model/identity/stock/price/recent checks passed. Browser errors empty. Source syntax/diff checks passed.

Existing APK/native/live fixture harnesses were updated to use foreground status refresh instead of a nonexistent normal-state button. They have not been rerun against a newly compiled APK because the user explicitly deferred that build. No version bump, Android/APK build, website/backend deploy, production data change or replacement Drive delivery occurred. Current installed/delivered build remains **0.6.2-test.12**, release source `c74eaeb2ccd5de25e698a6e5912715c10d44954d`.

Continue in `codex/scpda-next-ui-batch`, based on R12. Add the user's second update to the same batch, then build/test/deliver once the combined requested changes are ready. Keep001/005 support, signing key, storage identity, receipts, count/price tabs and paused OCR/Preorder boundaries.
