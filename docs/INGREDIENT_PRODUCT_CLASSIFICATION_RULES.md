# Product Classification Rules — Ingredient Dictionary & Product Type

> สร้าง: 2026-06-25  
> สถานะ: **Phase 1 ดำเนินการอยู่** (ขยาย vocabulary) — Phase 2 (product_type) ทำในอนาคต

---

## หลักคิดหลัก

สินค้าทุกชิ้นมี **3 มิติที่ต่างกัน** ไม่ควรปนกัน:

```
สินค้า 1 ชิ้น
  ├── มีอะไร?     → ingredient  (knowledge.ingredients)       ← Phase 1 ทำอยู่
  ├── มันคืออะไร? → product_type (skus.product_type column)   ← Phase 2 ทำทีหลัง
  └── วางที่ไหน?  → shelf category (ada.product_category_states) ← review queue
```

ตัวอย่าง:
- `Paracetamol 500mg` → ingredient: Paracetamol · product_type: drug · shelf: ยาสามัญ
- `Chlorhexidine scrub 4%` → ingredient: Chlorhexidine · product_type: antiseptic · shelf: น้ำยาฆ่าเชื้อ
- `เครื่องวัดความดัน` → ingredient: ไม่มี · product_type: device · shelf: เครื่องมือแพทย์

---

## กฎ: สินค้าประเภทไหนควร seed ingredient?

**ใส่ ingredient เสมอถ้า** สินค้ามี active agent ที่มีนัยสำคัญทางคลินิก:
- ความเข้มข้นสำคัญ (ethanol 70% vs 95% ต่างกัน)
- มีความเสี่ยงแพ้ (chlorhexidine allergy → anaphylaxis)
- มีกลไกการออกฤทธิ์ที่ต้องรู้ (pharmacist ต้องรู้)

```
product_type          seed ingredient?    หมายเหตุ
──────────────────    ────────────────    ──────────────────────────────────────
drug                  ✓ required          ยาแผนปัจจุบัน ขึ้นทะเบียน FDA
supplement            ✓ required          วิตามิน อาหารเสริม
herb                  ✓ required          สมุนไพร ยาแผนโบราณ
antiseptic            ✓ required          chlorhexidine, IPA, ethanol, povidone-iodine
cosmeceutical         ✓ recommended       เวชสำอางค์ที่มี active agent (AHA, retinol, niacinamide)
cosmetic (plain)      ~ optional          สบู่/ครีม ทั่วไปที่ไม่มี active claim
device                ✗ not_applicable    เครื่องมือแพทย์ อุปกรณ์ช่วย
service               ✗ not_applicable    ค่าบริการ ค่าส่ง
alcohol/tobacco       ✗ not_applicable    เหล้า บุหรี่
```

---

## กฎ: enrichment_status ใช้ค่าอะไร?

| ค่า | ความหมาย |
|---|---|
| `'missing'` | ยังไม่ได้ map ingredient (ค่า default — รอดำเนินการ) |
| `'not_applicable'` | สินค้านี้ไม่มี active ingredient โดยธรรมชาติ (device, service ฯลฯ) |
| *(future)* `'done'` | map เสร็จแล้ว confirmed ทั้งหมด |

สินค้าที่ควร set เป็น `not_applicable` ทันทีที่ทำ Phase 2:
- `product_kind = 'device_or_general_goods'` ทั้งหมด
- หมวด: เหล้า, เบียร์, บุหรี่, ค่าบริการ, ค่าส่ง, DEMO items, IS-xxxxxx (service codes)

---

## product_type taxonomy (Phase 2)

เพิ่ม column เดียวใน `skus` table:

```sql
ALTER TABLE public.skus ADD COLUMN product_type text;
-- ค่าที่ใช้:
-- 'drug'          ยาแผนปัจจุบัน
-- 'supplement'    อาหารเสริม วิตามิน
-- 'herb'          สมุนไพร ยาแผนโบราณ
-- 'antiseptic'    น้ำยาฆ่าเชื้อ ยาทาแผล
-- 'cosmeceutical' เวชสำอางค์
-- 'cosmetic'      เครื่องสำอางค์ทั่วไป
-- 'device'        เครื่องมือแพทย์ อุปกรณ์
-- 'service'       ค่าบริการ
-- 'other'         อื่นๆ (เหล้า บุหรี่)
```

Sub-type ละเอียดกว่านั้นให้ใช้ **shelf category** (review queue) แทน — ไม่ต้องสร้าง column เพิ่ม

---

## Vocabulary batch ที่ทำไปแล้ว (Phase 1)

| Batch | หมวด | จำนวน ingredients |
|---|---|---|
| 1–5 | ยาพื้นฐาน, Glucosamine/Chondroitin, Collagen (base) | — |
| 6 | Soap / Cleanser | 1 (23 synonyms) |
| 7–15 | ยา generics, วิตามิน, อาหารเสริมต่างๆ | — |
| 16 | Iron (7 forms) + Folate + Vitamin B12 (4 forms) | 13 |
| 17 | **ฟ้าทะลายโจร / Andrographis** | 1 (41 synonyms, 18 Thai) |
| 18 | **มะขามแขก / Senna** | 1 (22 synonyms, 6 Thai) |
| 19 | **ขมิ้นชัน / Curcumin / Turmeric** | 1 (21 synonyms, 8 Thai) |

---

## Vocabulary ที่ยังไม่ได้ทำ — เรียงตามลำดับความสำคัญ

### ลำดับที่ 1 — ขยายต่อทันที (Phase 1)

**ยา OTC ทั่วไป**
- Cough/Cold: ~~Dextromethorphan~~ (done), Guaifenesin, Bromhexine, Chlorpheniramine, Pseudoephedrine, Phenylephrine

**สมุนไพรไทย**
- ฟ้าทะลายโจร (done ✓)
- ~~ขมิ้นชัน (Curcumin/Turmeric)~~ (done ✓ batch 19)
- บัวบก (Centella asiatica / Gotu Kola)
- ว่านหางจระเข้ (Aloe vera)
- กระชายดำ (Kaempferia parviflora / Black Ginger)
- กระเจี๊ยบ (Roselle / Hibiscus sabdariffa)
- ~~มะขามแขก (Senna)~~ (done ✓ batch 18)
- กานพลู, ขิง, ขมิ้น, ไพล
- เสลดพังพอน (Clinacanthus nutans)

**เวชสำอางค์ (Cosmeceutical) — active agents**
- Retinol / Retinoids (Tretinoin, Adapalene)
- Niacinamide (Vitamin B3)
- AHA: Glycolic acid, Lactic acid, Mandelic acid
- BHA: Salicylic acid
- Hyaluronic acid
- Vitamin C (L-Ascorbic acid) forms
- Azelaic acid
- Kojic acid

**GI / Antacids**
- Sodium alginate (Gaviscon)
- Simethicone
- Domperidone, Metoclopramide
- Lactulose, Bisacodyl

**ผิวหนัง / Topical**
- Calamine, Zinc oxide
- Camphor (การบูร), Menthol, Eucalyptus oil
- Clotrimazole, Miconazole (antifungal)
- Betamethasone, Hydrocortisone (topical steroid)
- Benzoyl peroxide ~~(done)~~, Clindamycin

### ลำดับที่ 2 — หลังจากนั้น (Phase 2 ก่อนหรือควบคู่)

**Antiseptics & Disinfectants (batch 19 ที่วางแผนไว้)**
- Chlorhexidine
- Isopropyl alcohol (IPA)
- Ethanol (disinfectant grade)
- Povidone-iodine
- Benzalkonium chloride
- Hydrogen peroxide
- Acriflavine (ทิงเจอร์ฯ สีแดง)

**ยา Rx พบบ่อยในร้าน**
- Cardiovascular: Amlodipine, Enalapril, Losartan, Metoprolol, Atorvastatin
- Diabetes: Metformin, Glipizide, Glibenclamide
- Antibiotics: Amoxicillin ~~(done)~~, Azithromycin, Norfloxacin, Ciprofloxacin
- Antihistamine: Cetirizine, Loratadine, Fexofenadine ~~(done)~~

---

## คำถามที่ตัดสินไปแล้ว — อย่าถามซ้ำ

1. **Device/equipment ไม่ต้องใส่ ingredient** → ใช้ `enrichment_status = 'not_applicable'`
2. **ไม่สร้าง pseudo-ingredient** อย่าง "N/A" หรือ "Medical Device" เพราะปนเปื้อน dictionary
3. **Antiseptics มี ingredient จริง** แม้ไม่ใช่ยา — chlorhexidine/IPA ต้องอยู่ใน `knowledge.ingredients`
4. **product_type กับ ingredient คือคนละมิติ** — มี ingredient ≠ ต้องเป็นยา
5. **Sub-type ของ device** ใช้ shelf category แทน ไม่สร้าง taxonomy ใหม่
