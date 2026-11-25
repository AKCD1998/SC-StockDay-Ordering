# R25 — reviewed count resubmissions and three full versions

User explicitly selected **editing a previously submitted count page on the phone**, not reimporting an Excel catalog. They requested exact old→new row changes, a scroll-to-end confirmation button that turns green, Cancel beside it, and retention limited to three versions. We announced and implemented **three full versions including current**; a fourth submission retains4/3/2 rather than prohibiting another correction.

## Delivered source and artifacts

- Mobile `9bbf38bb1aebbf74df6b61940c57f16af4d01875`, branch `codex/scpda-change-review-r25`, continuing deliveredR24. New review module/CSS is included in the existing Android asset builder; do not merge the entire mobile branch into webmain.
- Backend [PR78](https://github.com/AKCD1998/PaaSRTSM-project/pull/78), source `f30480ac519769d0c2a1236382d58d43e7bdef9f`, merged `be89e8e8963ae6b96a7a3562c63ec8549ccd8b08`. Migration `095_scpda_annual_submission_history.sql` is recorded on live Linux with slash-style migration history.
- PWA [PR118](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/118), source `47b8198b730bf9b81ff4eab46656d48f883ce8f7`, merged `b9154e8ebd49c5ab4f9b0cabb9e84592f29f2467`.
- Android0.9.3-test.25/code25,3056453bytes; APK SHA256 `5db464fcd19714f5c062bc598344e86f7985088a6964a254fc53edbd65e0a7c8`. Same package `th.co.scgroup1989.scpda.preview` and original signer SHA256 `3d11b6af0d2f472632e313d6b94fab745cc4af8c360dfe356be7bf627847c20a`.
- AppCenter release `a8263edc-9e41-4bd3-b2e2-b8fcacd4b1b9` published; stored identity read back. [Private Drive APK](https://drive.google.com/file/d/1Fu9nslLy5P3WRYFeUO8l0_DMKAWlqnr-/view) and [guide](https://drive.google.com/file/d/1VA8AHOVh-EPuZaImLrV49oh3AKOkMaik/view) are in the existing private `เภสัชอู๋/pdaAppProject` folder; no sharing change.
- Matching PWA sourceAPK hash above; entry SHA256 `24418dabaffbb0e3352acd302e84f9e13326f74bd3bee9f000c56cd2816c2be4`.

## Behavior

Own submitted pages can be opened from receipts or the own-page picker, then แก้ไขและส่งอีกครั้ง. An amendment is a separate local draft; accepted counts remain unchanged until a reviewed final correction commits. บันทึกพักงาน stores that amendment on its original installation, and กลับไปดูฉบับที่ส่งแล้ว preserves it for later resumption. This is explicit in the UI; it is not a claim that an unsubmitted correction has already reached the server.

The server compares the proposal against the latest accepted page, including per-location quantities, explicit0 versus unfilled, location labels and equal-total moves. The UI shows changed product rows, exact fields, old→new values and a summary of added/changed/cleared points. Confirmation stays disabled/gray until the end is reached, then turns green; short lists visible in full need no artificial scrolling. Cancel leaves accepted data unchanged. Confirm opens the existing password dialog; that confirmation value was preserved, not copied into source or storage.

A signed preview binds actor/device/credential, event/page, current receipt/revision and a digest of normalized proposed counts. Changed data, expired reviews or a newer accepted version require review again. Scroll gating is a UI reading aid, not server proof that a person read each line. Unchanged data creates no submission. Only the page owner may read full history or amend; manager/team views gain submission-number metadata without exposing another actor's count details.

`annualAmendPreview`, `annualAmend`, `annualHistory` are explicit native/browser operations inside the existing005 annual scope. Initial submissions, drafts, ordinary count/price work and ProductSession rights remain separate. R21–R24 retain prior submitted-page selection behavior; onlyR25 explicitly opens submitted pages as editable corrections.

## Three-version retention and retries

Migration095 captures legacy and new final receipts via a trigger, with a short table lock protecting the backfill/trigger boundary. It stores full counts only for the latest three receipts per page, including current. Older rows keep small receipt/version/actor/time/digest metadata with `counts=NULL`, so an identical lost-response retry remains identifiable even after its old full snapshot was pruned. The existing60-day changed-row audit remains a separate small change journal; it is not another full sheet snapshot.

No-change previews and canceled reviews create no versions. Successful corrections replace the latest accepted quantities, keep prior retained snapshots unchanged, and do not add another page or official stock movement. Explicit confirmation/stale-review rejection keeps the local counts editable; uncertain replies preserve the original operation UUID/body. Passwords remain outside durable outboxes. Acknowledged initial/amendment cache copies are retired; history snapshots are fetched on demand rather than cached as an unlimited local archive.

## Rollout and verification

The old parser allowed only four explicit compatible versions. R25 raises the bounded limit to eight; source/migration deployed first while retaining the four-entry live policy. Only after the new parser was live did configuration add25. Preferred25:004 accepts21/22/23/24/25 and QR21/22/23/24/25;005 accepts21/22/23/24/25 and QR22/23/24/25. Published-version checks remain mandatory, not an open-ended minimum-version bypass.

PR/main backendCI and PWA CI passed.3 amendment tests with real HTTP/PostgreSQL cover exact changes, no-change/preview-only behavior, password/device/owner checks, stale/altered proposal rejection, four corrections, pruning to three full snapshots, migration replay and receipt replay after pruning. Existing annual/layout2, daily23 and mobile142 regressions passed. Full signed native build and original certificate checks passed.

Final signed-APK UI with real Java sessions and isolatedHTTP/PostgreSQL exercised20 changed rows plus a new zero-valued fourth location, cancel, scroll gating/green color, existing password, four submissions and only versions4/3/2. Browser-host cryptographic QR/selfie/auth flow also exercised cancellation with unchanged accepted counts, no-change rejection, successful amendment/history and an offline correction draft surviving reload. No browser page errors. Actual physical Android/iPhone acceptance is not claimed; catalog reads in the broader profile fixture use a small synthetic catalog after real reader authorization.

Live read-only migration check found095, original event74pages/3035items and no synthetic production submission history. One real page already contains draft counts; it was retained. No production test selfie/login/count/assignment was created, no event reset, no credential/confirmation rotation, no Ada/stock/product write and no Local canaryTEST.

Evidence is under the current owner's `/workspace/artifacts/scpda-annual-amend-r25-20261125`: TAP files, UI-VERIFICATION, BROWSER-AMEND-VERIFICATION, REVIEW-TOP/END and HISTORY-THREE screenshots, build identity, live/configuration/deployment reports. Executor paths are not shared across chats; use Git and privateDrive checkpoints.

Install over Android; iPhone settings → อัปเดตเว็บแอป. Preserve R23 branch profiles/startup and the current R25 source when integrating Product/Preorder. Do not roll an older four-version parser back under a five-entry policy, delete history/accepted counts, or substitute a signer.

