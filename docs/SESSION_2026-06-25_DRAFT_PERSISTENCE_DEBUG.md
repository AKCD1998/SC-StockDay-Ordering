# Session 2026-06-25 — Server-Side Draft Cart: Full Debug Chronicle

**Status:** Resolved and deployed.
**Outcome:** Inter-branch stock request draft cart now survives hard refresh across any browser/device for the same user+branch.

---

## Background

The inter-branch stock request workflow stores a "draft cart" in React state (`requestDraftItems`). The goal this session was to make this draft **survive a page hard-refresh** by persisting it server-side in `ordering.stock_request_drafts` and loading it back on hydration.

The feature was already wired up in the React frontend (autosave with 1.5 s debounce, hydration on login). The backend tables and routes had also been written. But on the live site (`sc-stockday-ordering.onrender.com`), every hard refresh wiped the cart.

---

## Root Causes Found (in order of discovery)

### 1. Missing DB migrations (discovered first)

Migrations `039_add_ada_branch_prices.sql` and `040_add_stock_request_drafts.sql` had never been applied to the production Render Postgres.

- `ordering.stock_request_drafts` and `ordering.stock_request_draft_lines` tables did not exist
- Any PUT or GET to draft routes returned 500 silently
- **Fix:** `npm run db:migrate` from `PaaSRTSM-project/` — applied both migrations

---

### 2. `FEATURE_STOCK_REQUESTS` flag silently 404-ing all draft routes

Even after migrations, the cart still disappeared. The draft routes (`GET`, `PUT`, `DELETE /api/stock-request-draft/me`) had a `requireFeatureEnabled` middleware guard:

```js
const requireFeatureEnabled = (req, res, next) => {
  if (!config.featureStockRequests) {
    return res.status(404).json({ error: "Not found", ... });
  }
  return next();
};
```

`FEATURE_STOCK_REQUESTS` env var was never set in the Render production environment → defaulted to `false` → every autosave PUT and hydration GET returned **404 silently**. The cart appeared to save locally (React state) but nothing ever reached the database.

The stock-requests **submit** route had no such guard — which is why submitting worked but drafts didn't, masking the asymmetry.

**Fix:** Removed `requireFeatureEnabled` from all three draft routes (also removed `config` from deps destructuring).
**Commit:** `9227f22` — PaaSRTSM-project

---

### 3. Added `draftHydrating` loading indicator + `draftSaveStatus` diagnostic

Added two UI improvements during debugging:

**`draftHydrating`** — shows "กำลังโหลดร่างคำขอ..." while the GET hydration is in-flight so users know the cart hasn't disappeared, it's loading.

**`draftSaveStatus`** — visible save result shown below the "สร้างคำขอสินค้า" header:
- "กำลังบันทึกร่าง..." while PUT is in-flight
- "บันทึกร่างแล้ว" (green) on success
- "บันทึกไม่สำเร็จ: [status] [body]" (red) on any error

Both props are drilled: `App → StockRequestsPanel → MyRequestsTab`.
**Commit:** `d6abef1` — SC-StockDay-Ordering

The status indicator immediately revealed that even after the feature flag fix, the PUT was returning **500**.

---

### 4. Wrong diagnosis: SRQD-PENDING unique constraint (red herring)

Initial diagnosis: the two-step INSERT used `'SRQD-PENDING'` as a temporary `draft_public_id` placeholder. Since this column has a `UNIQUE` constraint, two concurrent inserts (e.g. two browser tabs open) would collide → 500.

Changed to a CTE-based single-statement insert (commit `16b1825`), then to a `crypto.randomBytes` temp ID to avoid the CTE's production compatibility risk (commit `bea241e`). Tests passed 13/13 throughout, but **the 500 continued in production**.

This was the wrong root cause.

---

### 5. PaaSRTSM-project has no `render.yaml` — requires Manual Deploy

Discovered that `PaaSRTSM-project` has **no `render.yaml`**. The Render web service is configured entirely via the Render dashboard.

Unlike `SC-StockDay-Ordering` (which has `render.yaml` with `autoDeploy: true`), pushing to GitHub for PaaSRTSM does **not** trigger a redeploy automatically.

**Every push to PaaSRTSM-project requires a Manual Deploy from the Render dashboard.**

---

### 6. Real root cause: `owner_user_id bigint` rejecting a string (22P02)

After triggering a Manual Deploy of commit `bea241e`, the Render logs revealed:

```
code: '22P02'
where: "unnamed portal parameter $2 = '...'"
```

PostgreSQL error `22P02` = **invalid_text_representation** — a value that cannot be cast to the target column type.

`$2` in the INSERT is `auth.userId`. This comes from `decoded.sub` in the JWT, which is the user's login username string (e.g. `"staff003"`). But `owner_user_id` in the schema is `bigint NULL` — it was designed for a future numeric database user ID, which the system has never had.

Postgres cannot cast `"staff003"` → `bigint` → 500 on every single PUT, from day one (but previously hidden behind the feature flag 404).

The string identity is already captured by `owner_username TEXT`, so `owner_user_id` carries no additional information in our current auth model.

**Fix:** Pass `null` for `owner_user_id`.

```js
// Before
[tempPublicId, auth.userId || null, ownerUsername, branchCode, payload.note]

// After
[tempPublicId, null, ownerUsername, branchCode, payload.note]
```

**Commit:** `a57ff98` — PaaSRTSM-project + Manual Deploy → **working**

---

## All commits this session

| Commit | Repo | Change |
|--------|------|--------|
| `9227f22` | PaaSRTSM-project | Remove `requireFeatureEnabled` gate from draft routes |
| `d6abef1` | SC-StockDay-Ordering | Add `draftHydrating` indicator + `draftSaveStatus` diagnostic |
| `16b1825` | PaaSRTSM-project | CTE-based insert (later superseded) |
| `a5c0b24` | PaaSRTSM-project | Update test mock for CTE signature |
| `bea241e` | PaaSRTSM-project | Replace CTE with `crypto.randomBytes` temp ID |
| `a57ff98` | PaaSRTSM-project | Pass `null` for `owner_user_id` — the actual fix |

---

## Confirmed working state

Draft captured at end of session (status = ACTIVE, not yet submitted):

```
สร้างคำขอสินค้า — สาขาผู้ขอ: สาขา 003 · 1 รายการ
  ส่งคำขอสินค้าไปที่ : สาขา 001
    สามัญ ฮีรูสการ์โพสแอคเน่ 5 กรัม (630010003) — 1 หลอด
```

Cart survives hard refresh. Autosave fires 1.5 s after any change. Hydration loads on page mount. Status indicator shows "บันทึกร่างแล้ว" (green) on success.

---

## Key lessons

- **PaaSRTSM always needs Manual Deploy on Render** — no render.yaml, no auto-deploy. The workaround is to set up auto-deploy from GitHub in the Render dashboard Settings tab.
- **`featureStockRequests` gate was asymmetric** — submit worked, drafts didn't, making the 404 invisible.
- **`owner_user_id bigint` is a dead column** — our auth system uses string usernames, never numeric IDs. The column should eventually be migrated to `text` or dropped.
- **Add visible error indicators early** — the `draftSaveStatus` red text immediately pinpointed the 500 after two sessions of guessing.
