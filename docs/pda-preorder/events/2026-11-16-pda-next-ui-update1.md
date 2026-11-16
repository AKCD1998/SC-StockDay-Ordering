# Next mobile UI batch — update1 prepared; build explicitly deferred

Owner: existing PDA workstream,16 November2026. Canonical ledger base `b775ee0662c398984d6cd5658780e1e704b4e9cd`.

User found **ส่งคิว / อัปเดต** confusing after a successful count. They requested no queue panel/button in normal use; a pale-red frame should appear only with unsent queued medicines, with a red button/white text. User explicitly said another update is coming and asked **not to build a new app yet; combine the updates in one later build**.

## Prepared source, not shipped

- Branch **`codex/scpda-next-ui-batch`**, commit **`ec2227b7d89e12ed4999eb38b21d3c0aeb4d0dbd`**, based on delivered R12 `c74eaeb2ccd5de25e698a6e5912715c10d44954d`.
- Original executor worktree `/workspace/reviews/scpda-next-ui-batch-20261116`; other source/worktrees untouched. Remote push verified. No app PR merge, runtime deployment, version bump, APK build or replacement Drive upload.
- Pending-only panel lists medicine, round and quantity/unit; red/white action is **ส่งรายการค้าง**, a single-purpose replacement for the combined label. Received observations, including awaiting-review ones, do not count as a queue. Frame disappears after a valid receipt.
- Intentional historical local-only records retain their existing individual explicit-send action, not silent bulk upload. Offline/session-unavailable and reason/correction-required cases retain records and show relevant instructions/actions; blind retry is not offered as a fix for missing information.
- History status refresh is automatic on opening/foreground and every30seconds only while visible/online. It does not resubmit accepted counts, reset expanded lot details, or navigate/scroll the user to the top. Transport, receipt idempotency, storage schema and001/005 actor boundaries remain unchanged.

## Verification

8 browser behavior checks passed using actual source UI and real IndexedDB with explicitly synthetic transport: normal absence, local-only preservation, queued-only medicines/quantity and red/white action, offline retention, one-receipt retry/frame disappearance, foreground review update without extra POST, required-reason action and account separation.320/390/496px layouts have no horizontal overflow.35 existing model/identity/stock/price/recent tests passed; browser errors empty; syntax/diff checks passed. Updated old native/live harness source to use foreground refresh when normal retry button is absent; no new-APK/live roundtrip is claimed for this pending UI.

Original executor evidence `/workspace/artifacts/scpda-pending-ui-2026-11-16/`, including `browser/PENDING-UI-CHECK.json`, pending/received screenshots and regression log. Test browser/temp HTTP server closed. Current delivered APK remains **0.6.2-test.12** with its existing Drive links and R12 source; the installed app has not acquired these UI changes yet.

Next action: receive the user's second update, implement it in the same pending branch, then build/test/deliver the combined requested release. Do not overwrite R12 release identity or substitute the older001-only mobile baseline. No Preorder/ADA/CRM/server permission changes are part of update1.

## New dated physical-trial evidence

Before this change request the user supplied an Android005 screenshot showing a received count. A bounded read-only query matched its receipt and branch005/operator01005, received16 November10:16:10 Bangkok, status `received` (awaiting review). This confirms the first user-reported physical Android upload reached production; it does not independently audit the quantity, certify all phone camera/torch/offline behavior, adopt a current balance or adjust Ada. Product/quantity/private device material is not copied into this engineering ledger. No review action or production write was performed by this verification.
