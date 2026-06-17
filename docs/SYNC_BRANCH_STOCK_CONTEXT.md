# Context — Branch Stock Sync & Inventory Value (สำหรับพัฒนาหน้าเว็บต่อ)

เอกสารนี้สรุป **pipeline การ sync สต็อก + ต้นทุนต่อสาขา** ตั้งแต่ฐานข้อมูล AdaPOS ที่สาขา
→ ขึ้น PostgreSQL บน Render → ถึง API ที่หน้าเว็บเรียกใช้ เพื่อใช้ต่อยอดหน้า
**มูลค่าสินค้าคงเหลือ (inventory value)** โดยเฉพาะ

> โจทย์จากหัวหน้า: **มูลค่าสินค้าคงเหลือ = จำนวนสต็อก × ต้นทุนเฉลี่ยต่อหน่วย (ต่อสาขา)**
> ใช้ต้นทุนเดียวคือ **moving average cost** ที่ ADA maintain ให้แต่ละสาขาอยู่แล้ว

---

## 1. ภาพรวม data flow

```
[เครื่องสาขา - AdaPOS / SQL Server 2008 R2 - DB: AdaAcc]
        │  อ่านอย่างเดียว (user: readonly_pilot) SELECT only
        │  ตาราง TCNMPdt (product master ต่อเครื่องสาขา)
        ▼
[apps/adapos-sync] Node agent  ──(Windows Task Scheduler รัน .bat)──
        │  ดึง FCPdtQtyRet (จำนวน) + FCPdtCostAvg (ต้นทุนเฉลี่ย) ต่อสาขา
        │  POST https://paasrtsm-project.onrender.com/api/branch-stock/sync
        ▼
[server บน Render] อัปเดต Postgres ทีละสาขา (เฉพาะ column ของสาขานั้น)
        │  ตาราง branch_stock_snapshots
        ▼
[หน้าเว็บ SPA]  GET /api/branch-stock , /api/branch-stock/inventory-value
```

หลักการสำคัญ: **1 รอบ sync = ข้อมูลของ 1 สาขาเท่านั้น** — เขียนทับเฉพาะ column ของสาขาตัวเอง
ห้าม sync สาขาหนึ่งไปลบสต็อกสาขาอื่นเป็น 0 (ดู [SESSION_2026-06-16_BRANCH_STOCK_FIXES.md](SESSION_2026-06-16_BRANCH_STOCK_FIXES.md))

---

## 2. การรัน (schedule)

- ไฟล์รัน: [apps/adapos-sync/RUN-ADAPOS-SYNC.bat](../apps/adapos-sync/RUN-ADAPOS-SYNC.bat) → `open-adapos-and-sync.ps1` → `node src/index.js`
- Windows Task Scheduler (เครื่องสาขา):
  - `SCstockDay-ADAPOS-SYNC-1920` — ทุกวัน **19:20**
  - `SCstockDay-ADAPOS-SYNC-0815` — ทุกวัน **08:15** (เพิ่ม 2026-06-17)
- `.env`: `ADAPOS_SYNC_DRY_RUN=false` (ส่งจริง), `ADAPOS_SYNC_BRANCH_CODE=005`,
  datasets = `products,sales,branch_stock,transfers,transfer_lines,pending_receipts,approved_receipts`
- ต้องเปิด AdaPOS Back Office + login ค้างไว้ก่อน sync จะเชื่อม SQL ได้

---

## 3. ที่มาของต้นทุน (ยืนยันด้วย discovery จริงบนสาขา 005)

ตาราง `TCNMPdt` มี 187 columns — column ต้นทุนมี 7 ตัว:

| Column | ความหมาย | ใช้? |
|---|---|---|
| **`FCPdtCostAvg`** | **ต้นทุนเฉลี่ย (moving average)** | ✅ **ใช้ตัวนี้** |
| `FCPdtCostLast` | ต้นทุนล่าสุด | – |
| `FCPdtCostFiFo` | ต้นทุน FIFO | – |
| `FCPdtCostStd` / `Def` / `Oth` | มาตรฐาน / ตั้งต้น / อื่นๆ | – |
| `FCPdtCostAmt` | **มูลค่าต้นทุนรวม = qty × avg (ADA คูณให้แล้ว)** | ทางเลือก |
| `FCPdtQtyRet` | จำนวนคงเหลือ (ขายปลีก) — ใช้เป็น "สต็อก" | ✅ |

ตรวจสอบกับข้อมูลจริง: `FCPdtCostAmt` = `FCPdtQtyRet × FCPdtCostAvg` เป๊ะ
(เช่น 1,967 × 13.06 = 25,689.02). Coverage สาขา 005: สินค้ามีสต็อก 2,680 ตัว
มีต้นทุน 2,629 ตัว (**98%**), ที่มีสต็อกแต่ต้นทุน 0 = 51 ตัว (2%)

Query ต้นทาง: [apps/adapos-sync/src/queries.js](../apps/adapos-sync/src/queries.js) → `getBranchStockRows`
Transform: [apps/adapos-sync/src/transform.js](../apps/adapos-sync/src/transform.js) → `toBranchStockRecords` (ส่ง `qty` + `costAvg` ต่อ product)

---

## 4. ตาราง Postgres ปลายทาง

`branch_stock_snapshots` (migrations [007](../server/db/migrations/007_branch_stock_snapshots.sql) + [014](../server/db/migrations/014_branch_stock_cost.sql)):

```
product_code (PK), product_name_thai, product_name_eng, barcode, unit,
qty_branch_000 … qty_branch_005        NUMERIC  (จำนวนต่อสาขา)
qty_total_all_branches                 NUMERIC
cost_avg_branch_000 … cost_avg_branch_005  NUMERIC(18,4)  (ต้นทุนเฉลี่ยต่อสาขา; NULL = ยังไม่เคย sync)
synced_at, created_at, updated_at
```

mapping สาขา → column: [postgresRepository.js:16](../server/src/repositories/postgresRepository.js#L16) `BRANCH_STOCK_COLUMNS`
สาขาที่ใช้งาน: `000, 001, 002, 003, 004, 005`

---

## 5. API ที่หน้าเว็บเรียกใช้ได้

### 5.1 `GET /api/branch-stock` — รายการสต็อก (มี pagination + search)
Query: `?search=<code|ชื่อ|barcode|category>&limit=25&offset=0`
Response: `{ records: [...], pagination: { limit, offset, total } }`
แต่ละ record ([mapBranchStockSnapshotRow](../server/src/repositories/postgresRepository.js#L77)):
```jsonc
{
  "productCode": "...", "productNameThai": "...", "productNameEng": "...",
  "barcode": "...", "unit": "...", "category": "...",
  "qtyBranch000": 0, "qtyBranch001": 0, ... "qtyBranch005": 0,
  "qtyTotalAllBranches": 0, "syncedAt": "...", "updatedAt": "..."
}
```
> ⚠️ **endpoint นี้คืนเฉพาะ `qty` ต่อสาขา — ไม่ได้คืน `cost_avg`** ถ้าหน้าเว็บอยากโชว์
> ต้นทุน/มูลค่าในตารางนี้ ต้องเพิ่ม field `costAvgBranchXXX` ใน mapping ก่อน (ดูข้อ 7)

### 5.2 `GET /api/branch-stock/inventory-value` — **มูลค่าคงเหลือต่อสาขา (ใช้ตัวนี้เป็นหลัก)**
Query: `?branchCode=005` (บังคับ) `&detail=true` (optional)
[routes.js:599](../server/src/routes.js#L599) → [getBranchStockInventoryValue](../server/src/repositories/postgresRepository.js#L1858)

Summary (`detail` ไม่ใส่หรือ = false):
```jsonc
{
  "branchCode": "005",
  "product_count": 6489,
  "products_with_stock": 2680,
  "products_with_cost": 2629,
  "total_inventory_value": 1234567.89   // = SUM(qty × COALESCE(cost,0))
}
```
Detail (`detail=true`) เพิ่ม array `products` (เฉพาะ qty > 0, เรียงตามมูลค่ามากสุด):
```jsonc
{ "product_code": "...", "product_name_thai": "...", "barcode": "...", "unit": "...",
  "qty": 1967, "unit_cost_avg": 13.06, "inventory_value": 25689.02 }
```

### 5.3 `GET /api/branch-stock/export.xlsx?branchCode=005&search=` — export Excel

### 5.4 `POST /api/branch-stock/sync` — agent ใช้ตอน sync (ต้องมี token, ไม่ใช่ฝั่ง UI)

---

## 6. สูตรคำนวณ (ฝั่ง server ทำให้แล้ว)

```
มูลค่าต่อสินค้าต่อสาขา = qty_branch_XXX × cost_avg_branch_XXX
มูลค่ารวมต่อสาขา       = SUM(qty_branch_XXX × COALESCE(cost_avg_branch_XXX, 0))
```
หน้าเว็บ **ไม่ต้องคำนวณต้นทุนเอง** — เรียก `/inventory-value` ได้ค่าพร้อมใช้

---

## 7. ช่องว่าง / สิ่งที่ต้องเพิ่มถ้าจะต่อหน้าเว็บ (ยังไม่ได้แก้)

1. **list endpoint ไม่คืนต้นทุน** — `/api/branch-stock` (ข้อ 5.1) ไม่มี `costAvg` ใน response
   ถ้าหน้าเว็บอยากโชว์ต้นทุน/มูลค่าในตารางรายการ (ไม่ใช่แค่ยอดรวม) ต้องเพิ่ม
   `cost_avg_branch_*` ใน SELECT + เพิ่ม field ใน `mapBranchStockSnapshotRow`
2. **51 ตัวมีสต็อกแต่ต้นทุน = 0** → มูลค่าจะ underestimate เล็กน้อย (สินค้าที่ยังไม่เคยตั้งต้นทุน)
3. **null-guard ของ cost ถูก COALESCE บดบัง** — query ทำ `COALESCE(FCPdtCostAvg, 0)` ก่อน
   ([queries.js](../apps/adapos-sync/src/queries.js)) แล้ว transform ค่อยเช็ค null → null path ไม่เคยทำงาน
   ผลคือสินค้าต้นทุน 0 จะส่ง 0 ทับค่าเดิมเสมอ ถ้าอยากเก็บต้นทุนเดิมไว้ ต้องเอา COALESCE ออก
4. ทางเลือก: ถ้าอยากให้ตรงกับยอด ADA เป๊ะ พิจารณา sync `FCPdtCostAmt` (มูลค่ารวมสำเร็จรูป) เพิ่ม

---

## 8. ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | บทบาท |
|---|---|
| [apps/adapos-sync/src/queries.js](../apps/adapos-sync/src/queries.js) | `getBranchStockRows` — ดึง qty + cost จาก TCNMPdt |
| [apps/adapos-sync/src/transform.js](../apps/adapos-sync/src/transform.js) | `toBranchStockRecords` — ขึ้นรูป payload ต่อสาขา |
| [apps/adapos-sync/src/index.js](../apps/adapos-sync/src/index.js) | ส่ง `branchCode` ที่ top level ของ request |
| [server/src/routes.js](../server/src/routes.js) | endpoints `/api/branch-stock*` |
| [server/src/repositories/postgresRepository.js](../server/src/repositories/postgresRepository.js) | `BRANCH_STOCK_COLUMNS`, `getBranchStockInventoryValue`, `getBranchStockSnapshots`, `ingestBranchStockSnapshots` |
| [server/db/migrations/014_branch_stock_cost.sql](../server/db/migrations/014_branch_stock_cost.sql) | เพิ่ม column `cost_avg_branch_*` |
| [docs/SESSION_2026-06-16_BRANCH_STOCK_FIXES.md](SESSION_2026-06-16_BRANCH_STOCK_FIXES.md) | ประวัติ fix isolation / cost / stock source |
