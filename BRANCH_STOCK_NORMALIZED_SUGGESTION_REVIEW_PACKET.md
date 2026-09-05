# Branch Stock normalized recommendation suggestion — review packet

Date: 2026-09-05
Status: **READY FOR TECH LEAD RE-REVIEW**
Scope: local-only candidate; no commit, push, PR, merge, deploy, environment change, database access, or branch-PC change.

## 1. Candidate baselines

### SC Admin Web

- Worktree: `C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering.branch-stock-normalized-suggestion-2026-09-05`
- Branch: `candidate/branch-stock-normalized-suggestion-2026-09-05`
- Baseline: `origin/main@4faf5ea5efaf3db31f470132f689daaa7a747f79`

### PaaS admin-api

- Worktree: `C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project.branch-stock-normalized-suggestion-2026-09-05`
- Branch: `candidate/branch-stock-normalized-suggestion-2026-09-05`
- Baseline: `origin/main@488778c726aec3de280f741797f35a9db80e1ebb`

Existing `PaaSRTSM-wp3-*`, comparator, Transfer-acceptance, and canonical dirty worktrees were not edited.

## 2. Proven current flow

- Production UI owner: SC static Admin Web.
- The real request modal is rendered by exported `BranchStockPanel` in `apps/admin-web/src/App.jsx`.
- Opening a product row calls the existing `openRequestDialogForRow`; submitting calls the existing `handleAddDraftItem`.
- Current stock for the table/modal comes from the existing `/api/branch-stock` flow.
- The existing PaaS detail API is `GET /api/admin/stock-recommendations/:branchCode/:productCode` in `apps/admin-api/src/routes/stock-recommendations.js` and `apps/admin-api/src/services/stockRecommendations.js`.
- The detail response already carries `meta.reader.servedReader` and the complete computed recommendation row.
- Initial review found that this endpoint previously computed the whole live branch catalog before selecting one product. The PaaS candidate now supplies a private `exactProductCode` execution option from `getStockRecommendationDetail` only. List, summary, by-product, refresh, and shadow callers do not supply it and retain their existing catalog behavior.

## 3. UX implementation

`BranchStockRecommendationSuggestion` is mounted below the existing branch/procurement rows in the request modal.

- It makes one authenticated exact-product detail request for the modal's branch and product.
- It renders nothing while loading.
- It renders nothing unless the backend explicitly returns `meta.reader.servedReader === "normalized"`.
- A normalized response displays a Thai “คำแนะนำ” card with the action, backend reason, current stock, demand used by the engine, target days/quantity, shortage, donor plan, incoming allocation, days cover, transfer quantity, purchase quantity, and recognized flags.
- Details are collapsed by default under “ดูรายละเอียดที่ใช้คำนวณ”.
- A 503/error displays the short non-blocking message “คำแนะนำยังไม่พร้อม แต่ยังขอสินค้าได้ตามปกติ”.
- Closing/changing the modal aborts the outstanding request.
- It explicitly says that the data is advisory and the system will not enter a request quantity automatically.

## 4. Contract and calculation provenance

The frontend does not compute recommendation numbers. It only formats fields supplied by the PaaS response.

| UI meaning | Existing API field | Backend provenance |
| --- | --- | --- |
| Current stock | `currentStock` | selected stock reader; normalized for an approved canary |
| Sales in 30/90 days | `soldQty30d`, `soldQty90d` | backend sales aggregation |
| Average daily sales | `adu30`, `adu90` | backend divides 30-day sales by 30 and 90-day sales by 90 |
| Demand used | `adjustedAdu` | backend starts with 90-day ADU and applies its existing 30-vs-90 trend rule |
| Target | `targetDays`, `targetQty` | backend policy and `adjustedAdu * targetDays` |
| Incoming stock | `incomingPoAllocationQty` | backend allocation of incoming PO by pre-allocation shortage/demand |
| Effective stock/cover | `effectiveStock`, `effectiveDaysCover` | backend current plus allocated incoming and its days-cover result |
| Shortage | `shortageQty` | backend gap between effective stock and target |
| Transfer/purchase | `transferPlanQty`, `purchaseQty`, `donors`, `action`, `reason` | backend donor surplus plan and remainder |
| Warnings | `flags` | existing backend flags; only known user-facing flags are rendered |

The UI does not display `sourceSnapshot`, generation IDs, digests, or unknown internal flags.

## 5. Advisory-only boundary

No existing request state, quantity input, plus/minus behavior, validation, draft shape, submit handler, or order rule was changed. Recommendation quantities are never copied into request inputs. The component receives no setter or submit callback.

## 6. Outside-canary behavior

The component must receive `servedReader=normalized` before it creates any visible recommendation UI. A normal legacy response, including `selectionStatus=outside_canary`, returns `null`, preserving the previous modal for branches outside the normalized canary.

## 7. Unavailable behavior

Recommendation loading is independent of the request controls. A failed or 503 response changes only the advisory area; the existing quantity inputs and submit flow remain usable.

## 8. Privacy and security

- Uses the existing credentialed `apiFetch`; no token or new client secret is introduced.
- Does not log the request or response payload.
- Does not render normalized generation IDs, snapshot IDs, digests, request IDs, or backend failure internals.
- Dynamic branch/product path segments are URL-encoded.
- Unknown backend flags are not echoed to users.

## 9. Files changed

### SC

- `apps/admin-web/src/App.jsx`
- `apps/admin-web/src/styles.css`
- `apps/admin-web/src/BranchStockRecommendationSuggestion.jsx` (new)
- `apps/admin-web/src/BranchStockRecommendationSuggestion.test.jsx` (new)
- `apps/admin-web/src/BranchStockRecommendationModal.test.jsx` (new)
- `BRANCH_STOCK_NORMALIZED_SUGGESTION_REVIEW_PACKET.md` (new)

### PaaS

- `apps/admin-api/src/services/stockRecommendations.js`
- `tests/stock_recommendations_api.test.js` (contract, exact-bound, and adversarial coverage)

There is no migration or response-contract change. The PaaS runtime change is limited to exact-product execution for the existing detail endpoint.

## 9.1 Exact-product execution boundary

For `GET /api/admin/stock-recommendations/:branchCode/:productCode` only:

- the path product identity bypasses fuzzy/catalog candidate discovery;
- normalized and legacy stock loaders receive a one-element product-code array;
- raw sales SQL adds `sl.product_code = $5::text` and receives the exact path code;
- incoming aggregation receives the same one-element code array;
- catalog incoming discovery is not executed;
- exact-product raw-sales calls bypass the module-global cache and run the narrowly bounded SQL directly, so modal traffic cannot create retained per-SKU cache keys;
- catalog callers retain the original cache key and 15-minute caching behavior unchanged;
- stock and sales are still loaded across all active branches, preserving donor discovery;
- normalized generation eligibility and the repeatable-read/read-only snapshot wrapper remain unchanged.

A query-string `search` value is never promoted into this bound. The exact path product wins even when an adversarial fuzzy search names another product.

## 10. Test evidence

### SC focused

Command:

```powershell
npm run test -w apps/admin-web -- --run src/BranchStockRecommendationSuggestion.test.jsx src/BranchStockRecommendationModal.test.jsx src/BranchStockPanel.test.jsx
```

Result: **25/25 passed** across 3 files after the final display-value assertions.

### SC full Admin Web

Command:

```powershell
npm run test -w apps/admin-web
```

Result: **63/63 passed** across 10 files after the final display-value assertions.

### SC production build

Command:

```powershell
npm run build -w apps/admin-web
```

Result: **passed**, 89 modules transformed. Vite emitted the existing large-chunk warning; it did not block the build.

### PaaS focused contract/regression

Command:

```powershell
node --test tests/stock_recommendation_readers.test.js tests/stock_recommendations_api.test.js tests/stock_recommendations_by_product_integration.test.js
```

Result: **42 passed, 4 real-PostgreSQL tests skipped, 0 failed**. The targeted API file is **17/17 passed**.

After the exact-product fix, the same results were reproduced:

- targeted PaaS API: **17/17 passed**;
- focused PaaS reader/API/by-product suite: **42 passed, 4 real-PostgreSQL skips, 0 failed**.

## 11. Regression assertions

Tests cover:

- normalized recommendation shown with exact contract values;
- internal snapshot/generation values and unknown flags hidden;
- legacy reader hidden;
- loading silent and existing controls enabled;
- 503 note is non-blocking;
- normalized recommendation never fills any request quantity;
- blank submit still uses the existing validation;
- manual quantity entry still submits after a recommendation error;
- PaaS normalized canary detail returns the expected current stock, sales, ADU, target, shortage, transfer, purchase, action, and donor plan.
- Catalog mode first admits unrelated `P2/P3`, then detail mode proves it executes a separate exact sales query and loads only `P1`.
- Exact detail does not call normalized catalog candidate discovery or broad incoming-product discovery.
- Both legacy and normalized detail tests assert one-element stock, sales, and incoming parameters.
- Donor branch `003` remains visible for requested product `P1`, proving the product bound does not collapse active-branch donor scope.
- A conflicting `?search=P2` does not widen or replace path product `P1`.
- Two consecutive exact-product detail calls execute two separate exact-product sales queries, proving no per-SKU cache entry is retained.
- Two consecutive catalog list calls execute one catalog sales query, preserving the existing catalog-cache behavior.

## 12. Rollout gate

No rollout is authorized by this packet. A later release should require:

1. Tech Lead approval of the UI and wording.
2. Green CI for both repositories as applicable.
3. Confirmation that branch 004 remains an approved normalized canary.
4. A staffed branch-004 modal check, because normal user traffic has not yet exercised this path.

## 13. Rollback

Rollback is an SC UI revert of the new component import/mount/styles/files. No environment rollback, database rollback, migration rollback, or recommendation-engine rollback is needed because this candidate changes none of them.

## 14. Risks and open decisions

- Each modal open makes one live detail call. The original candidate incorrectly described this call as product-bounded before the backend enforced that property. The PaaS fix now bounds candidate admission, stock, raw sales, and incoming data to the path product while retaining all active donor branches. Production latency/load should still be observed during the staffed canary.
- The modal's existing stock table and the recommendation response can be captured at slightly different times. The card is advisory and does not assert that its stock value must equal the older table render.
- The 503/error notice is intentionally non-blocking. A backend outage cannot prove reader selection, so the UI shows no calculated values.
- This slice does not snapshot recommendation metadata into the eventual stock-request record. That would change the request contract/audit meaning and requires separate authorization.
- No authenticated production screenshot was taken; DOM integration tests and the production build are the available UI evidence.
- Local `npm ci` reports pre-existing dependency audit findings; no package or lock file is changed.

## 15. Final verification

- Focused SC tests: **25 pass / 0 fail**
- SC full Admin Web tests: **63 pass / 0 fail**
- SC production build: **pass**
- PaaS targeted API: **17 pass / 0 fail**
- PaaS focused: **42 pass / 4 real-PostgreSQL skip / 0 fail**
- PaaS exact-product re-review rerun: **17/17 targeted; 42 pass / 4 skip / 0 fail focused**
- PaaS syntax check: **pass**
- `git diff --check`: **pass in both repositories**; only Windows LF-to-CRLF notices were printed
- `.env`, package manifest, and lockfile changes: **0**
- High-risk secret-pattern matches in the candidate diffs/files: **0**
- Staged files: **0**

## 16. Mutation declaration

No commit, push, PR, merge, deploy, Render/environment/config change, migration, database read/write, branch-PC access, Scheduled Task change, or central-ledger edit was performed.
