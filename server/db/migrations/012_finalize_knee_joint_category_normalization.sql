-- Finalize knee-joint category cleanup across the category stack.
--
-- Safe previews:
--   SELECT product_code, product_name, category
--   FROM products
--   WHERE category IN (
--     '6ยาเสริมน้ำข้อเข่า',
--     '6ยาบำรุงข้อเข่า',
--     '4ยาเสริมน้ำข้อเข่า',
--     '10ข้อเข่า'
--   )
--   ORDER BY category, product_code;
--
--   SELECT product_code, clean_category, shelf_no, pharmacist_zone, requires_signoff
--   FROM product_category
--   WHERE (clean_category = 'ยาเสริมน้ำข้อเข่า' AND COALESCE(shelf_no, -1) IN (4, 6))
--      OR (clean_category = 'ยาบำรุงข้อเข่า' AND COALESCE(shelf_no, -1) = 6)
--      OR (clean_category = 'ข้อเข่า' AND COALESCE(shelf_no, -1) = 10)
--   ORDER BY product_code;

-- 1. Normalize displayed product category labels.
UPDATE products
SET category = '9ยาข้อเข่า',
    updated_at = NOW()
WHERE category IN (
  '6ยาเสริมน้ำข้อเข่า',
  '6ยาบำรุงข้อเข่า',
  '4ยาเสริมน้ำข้อเข่า',
  '10ข้อเข่า'
);

-- 2. Normalize persisted review/overlay category metadata.
UPDATE product_category
SET clean_category = 'ยาข้อเข่า',
    shelf_no = 9,
    pharmacist_zone = TRUE,
    is_cold_chain = FALSE,
    requires_signoff = TRUE,
    needs_reverification = FALSE,
    updated_at = NOW()
WHERE (clean_category = 'ยาเสริมน้ำข้อเข่า' AND COALESCE(shelf_no, -1) IN (4, 6))
   OR (clean_category = 'ยาบำรุงข้อเข่า' AND COALESCE(shelf_no, -1) = 6)
   OR (clean_category = 'ข้อเข่า' AND COALESCE(shelf_no, -1) = 10);

-- 3. Normalize taxonomy history rows so category refreshes do not reintroduce old labels.
UPDATE taxonomy_map
SET clean_category = 'ยาข้อเข่า',
    shelf_no = 9
WHERE (clean_category = 'ยาเสริมน้ำข้อเข่า' AND COALESCE(shelf_no, -1) IN (4, 6))
   OR (clean_category = 'ยาบำรุงข้อเข่า' AND COALESCE(shelf_no, -1) = 6)
   OR (clean_category = 'ข้อเข่า' AND COALESCE(shelf_no, -1) = 10)
   OR raw_label IN (
     '6ยาเสริมน้ำข้อเข่า',
     '6ยาบำรุงข้อเข่า',
     '4ยาเสริมน้ำข้อเข่า',
     '10ข้อเข่า'
   );

-- 4. Retire old shelf rules and replace them with the canonical one.
DELETE FROM category_shelf_rules
WHERE clean_category IN ('ยาเสริมน้ำข้อเข่า', 'ยาบำรุงข้อเข่า', 'ข้อเข่า');

INSERT INTO category_shelf_rules (
  clean_category,
  allowed_shelves,
  allowed_unprefixed,
  is_cold_chain_possible,
  is_controlled,
  always_human_confirm
)
VALUES (
  'ยาข้อเข่า',
  ARRAY[9],
  FALSE,
  FALSE,
  FALSE,
  TRUE
)
ON CONFLICT (clean_category) DO UPDATE SET
  allowed_shelves = EXCLUDED.allowed_shelves,
  allowed_unprefixed = EXCLUDED.allowed_unprefixed,
  is_cold_chain_possible = EXCLUDED.is_cold_chain_possible,
  is_controlled = EXCLUDED.is_controlled,
  always_human_confirm = EXCLUDED.always_human_confirm,
  updated_at = NOW();

-- 5. Add aliases so future parsing collapses legacy text back into the canonical category.
INSERT INTO typo_aliases (raw_variant, canonical_category)
VALUES
  ('ยาเสริมน้ำข้อเข่า', 'ยาข้อเข่า'),
  ('ยาบำรุงข้อเข่า', 'ยาข้อเข่า'),
  ('ข้อเข่า', 'ยาข้อเข่า'),
  ('6ยาเสริมน้ำข้อเข่า', 'ยาข้อเข่า'),
  ('6ยาบำรุงข้อเข่า', 'ยาข้อเข่า'),
  ('4ยาเสริมน้ำข้อเข่า', 'ยาข้อเข่า'),
  ('10ข้อเข่า', 'ยาข้อเข่า')
ON CONFLICT (raw_variant) DO UPDATE SET
  canonical_category = EXCLUDED.canonical_category;
