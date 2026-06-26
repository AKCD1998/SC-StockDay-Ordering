# Codex Prompt — Product Taxonomy Scaffold (Phase 2)

## Progress Update — 2026-06-26

Status from the implementation run against `PaaSRTSM-project`:

- `WP-01` completed.
  Migration added in `PaaSRTSM-project/migrations/041_add_sku_product_type.sql`.
  Repo-specific adjustment: this workspace uses `public.skus.company_code`, not `sku_code`, so the service backfill was implemented with `company_code LIKE 'IS-%'`.
- `WP-02` completed.
  Shared classifier logic implemented in `PaaSRTSM-project/apps/admin-api/src/taxonomy/backfill.js`.
  CLI wrapper implemented in `PaaSRTSM-project/scripts/backfill_sku_product_type.js`.
- `WP-03` completed.
  API routes implemented in `PaaSRTSM-project/apps/admin-api/src/routes/taxonomy.js` and mounted from `apps/admin-api/src/server.js`.
  Tests added in `PaaSRTSM-project/tests/taxonomy.test.js`.
- `WP-04` completed with one UI adaptation.
  The current `admin-web` is route/page based, not an existing tabbed enrichment panel, so the taxonomy UI was implemented as a dedicated page at `/taxonomy` instead of a nested tab.
  Files added/updated under `PaaSRTSM-project/apps/admin-web/src/`:
  `pages/ProductTaxonomyPage.jsx`, `lib/api.js`, `App.jsx`, `components/AppShell.jsx`, `styles.css`.

Verification captured during the run:

- `npm run db:migrate`:
  `Applying migrations\041_add_sku_product_type.sql`
  `Database migrations completed.`
- `node scripts/backfill_sku_product_type.js`:

```text
[DRY RUN] Product type backfill
Rules evaluated: 6757 SKUs
  -> supplement      1621  (confirmed ingredient category)
  -> supplement         2  (category_name regex)
  -> unclassified    5134  (no rule matched)
Run with --commit to apply.
```

- `node --test tests/taxonomy.test.js`:
  6 tests passed, 0 failed.
- `npm test` after taxonomy work:
  233 passed, 1 failed.
  The remaining failure is pre-existing and unrelated to taxonomy:
  `tests/cipdata_routes.test.js`
  `cipdata kpis endpoint computes counts from Supabase content-range totals`
  expected `5`, actual `18`.
- `apps/admin-web npm run build`:
  build passed successfully.

Copy everything below the line into Codex as the task instruction.

---

You are implementing the **Product Type Taxonomy scaffold** for the SC StockDay system.

## Read first (do not skip)

1. Read `SC-StockDay-Ordering/docs/INGREDIENT_PRODUCT_CLASSIFICATION_RULES.md` in full.
   It defines the 3-dimension product model (ingredient / product_type / shelf category),
   the 9 allowed product_type values, the enrichment_status values, and the rules for
   which product types require ingredient seeding. This is the source of truth.

2. Before editing any file mentioned below, re-open and re-read it to confirm the file
   still matches what is described here.

## Ground truth about this workspace (verify, don't assume)

- **Deployed backend:** `PaaSRTSM-project/apps/admin-api` (Express, CommonJS, `pg`).
  Mount new routes in `apps/admin-api/src/server.js`. Do NOT touch `SC-StockDay-Ordering/server` — it is legacy.
- **Migrations:** add new files in `PaaSRTSM-project/migrations/` — **next number is `041`**.
  Run with `npm run db:migrate` in `PaaSRTSM-project`.
- **Tests:** `node --test` + `supertest` in `PaaSRTSM-project/tests/`; run with `npm test`.
- **Auth pattern:** `requireAuth` / `requireRole('admin')` / `requireCsrf` from `apps/admin-api/src/auth/middleware.js`. Mutations need CSRF.
- **DB schemas in use:** `public`, `knowledge`, `core`, `ordering`, `ada`, `analytics`, `ingest`, `admin`.
  The `public.skus` table is the main product table.
- **Ingredient layer** lives in `knowledge.*` (tables: `knowledge.ingredients`,
  `knowledge.ingredient_synonyms`, `knowledge.ingredient_category_rules`,
  `knowledge.product_ingredients`). Migration: `031_add_ingredient_knowledge_layer.sql`.
- **Admin UI for enrichment** is `PaaSRTSM-project/apps/admin-web` (modular React/Vite,
  has AppShell, RoleGuard, etc.). This is where the taxonomy tab goes — NOT `SC-StockDay-Ordering/apps/admin-web`.

## Current state of `public.skus` (relevant columns)

From existing migrations:
```
product_kind       text         -- 'device_or_general_goods', etc. (set by AdaPos sync)
enrichment_status  text         -- CHECK IN ('missing','partial','verified') DEFAULT 'missing'
enrichment_notes   text
category_name      text
supplier_code      text
generic_name       text
strength_text      text
form               text
route              text
```

The `enrichment_status` CHECK constraint currently allows only `('missing','partial','verified')`.
Migration 041 must extend it to also allow `'not_applicable'` (see taxonomy doc).

---

## Work Packages

Implement one work package at a time, in order. Run tests after each WP and paste results.

---

### WP-01 — Migration 041: add `product_type` column + extend `enrichment_status`

File: `PaaSRTSM-project/migrations/041_add_sku_product_type.sql`

```sql
BEGIN;

-- 1. Add product_type column
ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS product_type text
  CHECK (product_type IN (
    'drug','supplement','herb','antiseptic',
    'cosmeceutical','cosmetic','device','service','other'
  ));

CREATE INDEX IF NOT EXISTS idx_skus_product_type ON public.skus (product_type);

-- 2. Extend enrichment_status CHECK to include 'not_applicable'
--    The existing inline constraint was created in migration 004.
--    Drop by auto-generated name then re-add with the wider set.
ALTER TABLE public.skus
  DROP CONSTRAINT IF EXISTS skus_enrichment_status_check;

ALTER TABLE public.skus
  ADD CONSTRAINT skus_enrichment_status_check
  CHECK (enrichment_status IN ('missing','partial','verified','not_applicable'));

-- 3. Auto-classify obvious non-ingredient products (safe backfill).
--    product_kind='device_or_general_goods' → device + not_applicable.
UPDATE public.skus
  SET product_type = 'device',
      enrichment_status = 'not_applicable'
  WHERE product_kind = 'device_or_general_goods'
    AND product_type IS NULL;

-- 4. Service codes (AdaPos convention: IS-xxxxxxx prefix)
UPDATE public.skus
  SET product_type = 'service',
      enrichment_status = 'not_applicable'
  WHERE sku_code LIKE 'IS-%'
    AND product_type IS NULL;

COMMIT;
```

**Down note:** `ALTER TABLE public.skus DROP COLUMN product_type; ALTER TABLE public.skus DROP CONSTRAINT skus_enrichment_status_check; ALTER TABLE public.skus ADD CONSTRAINT skus_enrichment_status_check CHECK (enrichment_status IN ('missing','partial','verified'));`

After writing the file, run `npm run db:migrate` and confirm it completes without error.

---

### WP-02 — Backfill script (pattern-based auto-classifier)

File: `PaaSRTSM-project/scripts/backfill_sku_product_type.js`

This script reads all SKUs without a `product_type` and applies heuristic rules to propose
a classification. It must be **dry-run by default** and commit only when `--commit` is passed.

**Rules to implement (in priority order):**

| Condition | Set `product_type` |
|---|---|
| `product_kind = 'device_or_general_goods'` | `'device'` + `enrichment_status = 'not_applicable'` |
| `sku_code LIKE 'IS-%'` | `'service'` + `enrichment_status = 'not_applicable'` |
| SKU has a confirmed ingredient in `knowledge.product_ingredients` (status `'confirmed'`) where ingredient's `preferred_category` maps to a drug/herb/supplement category | infer from ingredient data (see rule table below) |
| `category_name` regex matches herbal patterns (e.g. `/สมุนไพร|herbal|herb/i`) | `'herb'` |
| `category_name` regex matches antiseptic patterns (e.g. `/แอลกอฮอล์|disinfect|antiseptic|น้ำยาฆ่าเชื้อ/i`) | `'antiseptic'` |
| `category_name` regex matches supplement patterns (e.g. `/วิตามิน|supplement|อาหารเสริม/i`) | `'supplement'` |
| `category_name` regex matches drug patterns (e.g. `/ยา|pharma|drug/i`) | `'drug'` |
| `category_name` regex matches cosmetic patterns (e.g. `/เครื่องสำอาง|cosmetic|beauty/i`) | `'cosmetic'` |

**Script structure:**
```js
// scripts/backfill_sku_product_type.js
// Usage: node scripts/backfill_sku_product_type.js [--commit] [--limit N]
// Default: dry-run, shows proposed changes without writing
const commit = process.argv.includes('--commit');
// ... connect to DB, run rules, print summary, optionally UPDATE
```

Output format (dry-run):
```
[DRY RUN] Product type backfill
Rules evaluated: 4502 SKUs
  → device           482  (product_kind = device_or_general_goods)
  → service           37  (sku_code LIKE IS-%)
  → herb              96  (category_name regex)
  → supplement       143  (category_name regex)
  → drug             218  (category_name regex)
  → cosmetic          59  (category_name regex)
  → unclassified    3467  (no rule matched)
Run with --commit to apply.
```

After writing the script, run it in dry-run mode and paste the output.

---

### WP-03 — API routes

Mount all routes at `apps/admin-api/src/routes/taxonomy.js` and register in `server.js`.

#### `GET /api/products/taxonomy/stats`
Auth: `requireAuth` (admin + staff).  
Returns a breakdown for the admin dashboard.

```json
{
  "total": 4502,
  "classified": 1035,
  "unclassified": 3467,
  "by_product_type": {
    "drug": 218,
    "supplement": 143,
    "herb": 96,
    "antiseptic": 41,
    "cosmeceutical": 12,
    "cosmetic": 59,
    "device": 482,
    "service": 37,
    "other": 0
  },
  "enrichment_status": {
    "missing": 3400,
    "partial": 55,
    "verified": 12,
    "not_applicable": 519
  }
}
```

SQL: `SELECT product_type, COUNT(*) FROM public.skus GROUP BY product_type`.

#### `GET /api/products/taxonomy`
Auth: `requireAuth`.  
Query params: `product_type`, `enrichment_status`, `q` (name search), `limit` (default 50), `offset` (default 0).  
Returns paginated SKU list with columns: `sku_code, name, product_kind, product_type, enrichment_status, category_name`.

#### `PATCH /api/products/:sku_code/taxonomy`
Auth: `requireAuth` + `requireRole('admin')` + `requireCsrf`.  
Body: `{ product_type: 'drug' }` (must be one of the 9 allowed values or `null`).  
Updates `public.skus` and writes an `admin.audit_logs` row.  

Validation: reject unknown `product_type` values; never accept free-text.

#### `POST /api/products/taxonomy/bulk-classify`
Auth: `requireAuth` + `requireRole('admin')` + `requireCsrf`.  
Body: `{ commit: false }` — when `commit: false` returns a preview (same format as dry-run output); when `commit: true` applies the rules and returns counts.  
This runs the same logic as the WP-02 script but as a transactional SQL UPDATE inside the API.

**Route file skeleton:**
```js
// apps/admin-api/src/routes/taxonomy.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, requireCsrf } = require('../auth/middleware');

// ... implement each endpoint

module.exports = router;
```

**Registration in server.js:**
```js
const taxonomyRoutes = require('./routes/taxonomy');
app.use('/api/products/taxonomy', taxonomyRoutes);
// Note: PATCH /api/products/:sku_code/taxonomy needs to be mounted differently
// to avoid conflict — see existing route patterns in server.js
```

Write tests in `PaaSRTSM-project/tests/taxonomy.test.js` covering:
- `GET /api/products/taxonomy/stats` returns the expected shape
- `PATCH /api/products/:sku_code/taxonomy` with valid value → 200
- `PATCH /api/products/:sku_code/taxonomy` with invalid value → 400
- `POST /api/products/taxonomy/bulk-classify` with `{ commit: false }` → preview only
- CSRF protection on mutations

Run `npm test` and paste results.

---

### WP-04 — Admin UI: Taxonomy Tab

Location: `PaaSRTSM-project/apps/admin-web/src/`

Add a **"ประเภทสินค้า"** (Product Type) tab to the existing product enrichment panel.
Follow the existing tab/panel structure (look at how the Ingredients or Enrichment tabs are built).

**Tab contents:**

1. **Stats row** (top): call `GET /api/products/taxonomy/stats`, display counts as colored chips:
   ```
   ยา (drug): 218 | สมุนไพร (herb): 96 | อาหารเสริม: 143 | ... | ยังไม่ระบุ: 3467
   ```

2. **Filter bar:** dropdowns for `product_type` (all 9 values + "ยังไม่ระบุ") and `enrichment_status`.
   Text search (`q`) for product name.

3. **Table:** columns `รหัส (sku_code)`, `ชื่อสินค้า (name)`, `หมวด AdaPos (category_name)`,
   `product_kind`, `ประเภท (product_type)`, `enrichment_status`.

4. **Inline edit:** `product_type` column is a `<select>` dropdown (9 options + blank).
   On change, call `PATCH /api/products/:sku_code/taxonomy` with CSRF header.
   Show toast on success/error using existing ToastViewport.

5. **"Auto-classify" button:** calls `POST /api/products/taxonomy/bulk-classify` with
   `{ commit: false }` first, shows a confirmation modal (use existing ConfirmModal) with
   the preview counts, then on confirm re-calls with `{ commit: true }` and refreshes stats.

**No new shared components needed** — use the existing `ConfirmModal`, `ToastViewport`,
`LoadingOverlay`, `AppShell`, and `RoleGuard` already in `admin-web/src/`.

---

## Rules of engagement

- **One WP at a time, in order.** Do not start WP-02 until WP-01 migration is confirmed applied.
- **Run tests after WP-01 and WP-03.** Paste the full test output. Never claim a WP is done
  without running tests.
- **No unrelated refactors.** Preserve existing CommonJS require / `pg` client patterns in the backend.
- **Migrations are additive.** Wrapped in `BEGIN/COMMIT`, use `IF NOT EXISTS` / `IF EXISTS`
  everywhere. Never drop columns or rename columns.
- **Never write free-text into `product_type`.** Only the 9 enum values or NULL.
- **Auth on every endpoint.** Mutations require CSRF. Admin-only mutations use `requireRole('admin')`.
- **Audit log on mutations.** Write to `admin.audit_logs` on every `PATCH` that changes `product_type`
  (follow the existing `auditLog(...)` helper pattern in the codebase).
- **Do not touch `SC-StockDay-Ordering/server/`.** That path is legacy. All backend changes go
  in `PaaSRTSM-project/`.
