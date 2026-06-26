# Codex Prompt — Automated Taxonomy Batch Classification

## วัตถุประสงค์

ให้ Codex ทำหน้าที่เป็น **Thai FDA Product Classification Agent** โดย:
1. Query `public.skus` เพื่อดึงรายการที่ยังไม่มี `product_type`
2. จัดประเภทแต่ละ SKU โดยใช้ heuristic rules + WebSearch ตาม Thai FDA law
3. เขียน SQL batch file พร้อม `taxonomy_note` อธิบายเหตุผลทางกฎหมาย
4. รัน SQL ต่อ Render DB โดยตรง พร้อม verify ผล

ทำทีละ **100 SKU ต่อ batch** จนกว่าจะครบ

---

## Read first — ห้ามข้าม

1. อ่าน `SC-StockDay-Ordering/docs/INGREDIENT_PRODUCT_CLASSIFICATION_RULES.md` ทั้งไฟล์
   → source of truth สำหรับ 9 product_type values และ enrichment_status rules

2. อ่าน `PaaSRTSM-project/scripts/batch1_taxonomy_classify.sql`
   → ดูรูปแบบ SQL และ taxonomy_note ที่เคยเขียนไว้แล้ว เพื่อให้สไตล์สอดคล้องกัน

---

## Ground truth

- **DB:** อ่าน DATABASE_URL จาก `PaaSRTSM-project/apps/admin-api/.env`
- **คอลัมน์เป้าหมาย:** `public.skus.product_type` (text, nullable), `public.skus.taxonomy_note` (text, nullable)
- **คอลัมน์ที่ใช้คัดกรอง:** `display_name`, `category_name`, `product_kind`, `company_code`, `generic_name`
- **Migration:** 042 (`taxonomy_note`) ถูก apply แล้ว — ตรวจก่อนด้วย:
  ```sql
  SELECT * FROM schema_migrations WHERE filename LIKE '%042%';
  ```
  ถ้ายังไม่มี → รัน `npm run db:migrate` ใน `PaaSRTSM-project` ก่อน

---

## Product Type Values (9 ค่า + NULL)

| ค่าใน DB | ความหมาย | กฎหมายหลัก |
|---|---|---|
| `drug` | ยาแผนปัจจุบัน + ยาแผนโบราณ + ยาจีน | พ.ร.บ.ยา พ.ศ. 2510 |
| `supplement` | อาหารเสริม / วิตามิน | พ.ร.บ.อาหาร พ.ศ. 2522 |
| `herb` | ผลิตภัณฑ์สมุนไพร (มีทะเบียน อย.) | พ.ร.บ.ผลิตภัณฑ์สมุนไพร พ.ศ. 2562 |
| `antiseptic` | แอลกอฮอล์ / น้ำยาฆ่าเชื้อ | พ.ร.บ.ยา 2510 (ยาสามัญ) |
| `cosmeceutical` | ยาหน้า / ครีมที่มีส่วนผสมยา | พ.ร.บ.ยา + เครื่องสำอาง |
| `cosmetic` | เครื่องสำอางทั่วไป | พ.ร.บ.เครื่องสำอาง พ.ศ. 2558 |
| `device` | เครื่องมือแพทย์ / อุปกรณ์ | พ.ร.บ.เครื่องมือแพทย์ พ.ศ. 2562 |
| `service` | รายการบริการ / ค่าใช้จ่าย / test record | ไม่อยู่ภายใต้กฎหมายสินค้าสุขภาพ |
| `other` | ยาสูบ / ของแถม / สินค้าที่ไม่เข้าหมวดไหน | ตามบริบท |
| NULL | ยังไม่จัดประเภท (UNCERTAIN) — ข้ามไว้ก่อน | — |

---

## Classification Algorithm

### Step 1 — Heuristic Rules (ทำก่อน WebSearch)

Apply rules ตามลำดับนี้ (หยุดที่ rule แรกที่ match):

**SERVICE (enrichment_status = not_applicable):**
- `company_code` LIKE `'IS-%'` หรือ `'TEST-%'` หรือ `'ADA-%'`
- `display_name` มีคำว่า ค่าบริการ, บริการ, ค่าส่ง, ค่าธรรมเนียม, ค่าขนส่ง, ค่าสาธารณูปโภค, ค่าเอกสาร, ค่าส่งเสริม, ตัวแทน
- `product_kind` = `'service'`

**OTHER (enrichment_status = not_applicable):**
- `display_name` มีคำว่า บุหรี่, ยาสูบ, ซิการ์, ยาเส้น
- `display_name` มีคำว่า กระบอก, ของแถม, พวงกุญแจ, ถุง (ที่ไม่ใช่ยา)

**DEVICE (enrichment_status = not_applicable):**
- `product_kind` = `'device_or_general_goods'`
- `display_name` มีคำว่า เทอร์โมมิเตอร์, ปลาสเตอร์, หน้ากาก, ถุงมือ, อุปกรณ์, เครื่องวัด, เข็มฉีดยา, ไม้กดลิ้น, syringes

**ANTISEPTIC:**
- `display_name` มีคำว่า แอลกอฮอล์, alcohol, แอลกอฮอล์เจล, น้ำยาฆ่าเชื้อ, povidone, betadine, เบตาดีน

**HERB:**
- `display_name` มีคำว่า สมุนไพร, herbal, ฟ้าทะลายโจร, ขมิ้นชัน, เสลดพังพอน, พญายอ, ว่านหางจระเข้, กระชาย, ไพล, กระเทียม (แคปซูล), ขิง (แคปซูล), เกร็กคู, ตรีผลา
- `category_name` ILIKE `'%สมุนไพร%'` หรือ `'%herbal%'`

**SUPPLEMENT:**
- `display_name` มีคำว่า วิตามิน, vitamin, แคลเซียม, calcium, คอลลาเจน, collagen, โอเมก้า, omega, โปรไบโอติก, probiotic, อาหารเสริม, supplement, ซิงค์, zinc, ไบโอติน, biotin, สังกะสี, แมกนีเซียม, โฟลิก, folic
- `category_name` ILIKE `'%supplement%'` หรือ `'%อาหารเสริม%'` หรือ `'%วิตามิน%'`

**COSMETIC:**
- `display_name` มีคำว่า ครีมบำรุง, โลชั่น, แชมพู, shampoo, ครีมอาบน้ำ, ยาสีฟัน, น้ำยาบ้วนปาก (ไม่ใช่ยา), ลิปสติก, ครีมกันแดด, sunscreen (ถ้า SPF only ไม่มี active drug)
- `category_name` ILIKE `'%เครื่องสำอาง%'` หรือ `'%cosmetic%'`

**COSMECEUTICAL:**
- `display_name` มีคำว่า ครีมรักษา, ยาทาฝ้า, hydroquinone, tretinoin, retinoic, adapalene, ครีมกำจัดขน (ที่มี API เช่น thioglycolate)

**DRUG — ยาแผนปัจจุบัน:**
- `display_name` มีคำว่า ยาน้ำ, ยาเม็ด, ยาแคปซูล, ยาเหน็บ, ยาพ่น, ยาหยอด, ยาฉีด, ยาทา
- generic drug names: paracetamol, ibuprofen, amoxicillin, cetirizine, loratadine, omeprazole, metformin, amlodipine, simvastatin, aspirin, diclofenac, chlorpheniramine, dextromethorphan, guaifenesin, antacid, aluminium hydroxide, magnesium hydroxide, simethicone, domperidone, metoclopramide, bisacodyl, glycerin, lactulose, ORS, charcoal, bismuth, ranitidine, famotidine, antifungal (clotrimazole, miconazole, ketoconazole), antibiotic topical (fusidic acid, mupirocin, gentamicin), antiviral topical (acyclovir), hydrocortisone, betamethasone, dexamethasone, prednisolone, calamine, zinc oxide (ถ้ามีทะเบียนยา)
- ยาชุด, ยาแผนปัจจุบัน, ยาสามัญ, ยาอันตราย, ยาควบคุมพิเศษ

**DRUG — ยาแผนโบราณ/ยาจีน:**
- `display_name` มีคำว่า ยาแผนโบราณ, ยาจีน, ยาหม้อ, ยาลูกกลอน, ยาผง (ที่มีทะเบียน 2A/G/P), กฤษณา, เขากุย, ขี้ผึ้ง (แผนโบราณ), ยาดม, ยาหอม

### Step 2 — WebSearch สำหรับรายการที่ heuristic ไม่ match

สำหรับ SKU ที่ยังไม่ชัดเจน ให้ค้นหาตามลำดับ:

1. **Thai FDA NDI (National Drug Information):**
   - URL: `https://search.fda.moph.go.th/drug/search` → ค้นด้วยชื่อสินค้า/ชื่อยา
   - หาก found → DRUG_MODERN (product_type = 'drug')

2. **Thai FDA Herbal Products:**
   - URL: `https://search.fda.moph.go.th/herb/search` → ค้นด้วยชื่อ
   - หาก found → HERBAL_PRODUCT (product_type = 'herb')

3. **Google Search:** `[ชื่อสินค้า] site:fda.moph.go.th` หรือ `[ชื่อสินค้า] ทะเบียน อย.`

4. หาก search แล้วยังไม่ชัด → ข้ามไว้ (อย่า update, ปล่อยให้ `product_type` เป็น NULL)

### Step 3 — Context พิเศษสำหรับร้านนี้

ร้านนี้คือ **ร้านยา ขย.1 ที่มีเภสัชกรประจำร้าน** ดังนั้น:
- **ยาอันตราย (dangerous drugs)** เช่น antibiotic topical, hydroquinone, corticosteroid → classify เป็น `drug` ปกติ ไม่ต้อง flag พิเศษ
- **ยาควบคุมพิเศษ** (narcotic/psychotropic) → classify เป็น `drug` แต่ระบุใน taxonomy_note
- สินค้าที่ชื่อบริษัทตั้งเอง (ไม่ใช่ชื่อ INN) → ดูจากสินค้ากลุ่มเดียวกันในตาราง หรือ search ด้วยชื่อ ingredient

---

## taxonomy_note Format

เขียน taxonomy_note เป็นภาษาไทย ความยาว 1-2 ประโยค:

```
[ชื่อสินค้า/ส่วนผสมหลัก] — [ประเภทตามกฎหมาย] [กฎหมายอ้างอิง]; [หมายเหตุถ้ามี]
```

ตัวอย่าง:
- `'Paracetamol 500mg — ยาสามัญประจำบ้าน OTC ภายใต้ พ.ร.บ.ยา พ.ศ. 2510'`
- `'ขมิ้นชันแคปซูล — ผลิตภัณฑ์สมุนไพร ภายใต้ พ.ร.บ.สมุนไพร พ.ศ. 2562; ยืนยันเลขทะเบียน NDI'`
- `'ชื่อบริษัทตั้งเอง; infer จากกลุ่มสินค้าประเภทเดียวกัน ยืนยันฉลาก'`
- `'ยาอันตราย (antibiotic) จ่ายโดยเภสัชกร ภายใต้ พ.ร.บ.ยา พ.ศ. 2510'`

---

## Work Packages

### WP-01 — ดึงรายการ SKU ที่ยังไม่ระบุประเภท

รันคำสั่งนี้เพื่อดูสถานะปัจจุบัน:

```sql
-- จำนวนรวมที่ยังไม่มี product_type
SELECT COUNT(*) AS unclassified FROM public.skus WHERE product_type IS NULL;

-- breakdown ของ unclassified ตาม category_name
SELECT category_name, COUNT(*) AS cnt
FROM public.skus
WHERE product_type IS NULL
GROUP BY category_name
ORDER BY cnt DESC
LIMIT 30;
```

จากนั้น query batch แรก (100 รายการ) โดยเรียงตาม `company_code`:

```sql
SELECT company_code, display_name, category_name, product_kind,
       generic_name, strength_text, form
FROM public.skus
WHERE product_type IS NULL
  AND status = 'active'
ORDER BY company_code
LIMIT 100;
```

บันทึก offset ไว้ใช้ใน batch ถัดไป (`OFFSET 100`, `OFFSET 200`, ...)

---

### WP-02 — จัดประเภท SKU แต่ละรายการ

สำหรับแต่ละ SKU ใน batch:
1. ใช้ heuristic rules (Step 1) — ถ้า match ให้ classified = true
2. ถ้าไม่ match → ใช้ WebSearch (Step 2)
3. ถ้าค้นแล้วยังไม่ชัด → ข้าม (UNCERTAIN, ไม่ UPDATE)

สร้างตารางสรุปก่อนเขียน SQL:

| company_code | display_name | product_type | enrichment_status | taxonomy_note | confidence |
|---|---|---|---|---|---|
| ... | ... | drug | missing | ... | HIGH |
| ... | ... | supplement | missing | ... | MEDIUM |
| ... | ... | service | not_applicable | ... | HIGH |
| ... | ... | ? | — | — | SKIP |

**enrichment_status rules:**
- `service`, `device`, `other` → set `enrichment_status = 'not_applicable'`
- `drug`, `herb`, `supplement`, `antiseptic`, `cosmetic`, `cosmeceutical` → ไม่เปลี่ยน enrichment_status (ยังต้องการ ingredient mapping ต่อ)
- UNCERTAIN → ไม่ UPDATE อะไรทั้งนั้น

---

### WP-03 — เขียน SQL batch file

สร้างไฟล์: `PaaSRTSM-project/scripts/batch{N}_taxonomy_classify.sql`
(N = batch number เช่น batch2, batch3, ...)

รูปแบบ:

```sql
-- Taxonomy Batch N — [วันที่]
-- company_code range: [XXX] to [YYY]
-- SKUs classified: [X] | skipped (UNCERTAIN): [Y]

BEGIN;

-- กลุ่ม: drug (ยา)
UPDATE public.skus SET
  product_type  = 'drug',
  taxonomy_note = '[เหตุผล]'
WHERE company_code IN ('[code1]', '[code2]', ...);

-- กลุ่ม: herb (สมุนไพร)
UPDATE public.skus SET
  product_type  = 'herb',
  taxonomy_note = '[เหตุผล]'
WHERE company_code IN ('[code3]', ...);

-- กลุ่ม: service
UPDATE public.skus SET
  product_type       = 'service',
  enrichment_status  = 'not_applicable',
  taxonomy_note      = '[เหตุผล]'
WHERE company_code IN ('[code4]', ...);

-- [ทำแต่ละ product_type ที่มีใน batch นี้]

COMMIT;

-- UNCERTAIN (ข้าม ไม่ update):
-- [company_code]: [display_name] — [เหตุผลที่ยังไม่แน่ใจ]
```

---

### WP-04 — รัน migration check + SQL

```powershell
# ตรวจว่า migration 042 apply แล้ว
cd "PaaSRTSM-project"
node -e "
const { Client } = require('pg');
require('dotenv').config({ path: 'apps/admin-api/.env' });
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => c.query(\"SELECT filename FROM schema_migrations WHERE filename LIKE '%042%'\"))
  .then(r => { console.log(r.rows.length ? 'OK: 042 applied' : 'MISSING: run npm run db:migrate'); c.end(); });
"

# ถ้า 042 ยังไม่ apply:
# npm run db:migrate

# รัน batch SQL
$env:PGPASSWORD = (node -e "require('dotenv').config({path:'apps/admin-api/.env'}); const u=new URL(process.env.DATABASE_URL); console.log(u.password)")
$DB_URL = (node -e "require('dotenv').config({path:'apps/admin-api/.env'}); console.log(process.env.DATABASE_URL)")
psql $DB_URL -f "scripts/batchN_taxonomy_classify.sql"
```

---

### WP-05 — Verify ผลลัพธ์

```sql
-- สรุปหลัง batch
SELECT product_type, COUNT(*) AS count
FROM public.skus
WHERE product_type IS NOT NULL
GROUP BY product_type
ORDER BY count DESC;

-- ตรวจ taxonomy_note สุ่ม 5 รายการที่เพิ่งอัปเดต
SELECT company_code, display_name, product_type, taxonomy_note
FROM public.skus
WHERE taxonomy_note IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;

-- คงเหลือ unclassified เท่าไร
SELECT COUNT(*) AS remaining_unclassified
FROM public.skus
WHERE product_type IS NULL AND status = 'active';
```

paste ผลลัพธ์แสดง:
1. count ต่อ product_type หลัง batch นี้
2. ตัวอย่าง taxonomy_note 5 รายการ
3. จำนวน unclassified ที่เหลือ

---

## Rules of Engagement

- **ทำทีละ 100 SKU** อย่าพยายาม classify ทั้งหมดในครั้งเดียว
- **อย่า UPDATE ถ้าไม่แน่ใจ** ปล่อย `product_type = NULL` ดีกว่า classify ผิด
- **ห้ามใส่ค่านอกเหนือ 9 ค่าที่กำหนด** ใน product_type
- **taxonomy_note เป็นภาษาไทย** อ้างอิงกฎหมายจริง
- **ตรวจ migration ก่อนเสมอ** อย่า assume ว่า apply แล้ว
- **รายงาน UNCERTAIN** ชัดเจนว่า skip เพราะอะไร — อย่าเงียบ
- **commit ทีละ batch** ไม่รวม batch ไว้ในไฟล์เดียวกัน
- **ห้ามแตะไฟล์ migration 041/042** หรือ code อื่น — task นี้คือ data classification เท่านั้น
