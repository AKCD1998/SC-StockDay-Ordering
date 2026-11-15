# R11 — authorized01001 count intake and branch001 stock-check catalog

- Owner/author: existing PDA workstream;15 November2026, deployment verification10:29UTC /17:29Bangkok.
- Canonical ledger base read: `8b7ddb8`; own unique docs writer worktree retained. Preorder owner/worktree/source unchanged.
- User explicitly requested real PDA count submission, initially01001/branch001, including available manufacture/expiry dates; website **ข้อมูลสินค้า → เช็คสินค้า**, newest PDA update first, categories เภสัช/ปกติ/สามัญ, visible only branch001/admin. This is concrete authorization for the precise pilot formerly pending in R5–R9. The earlier separate request changed01001's password, not its username. No secret is stored here.

## Implemented and live

Backend password PR[62](https://github.com/AKCD1998/PaaSRTSM-project/pull/62) merged `f5e372e1eda4af0a5e48d02f3ca2569f12ad93fb`: legacy numeric4 or exact visible ASCII6–64, existing wire field `pin`, device proof/branch scope/lockout unchanged. Only01001 credential rotated; hash match and unchanged peer records verified in memory. Old01001 sessions invalidate; fresh login is required. Device enrollment/signing material untouched.

Backend count PR[52](https://github.com/AKCD1998/PaaSRTSM-project/pull/52), head `135f226e7c97fef22c3fb1b6c87d560a1a7bd501`, merged **`38d8a4a1a2143276fcf02f9083bdb964fbdc23dd`**. Render **`dep-dbsodt5bedkc73cdi3c0`**, live10:19:45UTC. Actual provider configuration is auto-deploy after checks, despite the old AGENTS manual-deploy statement; no duplicate deploy was triggered after the merge. Predeploy applied **`migrations/083_add_scpda_lot_observations.sql`**, recorded10:19:08UTC in Linux slash style. Read-only query confirmed four evidence tables, immutable update/delete triggers, received-sort index, zero production observations/lots/reviews/projections. The actual catalog query compiled/read7104 products. No synthetic count/session/device was created in production.

Backend flags **`FEATURE_SCPDA_COUNTS_001=true`**, **`SCPDA_COUNT_OPERATORS_001=01001`**. Missing allowlist fails closed. Old valid nonadmitted reader/counter tokens fail before collection. Separate count-purpose device authorization remains required. Site/browser enrollment flag stays absent/default-off; no general CORS/invitation change.

Web PR[92](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/92), head `737569eaa5b952f9e06e17137bd291acdf1367fa`, merged **`9ed98328e0ed84beb805446711fc4dcbb2001e0a`** after backend schema/routes were ready. Render **`dep-dbsohrtckfvc73drjcq0`**, live10:27:09UTC; **`VITE_FEATURE_SCPDA_LOTS_001=true`**. Public deployed bundle includes the new route/menu; unauthenticated API returns401. Backend/admin health200 and count-admission GET401 confirm enabled guards, not a genuine authenticated phone submission.

Website [#/stock-check](https://sc-stockday-ordering.onrender.com/#/stock-check) uses existing cookie auth. Only admin or original-and-effective branch001 may read; branch004 cannot enter via override/direct link. Full catalog is ordered by latest server-received observation per product, unsubmitted last; search/category filters and paging; auto-refresh30seconds while visible. Quantity0 differs from no report. Lot quantities, optional MFG/EXP, observation/receipt time, operator/round/scope and receipt are visible. Admin alone can review. No event/recount summation.

## Android and evidence

App **0.6.1-test.11**, versionCode11, branch `codex/pda-count-send-r11`, source **`1d2c29569fd72435fd58315bdb1bca7f225040eb`**. Same package/signing certificate/storage origin as previous deliveries; install over old app, do not uninstall/clear data. Password-compatible input is included; R9 safe icon/recent shortcuts/price tab/info popup/refresh retained. Preorder stays pending its accepted mobile adapter; label OCR stays paused.

17 backend policy/default-off/auth checks,15 actual isolated HTTP/PostgreSQL count/catalog checks,61 focused web checks passed.10 exact APK-assets → shipping host-JVM → real isolated HTTP/PostgreSQL → actual admin React assertions passed: lot/date-preserving receipt, reasoned old lot, CSRF review returning to phone, offline cold reopen, lost reply recovered without duplicate POST, immutable correction and second-client history.5 actual full-web/cookie-auth/API/Postgres checks read the same APK receipt/quantity/dates, filters and admin/001/004 authorization. CI and production builds passed for the merged backend/web heads. No Android hardware, physical camera/Keystore or first genuine production-count acceptance is claimed.

Production direct PostgreSQL rollback dry-run could not connect (ECONNREFUSED before execution); exact migration passed isolated PostgreSQL, then the authorized Render predeploy applied it. Actual tables/migration/index/triggers were verified read-only afterwards. No TLS weakening or manual bulk migration replay.

## Delivery and remaining boundaries

Uploaded to existing **เภสัชอู๋ / pdaAppProject**; all three names/sizes/parent IDs verified, sharing unchanged, remote checksums unavailable:

- [APK](https://drive.google.com/file/d/1mOPGhFTpXWlInv-FmY0ZuQCJwUgKH2_l/view?usp=drivesdk),2995013bytes, SHA256 **`e358f44fbad5d6d7c288baff8bbdceaaea72b8a6fa7df0f4e2dd0f7868870035`**.
- [ZIP](https://drive.google.com/file/d/1V1jp72iFJlJPAllhKuiNBdIkC8SYK2yi/view?usp=drivesdk),2739668bytes, SHA256 `58bb11195a566c1345c9bff539504f69991521c178b186e8a0af685bbe99dcc5`.
- [Instructions](https://drive.google.com/file/d/1m5kQnni1JNIa4YUZ6a_A6Q0xuAdXjKXp/view?usp=drivesdk),6384bytes.

ZIP contains only APK, instructions and sanitized identity/deployment/test/hash evidence. No credentials, registration files, signing/device keys, provider secrets or test fixtures. Original executor artifacts `/workspace/artifacts/scpda-count-send-2026-11-15/`; these paths are not assumed available on another machine.

Next acceptance is the user's actual phone: update, fresh-login01001, count a genuine product/lot/date, **ยืนยันและส่ง**, confirm **รับแล้ว + Receipt**, and compare that receipt on the website. Old local-only records require an explicit send by the original operator; activation never silently uploads them. Receipt and review are distinct from adopting a current balance or official Ada adjustment. Full Sync/current-stock source, Ada writes, other branches/operators, Preorder/HQ/CRM/LLM integrations and new device enrollment remain outside this rollout. The peer's receipt-sync/FIFO proposals through event013 are read and preserved, not accepted as mobile API or implemented here.

At10:35UTC only this task's four local fixture/Vite processes and two label-verified PostgreSQL containers were stopped; container/data state retained, unrelated listeners and production services untouched. App/backend/web release worktrees were clean. Cleanup receipt is `CLEANUP.json` in the original artifact directory.
