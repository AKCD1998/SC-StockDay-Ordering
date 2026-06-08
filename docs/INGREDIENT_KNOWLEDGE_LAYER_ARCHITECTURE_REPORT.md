# Ingredient Knowledge Layer Architecture Report

Date: 2026-06-08

## Scope

This report reviews the current SC StockDay product categorization and review queue architecture and proposes a minimal additive path toward a supervised ingredient learning workflow.

No implementation changes are included in this pass.

## Architecture Map

### Repositories

| Repository | Role | Notes |
| --- | --- | --- |
| `SC-StockDay-Ordering` | Admin frontend currently deployed for SC StockDay ordering/review workflows | Vite React admin app calls the shared backend through `VITE_API_BASE_URL`. |
| `PaaSRTSM-project` | Shared backend service receiving production API calls | Express/CommonJS backend with PostgreSQL and SQL migrations. |

### Frontend Framework

`SC-StockDay-Ordering/apps/admin-web` is a Vite React application.

Relevant files:

- `SC-StockDay-Ordering/apps/admin-web/src/App.jsx`
- `SC-StockDay-Ordering/apps/admin-web/src/styles.css`

The review queue UI is implemented inside `ReviewQueuePanel` in `App.jsx`.

### Backend Framework

`PaaSRTSM-project/apps/admin-api` is an Express backend using CommonJS modules.

Relevant files:

- `PaaSRTSM-project/apps/admin-api/src/server.js`
- `PaaSRTSM-project/apps/admin-api/src/routes/review-queue.js`
- `PaaSRTSM-project/apps/admin-api/src/categorization/index.js`
- `PaaSRTSM-project/apps/admin-api/src/categorization/tier0.js`
- `PaaSRTSM-project/apps/admin-api/src/categorization/tier1.js`
- `PaaSRTSM-project/apps/admin-api/src/categorization/tier2.js`
- `PaaSRTSM-project/apps/admin-api/src/categorization/embed.js`
- `PaaSRTSM-project/apps/admin-api/src/routes/search.js`
- `PaaSRTSM-project/apps/admin-api/src/services/sku-embedding-indexer.js`
- `PaaSRTSM-project/apps/admin-api/src/services/embedding-sync-jobs.js`

### Routing and Auth

`PaaSRTSM-project/apps/admin-api/src/server.js` mounts route modules. Admin routes use cookie session auth from:

- `PaaSRTSM-project/apps/admin-api/src/auth/middleware.js`
- `PaaSRTSM-project/apps/admin-api/src/auth/session.js`
- `PaaSRTSM-project/apps/admin-api/src/auth/users.js`

`/api/admin/review-queue` is mounted through `createReviewQueueRouter` under `/api`, so the route path is defined as `/admin/review-queue` inside `routes/review-queue.js`.

Current review queue routes require:

- `requireAuthMiddleware`
- `requireRoleMiddleware("admin")`
- `requireCsrfMiddleware` for mutating batch confirmation and category creation routes

### Database and Migrations

The backend uses raw SQL through the `pg` package. There is no ORM. Query logic is written directly in route/service modules.

Migration structure:

- Root schema bootstrap: `PaaSRTSM-project/001_inventory_schema.sql`
- Additional migrations: `PaaSRTSM-project/migrations/*.sql`
- Migration runner: `PaaSRTSM-project/scripts/db_migrate.js`

The migration runner reads `001_inventory_schema.sql` first, then sorted migration files.

## Current Flow Diagram

```text
Admin user
  |
  | opens Category Review / Review Queue in SC admin frontend
  v
SC-StockDay-Ordering/apps/admin-web/src/App.jsx
  ReviewQueuePanel
  |
  | GET {VITE_API_BASE_URL}/api/admin/review-queue?limit=80&status=...
  v
PaaSRTSM-project/apps/admin-api/src/server.js
  app.use("/api", createReviewQueueRouter(...))
  |
  v
PaaSRTSM-project/apps/admin-api/src/routes/review-queue.js
  GET /admin/review-queue
  |
  | reads ada.product_category_states
  | joins ada.branch_stock_snapshots, public.skus, ada.product_barcodes
  | calls fetchSimilarityOptions()
  v
PostgreSQL
  ada.product_category_states
  ada.product_category_embeddings
  ada.branch_stock_snapshots
  public.skus
  ada.product_barcodes
  |
  v
Response:
  {
    total,
    limit,
    offset,
    records: [
      {
        productCode,
        productNameThai,
        productNameEng,
        barcode,
        currentCategory,
        reviewStatus,
        sourceKind,
        sourceMatchLevel,
        options
      }
    ],
    allCategories
  }
```

## Current Categorization Flow

### Frontend Component

`ReviewQueuePanel` in `SC-StockDay-Ordering/apps/admin-web/src/App.jsx`:

- Loads queue with `GET /api/admin/review-queue?limit=80&status=${filter}`.
- Stores backend records in `queue`.
- Displays `product.currentCategory` as `ระบบเดา`.
- Displays category buttons from `product.options`.
- If search is empty, shows only `options.slice(0, 9)`.
- If search has text, searches across `options + allCategories`.
- If `filteredOptions` is empty, shows: `ไม่พบหมวดที่ตรงกับคำค้น ลองพิมพ์คำอื่นหรือสร้างหมวดใหม่`.
- Confirms choices by posting to `/api/admin/review-queue/confirm-batch`.
- Can create new category by posting to `/api/admin/categories`.

### Backend Route

`PaaSRTSM-project/apps/admin-api/src/routes/review-queue.js`

`GET /api/admin/review-queue`:

1. Reads `status`, `limit`, `offset`, and `top_k`.
2. Counts rows in `ada.product_category_states`.
3. Loads products where `review_status` is:
   - `proposed`
   - `needs_review`
   - or both for `status=all`
4. Returns product metadata from:
   - `ada.product_category_states`
   - `ada.branch_stock_snapshots`
   - `public.skus`
   - `ada.product_barcodes`
5. Calls `fetchSimilarityOptions(db, productCodes, topK)`.
6. Loads `allCategories` from confirmed rows only.

`fetchSimilarityOptions()`:

- Uses `ada.product_category_embeddings`.
- Query set: current review products that have embeddings.
- Reference set: products whose `review_status` is `confirmed` or `imported_exact_match` and have embeddings.
- Uses pgvector cosine distance via `<=>`.
- Returns top category options, deduped by category.

### Confirmation Flow

`POST /api/admin/review-queue/confirm-batch`:

- Accepts `{ decisions: [{ productCode, categoryName, isNewCategory? }] }`.
- Writes to `ada.product_category_states`.
- Sets:
  - `review_status = 'confirmed'`
  - `source_kind = 'human'`
  - `source_reference = 'review_queue'`
  - `source_match_level = 'human_review'`
  - `imported_by = req.auth.userId`
- Preserves previous category/status fields in the same table.

## How Current Category Suggestions Are Generated

The system currently has several layers:

### Tier 0: Exact Taxonomy Match

File: `PaaSRTSM-project/apps/admin-api/src/categorization/tier0.js`

Purpose:

- Match product code against imported taxonomy mapping.
- If unambiguous, write `review_status = imported_exact_match`.
- This is the safest automatic path.

### Tier 1: Deterministic Category Normalization

File: `PaaSRTSM-project/apps/admin-api/src/categorization/tier1.js`

Inputs:

- Raw category from `public.skus.category_name` or `ada.products.category_name`.
- `public.typo_aliases`
- `public.category_shelf_rules`

Behavior:

- If raw category maps to a known category rule, returns `proposed` unless `always_human_confirm` is true.
- If raw category has no rule, returns `needs_review`.
- If raw category is missing, returns `needs_review`.

Important limitation:

- Tier 1 does not inspect active ingredients in product names.

### Tier 2: Category Embedding Similarity

File: `PaaSRTSM-project/apps/admin-api/src/categorization/tier2.js`

Inputs:

- `ada.product_category_states`
- `ada.product_category_embeddings`

Behavior:

- For products in `needs_review`, finds the nearest `imported_exact_match` product by embedding similarity.
- If similarity is above threshold, upgrades to `proposed`.
- Default threshold is `0.60`.

Important limitation:

- It needs both the query product and reference products to have category embeddings.
- It copies the category of the nearest known product.
- It does not explicitly understand `bisoprolol`, `hydrochlorothiazide`, or medical indications.

### Review Queue Similarity Options

File: `PaaSRTSM-project/apps/admin-api/src/routes/review-queue.js`

Even if a product is still `needs_review`, the review queue can show option buttons from similar confirmed/imported products. If there is no embedding or no matching reference set, `options` is empty.

### Separate SKU Search Embeddings

Files:

- `PaaSRTSM-project/apps/admin-api/src/routes/search.js`
- `PaaSRTSM-project/apps/admin-api/src/services/sku-embedding-indexer.js`
- `PaaSRTSM-project/apps/admin-api/src/embeddings/sku-text.js`

Table:

- `public.sku_embeddings`

These embeddings are used for SKU search/hybrid search and are separate from category embeddings. They do not automatically power the review queue.

## Current Database Model

### Product/SKU Tables

Likely core tables from `001_inventory_schema.sql` and later migrations:

- `public.items`
- `public.skus`
- `public.barcodes`
- `ada.products`
- `ada.product_barcodes`
- `ada.branch_stock_snapshots`

Relevant `public.skus` fields added by migrations:

- `company_code`
- `display_name`
- `category_name`
- `supplier_code`
- `generic_name`
- `strength_text`
- `form`
- `route`
- `product_kind`
- `enrichment_status`
- `enrichment_notes`
- `enriched_at`
- `enriched_by`
- `min_stock`
- `max_stock`
- `lead_time_days`

### Category and Review Tables

- `ada.product_category_states`
- `public.category_shelf_rules`
- `public.typo_aliases`
- taxonomy mapping tables used by `tier0` and taxonomy reconciliation

`ada.product_category_states` is the central review state table:

- `product_code`
- `category_name`
- `review_status`
- `rationale`
- `source_kind`
- `source_reference`
- `source_report_file`
- `source_workbook_file`
- `source_workbook_sheet`
- `source_workbook_row`
- `source_match_level`
- `source_barcode`
- `previous_category_name`
- `previous_review_status`
- `imported_at`
- `imported_by`
- `updated_at`

Allowed statuses:

- `confirmed`
- `proposed`
- `needs_review`
- `reverify`
- `imported_exact_match`

### Embedding Tables

`ada.product_category_embeddings`:

- Used by category similarity and review queue category options.
- Contains product-code keyed embeddings from product Thai/English names.
- Uses pgvector.

`public.sku_embeddings`:

- Used by SKU search and embedding sync jobs.
- Contains richer SKU search embeddings.
- Separate from category embeddings.

`public.embedding_sync_jobs` and `public.embedding_sync_job_items`:

- Track SKU embedding sync jobs.

### Audit/History

`public.audit_logs`:

- Generic audit table with actor/action/target/message/meta/request context.

`ada.product_category_states` also stores limited previous category/status fields.

## Why LODOS May Have No Suggestion

The product:

```text
เภสัช โลดอส 2.5 มก./6.25 มก. 30 เม็ด
MERCK LODOS BISOPROLOL FUMARATE 2.5 MG. HYDROCHLOROTHAIAZIDE 6.25 MG. 30 S
IC-005863
```

Contains active ingredients that a pharmacist recognizes:

- `bisoprolol`
- `hydrochlorothiazide`

The current system may still return no options because:

- It does not parse active ingredient names as first-class facts.
- It does not map ingredients to drug classes or indications.
- It relies on existing category states and embeddings.
- If `IC-005863` has no category embedding, `fetchSimilarityOptions()` cannot produce options.
- If reference products with matching embeddings are missing or not confirmed/imported, options may be empty.
- `public.sku_embeddings` cannot compensate because review queue uses `ada.product_category_embeddings`.

## Minimal Additive Schema Proposal

The safest direction is to add an ingredient knowledge schema without changing existing categorization tables. Suggested schema namespace: `clinical` or `knowledge`. To stay consistent with current schemas, `knowledge` is clearer for non-transactional supervised metadata.

### `knowledge.ingredients`

Purpose: Canonical active ingredient dictionary.

Suggested fields:

- `ingredient_id bigserial primary key`
- `canonical_name text not null unique`
- `display_name text not null`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Possible statuses:

- `active`
- `needs_review`
- `deprecated`

### `knowledge.ingredient_synonyms`

Purpose: Match product text variants to canonical ingredients.

Suggested fields:

- `synonym_id bigserial primary key`
- `ingredient_id bigint not null references knowledge.ingredients`
- `synonym_text text not null`
- `language text`
- `source text`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- unique `(ingredient_id, lower(synonym_text))` if implemented through a generated normalized field or expression index

Examples:

- `bisoprolol`
- `bisoprolol fumarate`
- `hydrochlorothiazide`
- `hydrochlorothaiazide` as observed typo variant if needed

### `knowledge.drug_classes`

Purpose: Drug class hierarchy.

Suggested fields:

- `drug_class_id bigserial primary key`
- `name text not null unique`
- `parent_class_id bigint references knowledge.drug_classes`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Examples:

- `Beta blocker`
- `Thiazide diuretic`
- `ARB`
- `Calcium channel blocker`
- `Cardiovascular`

### `knowledge.ingredient_drug_classes`

Purpose: Human-supervised ingredient to class relationship.

Suggested fields:

- `ingredient_id bigint not null references knowledge.ingredients`
- `drug_class_id bigint not null references knowledge.drug_classes`
- `confidence numeric(5,4)`
- `source text`
- `status text not null default 'confirmed'`
- `confirmed_by text`
- `confirmed_at timestamptz`
- primary key `(ingredient_id, drug_class_id)`

### `knowledge.indications`

Purpose: Usage/indication dictionary.

Suggested fields:

- `indication_id bigserial primary key`
- `name text not null unique`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Examples:

- `hypertension`
- `edema`
- `cardiovascular treatment`

### `knowledge.ingredient_indications`

Purpose: Ingredient to usage relationship.

Suggested fields:

- `ingredient_id bigint not null references knowledge.ingredients`
- `indication_id bigint not null references knowledge.indications`
- `status text not null default 'confirmed'`
- `source text`
- `confirmed_by text`
- `confirmed_at timestamptz`
- primary key `(ingredient_id, indication_id)`

### `knowledge.product_ingredients`

Purpose: Product-level active ingredient supervision.

Product identity should use `product_code text` first because review queue and category state are product-code based. If needed later, add nullable `sku_id`.

Suggested fields:

- `product_code text not null`
- `ingredient_id bigint not null references knowledge.ingredients`
- `strength_value numeric(14,4)`
- `strength_unit text`
- `raw_text text`
- `source text not null`
- `status text not null default 'proposed'`
- `confidence numeric(5,4)`
- `confirmed_by text`
- `confirmed_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- primary key `(product_code, ingredient_id)`

Possible statuses:

- `proposed`
- `confirmed`
- `rejected`
- `needs_review`

### `knowledge.ingredient_category_rules`

Purpose: Map ingredients or ingredient-derived concepts to existing product categories.

Suggested fields:

- `rule_id bigserial primary key`
- `ingredient_id bigint references knowledge.ingredients`
- `drug_class_id bigint references knowledge.drug_classes`
- `indication_id bigint references knowledge.indications`
- `category_name text not null`
- `priority integer not null default 100`
- `rule_status text not null default 'active'`
- `note text`
- `created_by text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

This should reference `category_name` initially because the existing category system uses text category names in `ada.product_category_states` and `public.category_shelf_rules`. A separate category ID table can be introduced later if needed.

Constraint recommendation:

- Require at least one of `ingredient_id`, `drug_class_id`, or `indication_id`.

### `knowledge.ingredient_suggestion_audit`

Purpose: Track why ingredient/category suggestions were generated and how humans resolved them.

Suggested fields:

- `audit_id bigserial primary key`
- `product_code text not null`
- `suggestion_type text not null`
- `suggested_payload jsonb not null`
- `source text`
- `status text not null default 'proposed'`
- `resolved_by text`
- `resolved_at timestamptz`
- `resolution_note text`
- `created_at timestamptz not null default now()`

## Recommended Backend API Design

All admin endpoints should preserve current auth conventions:

- Require admin session auth.
- Require admin role for dictionary/review writes.
- Require CSRF for mutating routes.

### Product Ingredient Suggestions

`GET /api/admin/products/:productCode/ingredient-supervision`

Returns:

```json
{
  "ok": true,
  "product": {
    "productCode": "...",
    "productNameThai": "...",
    "productNameEng": "...",
    "barcode": "..."
  },
  "ingredients": [
    {
      "ingredientId": 1,
      "canonicalName": "bisoprolol",
      "displayName": "Bisoprolol",
      "strengthValue": 2.5,
      "strengthUnit": "mg",
      "source": "dictionary_match",
      "status": "proposed",
      "confidence": 0.92
    }
  ],
  "categorySuggestions": [
    {
      "categoryName": "ยาความดัน/หัวใจ",
      "reason": "Bisoprolol -> Beta blocker -> Cardiovascular",
      "source": "ingredient_rule",
      "priority": 10
    }
  ]
}
```

### Confirm Product Ingredients

`PUT /api/admin/products/:productCode/ingredients`

Payload:

```json
{
  "ingredients": [
    {
      "ingredientId": 1,
      "strengthValue": 2.5,
      "strengthUnit": "mg",
      "status": "confirmed"
    }
  ]
}
```

### Ingredient Dictionary

- `GET /api/admin/ingredients?search=...`
- `POST /api/admin/ingredients`
- `PUT /api/admin/ingredients/:ingredientId`

### Synonyms

- `GET /api/admin/ingredients/:ingredientId/synonyms`
- `POST /api/admin/ingredients/:ingredientId/synonyms`
- `DELETE /api/admin/ingredient-synonyms/:synonymId`

### Drug Classes

- `GET /api/admin/drug-classes`
- `POST /api/admin/drug-classes`
- `PUT /api/admin/drug-classes/:drugClassId`

### Indications

- `GET /api/admin/indications`
- `POST /api/admin/indications`
- `PUT /api/admin/indications/:indicationId`

### Ingredient Category Rules

- `GET /api/admin/ingredient-category-rules`
- `POST /api/admin/ingredient-category-rules`
- `PUT /api/admin/ingredient-category-rules/:ruleId`

### Review Queue Integration

Extend `GET /api/admin/review-queue` response additively:

```json
{
  "records": [
    {
      "productCode": "...",
      "currentCategory": null,
      "options": [],
      "ingredientSuggestions": [
        {
          "ingredient": "Bisoprolol",
          "drugClass": "Beta blocker",
          "indication": "Hypertension",
          "categoryName": "ยาความดัน/หัวใจ",
          "reason": "ingredient_rule"
        }
      ]
    }
  ]
}
```

Do not remove or replace `options`. Ingredient suggestions should be an additional field or an additional source of options.

## Recommended Frontend Design

### Minimal Review Queue Enhancement

Inside `ReviewQueuePanel`, add a compact read-only section under product metadata:

```text
Active ingredient suggestions
- Bisoprolol 2.5 mg
  Beta blocker -> Hypertension/Cardiovascular
  Suggested category: ...
- Hydrochlorothiazide 6.25 mg
  Thiazide diuretic -> Hypertension/Edema
  Suggested category: ...
```

Actions:

- Confirm ingredient
- Reject ingredient
- Add ingredient
- Edit strength/unit
- Use suggested category

### Category Option Integration

If ingredient rules produce a category, display it above embedding options with a visible reason:

```text
1  ยาความดัน/หัวใจ
   เพราะ Bisoprolol -> Beta blocker -> Cardiovascular
```

Keep current keyboard behavior:

- `1-9` selects category
- `/` searches categories
- `N` creates new category
- `S` skips

### Ingredient Dictionary Admin Page

Add a separate admin page later:

- Search ingredients
- Edit canonical names and synonyms
- Manage drug classes
- Manage indications
- Manage category rules
- Review unresolved ingredient suggestions

Do not overload the first review queue version with full dictionary CRUD.

## Integration Strategy

### Phase 1: Read-only architecture report

This document.

### Phase 2: Database migration only

Add the `knowledge` schema and minimal tables:

- `knowledge.ingredients`
- `knowledge.ingredient_synonyms`
- `knowledge.drug_classes`
- `knowledge.ingredient_drug_classes`
- `knowledge.indications`
- `knowledge.ingredient_indications`
- `knowledge.product_ingredients`
- `knowledge.ingredient_category_rules`
- `knowledge.ingredient_suggestion_audit`

No route changes yet.

### Phase 3: Backend read APIs

Add APIs that can return product ingredient supervision data without changing review queue behavior.

Start with:

- `GET /api/admin/products/:productCode/ingredient-supervision`
- `GET /api/admin/ingredients`

### Phase 4: Frontend read-only display

Show ingredient suggestions in review queue without allowing mutation.

Goal:

- Prove response shape and UX.
- Do not affect category confirmation behavior yet.

### Phase 5: Human confirmation/update APIs

Add:

- Confirm/reject product ingredients
- Add manual product ingredient
- Edit strength/unit
- Dictionary CRUD

Write audit logs.

### Phase 6: Enhance review queue suggestions

Use confirmed ingredient knowledge as an additive suggestion layer:

1. Existing `currentCategory`
2. Ingredient category rules
3. Existing embedding similarity options
4. Search across all confirmed categories

The ingredient layer should boost or add options, not replace embeddings.

### Phase 7: Audit/logging and batch backfill

Add backfill job:

- Scan product names for known synonyms.
- Propose `product_ingredients`.
- Propose category options from ingredient rules.
- Record suggestions in `knowledge.ingredient_suggestion_audit`.

## Risks and Unknowns

### Medical correctness

Ingredient-to-category mapping can be clinically sensitive. Human confirmation should be required before automatic category writes, especially for controlled drugs, combination drugs, and ambiguous products.

### Category identity

Existing categories are text values. There is no stable `category_id` table in the current review queue flow. Initial rules should reference `category_name`; a category ID layer can be added later.

### Product identity

Review queue operates on `product_code`. SKU search operates on `sku_id`. Ingredient supervision should start with `product_code` and only add `sku_id` if there is a clear need.

### Embedding coverage

`ada.product_category_embeddings` may not be complete or refreshed after new products arrive. Ingredient supervision should not depend on embedding coverage.

### Source data quality

Product names may contain misspellings such as `HYDROCHLOROTHAIAZIDE`. Synonym handling must support typo variants but should preserve canonical names.

### Automation safety

Confirmed ingredient knowledge should first create suggestions. It should not automatically overwrite `confirmed` categories.

## Specific Phase 2 Codex Prompt

```text
We completed the architecture report for the Ingredient Knowledge Layer.

Task: Implement Phase 2 only: database migration for a minimal additive supervised ingredient learning schema in PaaSRTSM-project.

Constraints:
- Do not change frontend.
- Do not change existing API behavior.
- Do not alter existing category/review/embedding tables except adding references only if absolutely necessary.
- Add a new migration under PaaSRTSM-project/migrations.
- Prefer a new schema named knowledge.
- Create additive tables:
  - knowledge.ingredients
  - knowledge.ingredient_synonyms
  - knowledge.drug_classes
  - knowledge.ingredient_drug_classes
  - knowledge.indications
  - knowledge.ingredient_indications
  - knowledge.product_ingredients
  - knowledge.ingredient_category_rules
  - knowledge.ingredient_suggestion_audit
- Use product_code text for product_ingredients because the review queue is product-code based.
- Use category_name text in ingredient_category_rules for now because current categories are text-based.
- Include created_at/updated_at timestamps.
- Include status fields with CHECK constraints.
- Include useful unique constraints and indexes.
- Keep the migration idempotent with CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
- Run tests after adding migration.

Deliverable:
- Migration file only, plus a short explanation of the schema.
```
