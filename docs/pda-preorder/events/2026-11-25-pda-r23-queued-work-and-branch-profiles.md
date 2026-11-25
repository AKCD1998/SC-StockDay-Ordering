# R23 — queued005 pages, saved drafts and visiting branch profiles

Verified live25November2026,17:26Bangkok. User authorized ordinary destination-branch functions for visiting staff after the established primary QR, same-public-IP check, daily login/selfie and Bangkok-midnight expiry. Keep home-branch work and connection; no extra event-only restriction was requested. This does not authorize new branches, ProductSession/CEO grants or Ada writes.

## Delivered source and artifacts

- Android source `818a13e94ddd3c4ab953e1bafaa3eabddeb20ea3`, branch `codex/scpda-annual005-app-r23`, continuing deliveredR22. Fetch this branch for native/mobile work; do not merge its whole history into webmain.
- Backend [PR76](https://github.com/AKCD1998/PaaSRTSM-project/pull/76), source `d0a58dbe9b2010febc32f05aecad1c071b42f496`, merged main `3600efc46925ed2accf669b20ad8cae65d72bf18`. Migration `094_queue_scpda_annual_pages.sql` is recorded on production.
- PWA [PR115](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/115), source `c9463c2255b2203686d8507fb59442902a898458`, merged main `bffc7f8546c43660b38ace1ef51f6233b0328d00`. It exports the exact final signedAPK; no mock transport shipped.
- Android `0.9.1-test.23`/code23, package `th.co.scgroup1989.scpda.preview`,3052357bytes. APK SHA256 `73a9c164a6ee8d4cb05aa815861f81ffd0a438084947c01db6d0b3386aa63f9f`. Original signer SHA256 `3d11b6af0d2f472632e313d6b94fab745cc4af8c360dfe356be7bf627847c20a` retained; install over the existing app.
- [SC App Center](https://sc-stockday-ordering.onrender.com/#/app-center) release `9a3d21cb-3efb-44ba-8666-481acc0c3623` published, stored identity verified read-only.
- [Drive APK](https://drive.google.com/file/d/1hrInnmqVy3cQjBX4XfPKQNi9F5oB5UkH/view) and [Thai guide](https://drive.google.com/file/d/1jZvfubqINVFZluiVv49edNBUAXS_TX1P/view) verified in the established private `เภสัชอู๋/pdaAppProject` folder. Sharing unchanged.
- PWA `/scpda/BUILD.json` code23 identifies the APK above; live entry SHA256 `3f76dd47d959e04c371f9d0e7fa848560b8b860e5a13a29a6bc0e9ba09b9acdb` matches the export. Build-stage `productionActivated:false` is not the runtime admission flag; live policy is verified below.

## User-visible behavior and invariants

Primary may queue several pages for the same paired companion, including03005, or assign01005 to itself. Primary uses มอบหมายและติดตาม / ใบนับของฉัน; owned-page selection never mixes drafts. OlderR22 clients receive stable FIFO work. Shared team summaries expose assignment/progress and optional self-entered names, including primary self-work. Other actors' item/count details remain denied. Display names are not verified employee identities or authorization.

บันทึกพักงาน allows an incomplete page, preserves explicit zero versus uncounted, waits for in-flight writes and shows local-only versus durable server acknowledgement/time. Final submission still requires a complete page. Per-page outboxes, selected-page cache and pending restoration are scoped by branch/operator/event; revision/UUID/idempotency continue to prevent silent overwrite. Session expiry does not delete local drafts or server work. For next-day QR **reuse the same machine/operator code, e.g.03005**; เพิ่มเครื่องใหม่ creates a different actor and does not transfer old assignments. Offline-only data still requires its original installation until sent; do not uninstall/clear storage.

Android andPWA keep separate public admission profiles and non-bearer daily markers per branch/operator. No passwords or reader/count JWTs are persisted. Switching clears current capabilities and reauthorizes selected context, retaining the installation key/device ID and other branches' drafts/count book. Existing001 Android admission survives a temporary005 visit;001 QR was not activated. Destination ordinary functions follow existing server admission/scopes, including004 front/Shopee separation. Same-public-IP remains an acknowledged approximation of sameWi-Fi; daily reset and90-day private Drive selfie retention remain unchanged.

Startup uses a loading overlay instead of flashing login while checking saved daily state; valid state resumes main, expired/revoked state needs login, offline status offers retry. New Android companion admission follows the existing actual QR/password/selfie/device/count-access protocol.

## Production verification and retained data

Latest API deploy `dep-dc3bc9ajnfac73a96rag` is live on the backend merge; web deploy `dep-dc3bc95g1s2s73edbll0` is live on the web merge. PR/mainCI passed. Health200, annual unauthenticated401, livePWA bytes and preferred23 policy verified; no application-error logs in the checked postactivation window.

Version policy:004 accepts21/22/23 and QR21/22/23;005 accepts21/22/23 and QR22/23. Existing R21/R22 work remains admitted. Annual005 flag stays true. Nine unrelated credential/invitation/revocation/allowlist/branch-setting values were compared with the private baseline and preserved; all seven static actors remain unchanged. Dynamic companions remain database-owned.

Existing event `6d467f05-6be8-4da2-8c30-8c83705fa2c8`,005/warehouse001 inside005, still has74pages/3035items. Read-only postrelease check found03005 still ownsสามัญหน้า1, revision0, zero count rows and not submitted. No event reimport/reset, synthetic production counts, new staff selfies or QA assignments were performed. Migration adds queue/durable-save metadata and optional names, not official stock movements. No Ada product/master/receipt/stock write or Local writer activation.

## Tests and limits

- 2 isolated annual PostgreSQL tests cover queued-page selection/FIFO, self-count, cross-actor denial, participant/audit names, safe093/094 replay and complete3035-item export.
- 23 daily/API/PostgreSQL tests include79of80 saved items surviving midnight denial and renewed-day restoration; cross-branch sessions stay separate.
- 140 mobile regressions; full signedAndroid build/native compile passed.
- Actual IndexedDB profile/reload checks preserve the original nonextractable installation key and independent markers with no passwords/bearers stored.
- Final exact-APK UI plus shipping Java sessions and isolated realHTTP/PostgreSQL checked native001→005 QR/password/selfie, multi-page assignment, primary self-count, two offline drafts/reopen/sync without login flash,001 history retained and005 resumed. No browser page errors.
- The fixture catalog used a small synthetic read adapter after real reader authorization; this proves UI/profile/count retention, not a new production catalog acceptance result. Physical Android/iPhone installation and employee acceptance are not claimed.

Evidence lives in the current owner's `/workspace/artifacts/scpda-annual005-r23-20261125` as RELEASE-MANIFEST/LIVE-VERIFICATION/DEPLOYMENTS/config verification, TAP reports, UI-VERIFICATION, BROWSER-PROFILES and screenshots. Executor paths are not shared across chats; public source checkpoints and privateDrive delivery above are the durable handoff.

## Product/Preorder integration boundary

Local must rebase its separate product panel/native bridge onto deliveredR23 and preserve startup gating, per-profile storage, count/price/AppCenter and004 scopes. On profile switch or logout, clear and renegotiate **ProductSession and Preorder capabilities separately**; existing reader/count proof never grants product creation/CEO approval. Self-entered participant names do not prove Ada identity. No Local product procedure, canaryTEST, grants or writer deployment were started by this release.

Rollback can disable annual005 without deleting event/work; retain published compatibility and profiles. Do not rotate credentials, delete counts or revert to an APK signed by another key.

