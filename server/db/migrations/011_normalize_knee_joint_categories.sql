-- Normalize legacy knee-joint category labels into one canonical display label.
-- Safe preview first:
--   SELECT product_code, product_name, category
--   FROM products
--   WHERE category IN (
--     '6ยาเสริมน้ำข้อเข่า',
--     '6ยาบำรุงข้อเข่า',
--     '4ยาเสริมน้ำข้อเข่า',
--     '10ข้อเข่า'
--   )
--   ORDER BY category, product_code;

UPDATE products
SET category = '9ยาข้อเข่า',
    updated_at = NOW()
WHERE category IN (
  '6ยาเสริมน้ำข้อเข่า',
  '6ยาบำรุงข้อเข่า',
  '4ยาเสริมน้ำข้อเข่า',
  '10ข้อเข่า'
);
