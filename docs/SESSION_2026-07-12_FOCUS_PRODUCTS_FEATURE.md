# ระบบตรวจสอบสินค้าโฟกัส (Focus Products)

> ตรวจทานล่าสุด: 2026-07-14 (เพิ่ม workflow ร่าง/เผยแพร่/ตั้งเวลาเผยแพร่)
>
> สถานะเอกสาร: ตรวจเทียบกับ frontend, backend, migrations และโครงสร้างระบบจริงแล้ว
>
> เอกสาร architecture หลัก: [ARCHITECTURE.md](ARCHITECTURE.md)

## 1. ภาพรวมแบบเข้าใจง่าย

ระบบนี้ใช้ติดตามว่า “สินค้าที่กำหนดให้พนักงานหรือผู้รับผิดชอบผลักดันในช่วงเวลาหนึ่ง ขายได้ถึงเป้าหรือยัง” โดยผู้ดูแลระบบกำหนดสินค้า เป้า ช่วงวันที่ สาขาที่เกี่ยวข้อง และประเภทผู้รับผิดชอบ ส่วนยอดขายจริงระบบจะอ่านจากข้อมูลการขาย AdaPOS แล้วคำนวณให้เอง

ข้อมูลแบ่งเป็น 3 ชั้น:

1. **Admin กำหนดเป้า** ในหน้า `สินค้าโฟกัส`
2. **Backend อ่านยอดขายจริง** จาก `ada.sales_headers` และ `ada.sales_lines`
3. **หน้าเว็บแสดงผล** เป็นปฏิทินรายปี ตารางรายเดือน ยอดขาย และสถานะผ่าน/ไม่ผ่าน

ยอดขายสะสมระหว่างช่วงเวลาจะไม่ถูกบันทึกซ้ำทุกครั้ง แต่คำนวณจากบิลจริง เมื่อช่วงเวลาจบแล้ว ระบบจะบันทึก snapshot เพื่อ “ปิดยอด” ตอนที่มีการเปิดอ่านข้อมูลครั้งแรกหลังวันสิ้นสุด

## 2. ประเภทสินค้าโฟกัส 4 หมวด

| หมวดที่ผู้ใช้เห็น | รหัสในระบบ | วิธีคิดเป้า | คำตัดสินรวม |
|---|---|---|---|
| โฟกัสรายคน (พนักงานขาย) | `salesperson` | รวมยอดขายของสาขาที่เกี่ยวข้อง แล้วเทียบกับเป้าหมายเดียว | ผ่านเมื่อยอดรวม ≥ เป้า |
| โฟกัสเภสัชกร | `pharmacist` | แต่ละสาขาเทียบกับเป้าของตัวเอง | ไม่มีคำตัดสินรวม แต่ละสาขาผ่าน/ไม่ผ่านแยกกัน |
| โฟกัสผู้จัดการหน้าร้าน | `store_manager` | เหมือนเภสัชกร แต่ใช้กับผู้จัดการหน้าร้าน | ไม่มีคำตัดสินรวม แต่ละสาขาผ่าน/ไม่ผ่านแยกกัน |
| โฟกัสผู้จัดการกลุ่ม | `group_manager` | แต่ละสาขาเทียบกับเป้าของตัวเอง | ผ่านรวมต่อเมื่อทุกสาขาที่เกี่ยวข้องผ่านทั้งหมด |

### ตัวอย่าง

ถ้าสินค้า A มีเป้าแยกเป็น 001 = 10, 003 = 8, 004 = 5 และยอดขายเป็น 12, 8, 4:

- `pharmacist` / `store_manager`: สาขา 001 และ 003 ผ่าน ส่วน 004 ไม่ผ่าน โดยไม่มีผลรวมว่า “ทั้งรายการผ่าน”
- `group_manager`: ทั้งรายการยังไม่ผ่าน เพราะสาขา 004 ยังไม่ถึง 5
- `salesperson`: ไม่สนใจการผ่านรายสาขา นำ 12 + 8 + 4 = 24 ไปเทียบกับเป้ารวมของรายการ

## 3. ความหมายของเป้าหมายและสาขา

### เป้าหมายหลัก (`target_qty`)

- ต้องมากกว่า 0 เสมอ
- `salesperson` ใช้เป็นเป้ารวมโดยตรง
- หมวดอื่นใช้เป็นค่า fallback: ถ้าสาขาใดไม่มีค่าใน `branch_targets` จะใช้ `target_qty`

### เป้าแยกสาขา (`branch_targets`)

เก็บเป็น JSON เช่น:

```json
{
  "001": 10,
  "003": 8,
  "004": 5,
  "005": 3
}
```

- ใช้จริงกับ `pharmacist`, `store_manager` และ `group_manager`
- สาขาที่ไม่มีใน JSON จะกลับไปใช้เป้าหมายหลัก
- ค่า `0` ใส่ได้เพื่อสื่อว่า “ยังไม่รู้เป้า” แต่ตามสูตรปัจจุบัน `ยอดขาย >= 0` ทำให้สาขานั้นแสดงว่าผ่านทันที จึงไม่ควรตีความ `0` ว่าเป็นสถานะรอข้อมูลโดยอัตโนมัติ
- เมื่อ PATCH `branchTargets` ค่าใหม่จะแทนที่ object เดิมทั้งก้อน ไม่ได้ merge รายสาขา ผู้เรียก API ต้องส่งทุกสาขาที่ต้องการเก็บไว้

### สาขาที่เกี่ยวข้อง (`branch_codes`)

- เป็น array เช่น `['001','003','004','005']`
- ถ้าเป็น `NULL` หรือผู้ใช้ไม่เลือกสาขา ระบบจะใช้ **ทุกสาขาที่ active ใน `core.branches` ณ เวลาที่อ่านข้อมูล**
- สูตรยอดรวมและสูตรผ่านจะพิจารณาเฉพาะสาขาในรายการนี้
- แต่ query ยอดขายดึงยอดของทุกสาขามาก่อน แล้วจึงเลือกสาขาที่เกี่ยวข้องตอนคำนวณ

ข้อควรระวัง: ถ้า `branch_codes = NULL` และภายหลังเปิดสาขาใหม่ใน `core.branches` สาขาใหม่นั้นจะเข้ามาอยู่ในเป้าเดิมด้วย สำหรับ `group_manager` อาจทำให้ผลรวมเปลี่ยน จึงควรระบุสาขาให้ชัดในรายการที่ต้องการรักษาความหมายทางประวัติศาสตร์

## 4. แหล่งยอดขายและเงื่อนไขนับยอด

Backend ใช้ข้อมูลดิบที่ sync จาก AdaPOS:

- หัวบิล: `ada.sales_headers`
- รายการสินค้าในบิล: `ada.sales_lines`
- join ด้วย `(branch_code, doc_no)`
- เลือก `product_code` และ `doc_date` ที่อยู่ระหว่าง `date_from` ถึง `date_to` รวมวันต้นและวันท้าย
- รับเฉพาะเอกสารที่ `FTShdDocType = '1'` (ถ้าไม่มีค่าให้ถือเป็น `'1'`)
- รับเฉพาะบิลที่ชำระแล้ว โดย `FTShdStaPaid` หรือ `paid_status = '3'`

จำนวนขายต่อบรรทัดเลือกตามลำดับนี้:

```text
qty_base
หรือ qty × stock_factor
หรือ qty
```

จากนั้น `SUM` แยกตามรหัสสินค้าและสาขา ค่าไม่มีข้อมูลถือเป็น 0

ดังนั้นผลบนหน้าจอขึ้นกับความครบถ้วนและความสดใหม่ของ AdaPOS sync ด้วย ระบบนี้ไม่ได้อ่านยอดจาก `sales_daily` และไม่ได้อ่านจาก stock snapshot

## 5. การปิดยอด (freeze)

- ใช้วันที่ปัจจุบันตาม timezone `Asia/Bangkok`
- เมื่อ `date_to` น้อยกว่าวันปัจจุบัน และรายการยังไม่เคย freeze ระบบจะคำนวณยอดแล้วเขียน `frozen_sold_by_branch`, `frozen_total_sold`, `frozen_at`
- การ freeze เกิดแบบ **freeze-on-read**: ต้องมีคนหรือระบบเรียกหน้า/API หลังวันสิ้นสุดก่อน ไม่ได้มี scheduled job ปิดยอดตอนเที่ยงคืน
- เมื่อ freeze แล้ว การอ่านครั้งต่อไปใช้ snapshot และไม่ query ยอดขายสดของรายการนั้น
- ถ้าแก้ `date_from` หรือ `date_to` ระบบจะล้าง snapshot แล้วคำนวณ/freeze ใหม่ตามช่วงใหม่
- ถ้าแก้สินค้า เป้า ประเภท หรือสาขาโดยไม่แก้ช่วงวันที่ snapshot ยอดขายเดิมจะยังอยู่ แต่สถานะจะถูกคำนวณใหม่ด้วยนิยามเป้าใหม่
- `frozen_total_sold` ถูกบันทึกไว้ในฐานข้อมูล แต่ response ปัจจุบันคำนวณ `totalSold` ใหม่จาก `frozen_sold_by_branch` เฉพาะสาขาที่เกี่ยวข้อง

## 6. Database schema

ตารางหลักอยู่ในฐานข้อมูล live ของ PaaSRTSM admin-api ไม่ได้อยู่ในฐานข้อมูล legacy ของ repo นี้:

`focus.focus_products`

| กลุ่ม | คอลัมน์ | ความหมาย |
|---|---|---|
| ตัวตน | `id bigserial PK` | เลขรายการภายใน |
| สินค้า | `product_code text NOT NULL` | รหัสสินค้าที่ใช้เทียบ `ada.sales_lines.product_code` |
| ประเภท | `focus_type text NOT NULL` | จำกัดไว้ 4 ค่าเท่านั้น |
| เป้า | `target_qty numeric(14,4)` | เป้าหลัก ต้อง > 0 |
| ช่วงเวลา | `date_from`, `date_to` | วันเริ่มและวันจบ โดยวันจบต้องไม่ก่อนวันเริ่ม |
| ขอบเขต | `branch_codes text[] NULL` | สาขาที่เกี่ยวข้อง; NULL = active ทุกสาขา |
| เป้ารายสาขา | `branch_targets jsonb` | map รหัสสาขาไปยังเป้า override |
| ผู้รับผิดชอบ | `assigned_person_name text` | ชื่อพนักงานแบบ free text ใช้กับ salesperson; ยังไม่มี FK ไป HR |
| รายละเอียด | `note text` | หมายเหตุ; service ตัดไว้สูงสุด 2,000 ตัวอักษร |
| สถานะ | `is_active boolean` | ลบแบบ soft-delete โดยเปลี่ยนเป็น false |
| ผู้สร้าง/เวลา | `created_by`, `created_at`, `updated_at` | metadata การสร้างและแก้ไข |
| ปิดยอด | `frozen_sold_by_branch`, `frozen_total_sold`, `frozen_at` | snapshot หลังหมดช่วงเวลา |
| การเผยแพร่ | `publication_status`, `scheduled_publish_at`, `published_at`, `published_by` | ร่าง/เผยแพร่ทันที/ตั้งเวลาเผยแพร่ |

Indexes หลัก:

- `(is_active, date_from, date_to)` สำหรับค้นหารายการ active ตามช่วง
- `(focus_type)` และ `(product_code)`
- `ada.sales_headers (doc_date, branch_code, doc_no)` แบบ partial index เฉพาะบิลขายที่ชำระแล้ว
- `ada.sales_lines (branch_code, doc_no, product_code)` สำหรับ join และหาสินค้าเร็วขึ้น

Migrations ที่เกี่ยวข้อง: `045`, `046`, `051`, `052` (ถูกแทนที่), `053` และ `054`

### สิ่งที่ schema ยังไม่ได้บังคับ

- ไม่มี foreign key ตรวจว่า `product_code` มีอยู่จริง
- ไม่มี foreign key ตรวจ `branch_codes` หรือ key ภายใน `branch_targets`
- ไม่มี CHECK ตรวจรูปแบบ JSON/ชนิดตัวเลขใน `branch_targets`; validation อยู่ใน Node service
- ไม่มี unique constraint ป้องกันการสร้างสินค้าชนิดเดียวกันและช่วงเวลาเดียวกันซ้ำ
- `assigned_person_name` เป็นข้อความธรรมดา ไม่ใช่ employee ID

## 7. API และสิทธิ์

| Endpoint | สิทธิ์ | หน้าที่ |
|---|---|---|
| `GET /api/focus-products` | ผู้ที่ login แล้วทุก role | อ่านเฉพาะรายการ active |
| `GET /api/admin/focus-products` | admin | อ่านรวมรายการ inactive |
| `POST /api/admin/focus-products` | admin + CSRF | สร้างรายการ |
| `PATCH /api/admin/focus-products/:id` | admin + CSRF | แก้ไขบาง field |
| `DELETE /api/admin/focus-products/:id` | admin + CSRF | soft-delete |

`?debug=1` เพิ่ม timings ของ query ใน response และ endpoint ปัจจุบันยอมให้ authenticated user ใช้ได้ด้วย

Backend ส่งข้อมูลที่คำนวณแล้วกลับมา เช่น `soldByBranch`, `totalSold`, `branchAchieved`, `achieved`, `branchTargetsEffective`, `isFrozen` และ `productName`

ชื่อสินค้าค้นตามลำดับ fallback จาก `ada.branch_stock_snapshots` → `ada.products` → `public.skus` แต่รหัสสินค้ายังคงเป็นตัวเชื่อมหลัก

### Workflow การเผยแพร่

Admin เลือกสถานะของแต่ละรายการได้ 3 แบบ:

| สถานะ | ค่าในฐานข้อมูล | ใครมองเห็น |
|---|---|---|
| บันทึกร่าง | `draft` | admin เท่านั้น |
| เผยแพร่ทันที | `published` | ผู้ใช้ที่ login แล้วทั้งหมด |
| ตั้งเวลาเผยแพร่ | `scheduled` | admin เห็นทันที; ผู้ใช้อื่นเห็นเมื่อ `scheduled_publish_at <= now()` |

การเผยแพร่ตามเวลาใช้เงื่อนไขใน read query จึงไม่ต้องรอ cron job และไม่เสี่ยงพลาดเพราะ worker หยุดทำงาน ข้อมูลเดิมก่อน migration 054 ถูก backfill เป็น `published` ทั้งหมด

คอลัมน์เพิ่มใน `focus.focus_products`: `publication_status`, `scheduled_publish_at`, `published_at`, `published_by` และ index `(is_active, publication_status, scheduled_publish_at)`

## 8. หน้าเว็บและการมองเห็นข้อมูล

Frontend อยู่ที่ `apps/admin-web/src/FocusProductsPanel.jsx` และเปิดจากเมนู Dashboard → `สินค้าโฟกัส`

- ปฏิทิน 12 เดือน: รายการจะอยู่ในทุกเดือนที่ช่วงวันที่ทับซ้อน ไม่ได้ดูเฉพาะเดือนของ `date_from`
- คลิกเดือนแล้วจึงแสดงตารางรายละเอียดด้านล่าง
- คลิก section เพื่อขยายตารางเต็มหน้าจอ
- admin ใช้ `/api/admin/focus-products` จึงเห็นทั้ง active/inactive และมีปุ่มเพิ่ม แก้ไข ลบ
- แบบฟอร์ม admin เลือกบันทึกร่าง, บันทึกและเผยแพร่ทันที หรือตั้งวันเวลาเผยแพร่ได้
- ช่องรหัสสินค้ารองรับเครื่องยิงบาร์โค้ดแบบ HID: ยิงแล้ว Enter ระบบค้น `/api/products/search`, เติมรหัสสินค้า/ชื่อ/หน่วย และแสดงการ์ดยืนยันก่อนบันทึก
- ปุ่ม `เพิ่มหลายสินค้าด้วยบาร์โค้ด` เปิด batch modal: เลือกหมวดครั้งเดียว ยิงสินค้าได้ต่อเนื่อง กำหนดเป้าทุกแถว แล้วสร้างผ่าน `POST /api/admin/focus-products/bulk` แบบ transaction
- Batch modal บังคับสาขา 001/003/004/005 และเป้ามากกว่า 0 ครบทุกสาขา; รายบุคคลบังคับผู้รับผิดชอบทุกแถว
- Batch modal มี dynamic coverage reminder แบบไม่บล็อก: หมวดพนักงานขายเตือนรายชื่อพนักงานที่ยังไม่มีสินค้า ส่วนหมวดที่ตัดสินรายสาขาเตือนสาขาที่ยังไม่มีเป้า เมื่อกดสร้างทั้งที่ยังไม่ครอบคลุม ระบบจะแสดง confirmation modal ให้กลับไปตรวจสอบหรือยืนยันสร้างต่อได้
- มีตัวช่วยใช้เป้าหลักกับทุกสาขาและคัดลอกเป้าจากสาขาหนึ่งไปอีกสาขาหนึ่งทุกแถว
- Stock เป็นคำเตือนที่ยืนยันข้ามได้ ไม่บล็อกการสร้าง; ข้อมูลไม่ครบและรายการซ้ำเป็น blocking error
- ตารางของ admin แสดง badge ร่าง/ตั้งเวลา/เผยแพร่แล้วข้างชื่อสินค้า
- user อื่นใช้ `/api/focus-products` และแก้ข้อมูลไม่ได้
- สำหรับ `pharmacist` และ `store_manager` ถ้ามี `branchCode` หน้าเว็บจะแสดงเฉพาะคอลัมน์ของสาขานั้น
- `salesperson` และ `group_manager` ยังแสดงภาพรวมทุกสาขา

ข้อควรเข้าใจ: การจำกัดคอลัมน์ตามสาขาเป็น logic ฝั่ง React เท่านั้น API read endpoint ยังส่งยอดและเป้าทุกสาขากลับมา จึงเป็นการจัดหน้าจอ ไม่ใช่ security boundary

## 9. Data flow

```text
Admin กรอกเป้าใน admin-web
        ↓ POST/PATCH + cookie session + CSRF
PaaSRTSM admin-api
        ↓ บันทึกนิยามเป้า
focus.focus_products

เมื่อเปิดหน้า
admin-web → GET focus-products → backend อ่านนิยามเป้า
                              → อ่านยอดจาก ada.sales_headers/lines
                              → คำนวณตามประเภทและสาขา
                              → freeze ถ้าหมดช่วงและยังไม่เคย freeze
                              → ส่งผลให้ React แสดงตาราง
```

## 10. ข้อมูลที่ใส่ไว้เมื่อสร้างฟีเจอร์ (กรกฎาคม 2569)

- Salesperson 7 รายการ (เดิม ids 6–12)
- Pharmacist 6 รายการ (เดิม ids 21–26)
- Store manager 8 รายการ (เดิม ids 13–20)
- Group manager 5 รายการ (เดิม ids 1–5)

ข้อมูลมาจากไฟล์ Excel ธุรกิจจริง `โฟกัสปี69.xlsx` และ `โฟกัสปี69(1).xlsx` สำหรับสาขา 001/003/004/005

ข้อจำกัดของข้อมูลเดิม: เป้าบางบรรทัดใน Excel รวมสินค้าสองรหัส แต่ schema ปัจจุบันรองรับหนึ่ง `product_code` ต่อหนึ่งแถว จึงบันทึกเพียงรหัสแรกและใส่รหัสคู่ไว้ใน `note` ผลรวมยอดขายของสินค้ารหัสคู่จึงไม่ได้ถูกรวมโดยระบบจริง

## 11. ประเด็นสำคัญก่อนพัฒนาต่อ

> **Critical Priority สำหรับรอบถัดไป — แก้ชื่อหน่วยสินค้าตลอดสาย AdaSoft → Sync → API → UI**
>
> ตรวจยืนยันแบบ read-only จาก Microsoft SQL Server ของ AdaSoft สาขา 004 เมื่อ 2026-07-14 แล้วว่า `TCNMPdtUnit.FTPunCode = '004'` มี `FTPunName = 'ขวด'` และสินค้า `IC-005195` ใช้หน่วยเล็ก `004 / ขวด` (รวมถึงหน่วยกลาง `040 / 3 ชิ้น` และหน่วยใหญ่ `016 / โหล`) แต่ batch modal ยังแสดง `004` จึงเป็นปัญหาที่เส้นทาง Sync/ข้อมูลส่วนกลาง ไม่ใช่ Unit Master ต้นทาง
>
> งานที่ต้องทำก่อนพัฒนาส่วนอื่นในรอบถัดไป:
>
> 1. ตรวจ Scheduled Task/Service ของแต่ละเครื่องว่ารัน Sync จากโฟลเดอร์ปัจจุบันหรือสำเนาเก่า โดยพบว่าสำเนา `X:\apps\adapos-sync` ยังไม่มี logic join ชื่อหน่วย ขณะที่ `X:\SCstockDay\apps\adapos-sync` มีแล้ว
> 2. ทำให้ Sync ดึง `FTPunName` จาก `TCNMPdtUnit` และส่งเข้าฐานข้อมูลส่วนกลางครบถ้วน แล้วทำ controlled re-sync/backfill หน่วยที่เคยตกเป็นรหัส
> 3. ปรับ API ค้นสินค้าให้ส่ง `unitCode` และ `unitName` แยก field อย่างชัดเจน โดยคง `unit` ชั่วคราวเพื่อ backward compatibility หากจำเป็น
> 4. ปรับหน้าเว็บให้แสดง `unitName` ก่อน และใช้ `unitCode` เป็น fallback เท่านั้น ห้าม hardcode mapping รหัสหน่วยใน frontend
> 5. เพิ่ม test สำหรับกรณี `004 → ขวด` และกรณีไม่มีชื่อหน่วย เพื่อป้องกัน regression
> 6. ย้าย read-only SQL credential ที่พบเป็น plaintext ในเอกสารติดตั้งออกไปไว้ใน secret/environment storage และหมุนรหัส แม้บัญชีจะมีสิทธิ์อ่านอย่างเดียว

1. **เป้า 0 มีความหมายคลุมเครือ** — UI บอกว่า “ยังไม่รู้เป้า” แต่สูตรถือว่าผ่าน ควรออกแบบสถานะ `target_pending` หรือใช้ `NULL` หากต้องการให้ยังไม่ถูกตัดสิน
2. **การซ่อนข้อมูลสาขาไม่ได้ทำที่ backend** — หากภายหลังถือว่าเป้ารายสาขาเป็นข้อมูลลับ ต้องกรอง response ตามสิทธิ์ใน API
3. **การ freeze อาศัยการเปิดอ่าน** — หากต้องการยอดปิดเดือนที่เวลาชัดเจน ควรมี scheduled close job และบันทึก audit
4. **แก้รายการที่ freeze แล้วได้** — admin สามารถเปลี่ยนเป้าหรือชนิดจนคำตัดสินอดีตเปลี่ยน โดยยังไม่มี revision history/audit เฉพาะระบบนี้
5. **ยังไม่มี domain audit log** — CRUD ของ focus product ไม่ได้เขียนประวัติ before/after เฉพาะฟีเจอร์
6. **หนึ่งแถวรองรับสินค้าหนึ่งรหัส** — ยังรองรับเป้ารวมของหลาย SKU ไม่ได้
7. **มี automated tests พื้นฐานแล้ว** — ครอบคลุมสูตร 4 หมวด, draft visibility, publish และ validation ของ schedule; ควรเพิ่มกรณี scheduled visibility และ migration integration เมื่อขยายระบบ
8. **รายชื่อสาขาใน form hardcode เป็น 001/003/004/005** แต่ backend ใช้ `core.branches`; เพิ่มสาขาใหม่แล้วหน้า form จะยังเลือกไม่ได้จนแก้ frontend
9. **รายการ active ถูกโหลดทั้งหมดก่อนกรองปี/เดือนใน browser** — ถ้าข้อมูลหลายปีมากขึ้นควรเพิ่ม date/filter/pagination ที่ API
10. **API debug เปิดแก่ผู้ใช้ทุกคนที่ login** — ควรจำกัด admin หรือปิดใน production หาก timings ไม่จำเป็นต่อผู้ใช้ทั่วไป

## 12. ไฟล์หลักสำหรับพัฒนาต่อ

- Frontend: `apps/admin-web/src/FocusProductsPanel.jsx`
- การผูกเมนู/สิทธิ์สาขา: `apps/admin-web/src/App.jsx`
- Styles: `apps/admin-web/src/styles.css`
- Live backend service: `../PaaSRTSM-project/apps/admin-api/src/services/focusProducts.js`
- Live backend routes: `../PaaSRTSM-project/apps/admin-api/src/routes/focus-products.js`
- Schema: `../PaaSRTSM-project/migrations/045_add_focus_products.sql`, `046...`, `051...`, `053...`, `054...`

หมายเหตุ: `SC-StockDay-Ordering/server/` เป็น legacy backend และไม่มี schema/API ของสินค้าโฟกัส การแก้ backend ของฟีเจอร์นี้ต้องทำที่ `PaaSRTSM-project` และต้อง Manual Deploy บน Render หลัง push ส่วน admin-web ของ repo นี้ auto-deploy ตาม architecture ปัจจุบัน

## 13. แนวคิดที่พักไว้: แหล่งรายชื่อพนักงานและการเชื่อม ZKTime

> สถานะ ณ 2026-07-14: **เป็นสมมติฐานและความทรงจำของเจ้าของระบบ ยังไม่มีหลักฐานเพียงพอให้ถือเป็นข้อเท็จจริง** ห้ามพัฒนาการ Sync หรือเขียนทับข้อมูลจริงโดยอาศัยหัวข้อนี้เพียงอย่างเดียว

เจ้าของระบบจำได้ว่า รายชื่อพนักงานน่าจะไม่ได้เกิดจากการพิมพ์ชื่อทีละคนทั้งหมด แต่เคยมีขั้นตอนนำข้อมูลจากแหล่งต้นทางบางแห่งมาแปลงหรือโหลดตาม template ของฐานข้อมูลที่ออกแบบไว้แล้ว แหล่งที่เป็นไปได้มากที่สุดในขณะนี้คือโปรแกรมบริหารเครื่องสแกนนิ้ว ZKTeco/ZKTime หรือข้อมูลบุคลากรที่โปรแกรมดังกล่าวใช้งาน นอกจากนี้มีข้อสันนิษฐานว่าเส้นทางข้อมูลอาจรองรับการส่งรายชื่อหรือรหัสพนักงานจากระบบกลางกลับไป Sync กับเครื่องได้ด้วย

สิ่งที่ตรวจพบแล้ว:

- `core.branch_staff` มี schema รองรับรายชื่อ สาขา ตำแหน่ง และสถานะพนักงาน
- พบ seed script ที่มีรายชื่อ 27 คนและใช้ API บันทึกลง `core.branch_staff`
- พบ attendance export จาก ZKTeco เป็นไฟล์ `.dat` ซึ่งมีรหัสพนักงานและเวลาสแกน แต่ไม่มีชื่อหรือสาขา
- พบ parser สำหรับอ่าน attendance log แต่ยังไม่พบหลักฐานว่า parser ดังกล่าวเชื่อมกับ `core.branch_staff`
- ยังไม่พบ Employee/User Master ที่ใช้จับคู่รหัสจากเครื่องกับชื่อ ตำแหน่ง และสาขา
- ยังไม่พบหลักฐานยืนยันว่าระบบปัจจุบันสามารถเขียนข้อมูลกลับไปยังเครื่องสแกนนิ้วได้

สิ่งที่ควรสืบค้นในรอบถัดไป:

1. หา Employee/User export จาก ZKTime/ZKTeco รวมถึงไฟล์ CSV, Excel, DAT, MDB หรือฐานข้อมูลของโปรแกรม
2. ตรวจสอบ mapping ระหว่างรหัสพนักงานบนเครื่อง เช่น `90001` กับแถวใน `core.branch_staff`
3. ตรวจ Git history, สคริปต์ import, PowerShell, Google Apps Script และเครื่องที่เคยใช้จัดเตรียมข้อมูล เพื่อหาขั้นตอนก่อนเกิด seed script
4. ตรวจ API/SDK และรุ่นของเครื่องว่ารองรับการส่ง user, fingerprint template, card หรือสิทธิ์กลับไปยังเครื่องหรือไม่
5. ก่อนทำ Sync ต้องกำหนด system of record ให้ชัดว่า ZKTime, ฐานข้อมูลกลาง หรือระบบ HR ใดเป็นเจ้าของข้อมูลหลัก
6. ออกแบบ dry-run, conflict handling, audit log และ backup ก่อนอนุญาตให้เขียนกลับเครื่องจริง

ลำดับความสำคัญปัจจุบัน: **พักงานสืบค้นและ Sync พนักงานไว้ก่อน** แล้วปิดงาน UX/UI สำหรับสร้างและแก้ไขรายการสินค้าโฟกัสให้พร้อมใช้งานก่อน โดย dropdown ผู้รับผิดชอบยังใช้ข้อมูล `core.branch_staff` ที่มีอยู่ในปัจจุบัน
