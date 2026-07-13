# Session — 2026-07-13 — สาขา 003 (products POST timeout), สาขา 001 (schedule mismatch), และ notification badge สำหรับ sync ที่ยังไม่ได้แก้

ต่อเนื่องจาก `docs/SESSION_2026-07-13_ADAPOS_SYNC_004_SQL_HOST_OUTAGE.md` (สาขา 004)
วันเดียวกัน dashboard "ประวัติ Sync" ขึ้นกากบาทพร้อมกันทั้งสาขา 001, 003, 004 —
เอกสารนี้ครอบคลุมส่วนของ 003 และ 001 ซึ่งเป็นคนละสาเหตุกับ 004 โดยสิ้นเชิง
รวมถึงฟีเจอร์ notification badge ที่เพิ่มเข้ามาหลังจากนั้น

## สาขา 003 — SQL อ่านได้ปกติ แต่ POST /api/sync/products timeout ทุกรอบ

### สรุปปัญหา

Log ของเครื่อง POSSRV (สาขา 003) fail ทุกรอบต่อเนื่องตั้งแต่ 2026-07-10 08:20
(เช็คจนถึง 2026-07-13 ยังไม่ผ่านสักรอบ) ด้วย error เดิมทุกครั้ง:

```
Sync failed: Request timed out after 60000ms: https://paasrtsm-project.onrender.com/api/sync/products
```

log แสดงชัดว่า SQL Server (`POSSRV\SQLEXPRESS`) เชื่อมต่อสำเร็จและอ่านข้อมูล
ครบทุกครั้ง (`SQL Server: connected OK`, products 6591 rows, sales ~2000+ rows
ฯลฯ) — ปัญหาเกิดตอน POST ไป backend เท่านั้น ไม่ใช่ปัญหาฝั่งสาขาเหมือน 004

### สมมติฐานที่ตัดออกไปแล้ว

1. **ไม่ใช่บั๊ก LAN-IP/DHCP แบบ 004** — `.env` ของ 003 ใช้
   `ADAPOS_SQLSERVER_HOST=POSSRV\SQLEXPRESS` (named instance ผ่าน SQL Browser)
   ไม่ใช่ raw IP + fixed port
2. **ไม่ใช่ deadlock-order fix ที่ยังไม่ deploy** — ตอนแรกสงสัยว่า commit
   `c6caf4e` ("ensure stable processing order for product records to prevent
   deadlocks", push ขึ้น GitHub 2026-07-09 19:45) ยังไม่ขึ้น production เพราะ
   Render service ไม่มี `render.yaml` (auto-deploy ไม่ชัดเจน) แต่ **verify แล้ว
   ว่า deploy ขึ้นจริง**:
   - `git merge-base --is-ancestor c6caf4e 988c36f` → true (988c36f คือ commit
     ที่เพิ่ม route `/api/focus-products` ทีหลัง)
   - `curl https://paasrtsm-project.onrender.com/api/focus-products` → ตอบ
     `401` ไม่ใช่ `404` → ยืนยันว่าโค้ดหลัง `988c36f` (ซึ่งรวม `c6caf4e`) ขึ้น
     production แล้วจริง

### Root cause ที่แท้จริง

อ่านโค้ด `PaaSRTSM-project/apps/admin-api/src/routes/sync.js:283-309`
(route `POST /products`) และ `upsertProductRecord()` บรรทัด 116-269 โดยตรง
พบว่า:

- แต่ละ product ทำ query ต่อเนื่องกัน **5-8 query** (SELECT sku →
  SELECT/INSERT/UPDATE items → INSERT/UPDATE sku → INSERT barcode สูงสุด 3 →
  INSERT `analytics.product_stock_snapshots`)
- ทั้ง batch (สูงสุด **500 records/request**) อยู่ใน **transaction เดียว**
  (`BEGIN`...`COMMIT` ครอบทั้ง for-loop, sequential `await` ไม่มี parallel เลย)
- สาขา 003 มี **6591 products** → batch 500 records × ~6 query × ~15-20ms
  network latency ไป Render Postgres ≈ **58-60 วินาที/batch** — ชนกับ
  `ADAPOS_SYNC_REQUEST_TIMEOUT_MS` default (60000ms) พอดิบพอดี transaction
  ยังไม่ทัน `COMMIT` ฝั่ง client ก็ abort ไปก่อนแล้ว (error message ยืนยันว่า
  abort เกิดตอนรอ header — ยังไม่ได้ response กลับมาเลยภายใน 60 วิ)

ทำไมสาขาอื่นไม่เจอ: สาขา 001 รอดเพราะ `.env` ตั้ง
`ADAPOS_SYNC_REQUEST_TIMEOUT_MS=180000` (สูงกว่า default 3 เท่า จากงาน backfill
ก่อนหน้า) ให้ headroom พอที่ transaction จะ COMMIT ทัน — เป็นการกลบอาการ
ไม่ใช่แก้ root cause เดียวกัน

### การแก้ไข

เพิ่ม `ADAPOS_SYNC_PRODUCT_BATCH_SIZE` (default **100**, แยกจาก batch size 500
ที่ dataset อื่นยังใช้อยู่) เพื่อลด transaction/lock duration ต่อ request:

- `apps/adapos-sync/src/config.js` — เพิ่ม `parsePositiveInteger()` +
  `syncConfig.productBatchSize`
- `apps/adapos-sync/src/index.js` — batch products ด้วย
  `syncConfig.productBatchSize` แทน default 500
- `apps/adapos-sync/.env.example`, `apps/adapos-sync/installer/install.ps1` —
  รองรับตัวแปรใหม่พร้อม default

Commit: `e71e32f` — ทดสอบจริงกับสาขา 003 สำเร็จครบทุก dataset หลังแก้

**หมายเหตุ**: ระหว่างเตรียม commit นี้ push ครั้งแรกโดน reject เพราะ origin
มี commit ใหม่กว่าที่แก้ปัญหาคนละเรื่องแต่ไฟล์เดียวกัน (`client.js` response-body
timeout, commit `6d10f10` — คนละ session แก้คู่ขนานกัน) ต้อง `git reset --hard
origin/main` แล้ว re-apply เฉพาะส่วน `productBatchSize` ทับใหม่เพื่อไม่ให้
conflict กับ fix ของอีก session

### สิ่งที่ยังไม่แก้ (แนะนำระยะยาว)

`upsertProductRecord()` ยังเป็น per-record query อยู่ ควรเปลี่ยนเป็น batch
query (เช่น `SELECT ... WHERE company_code = ANY($1)` ครั้งเดียวแทนวนลูป
SELECT ทีละตัว) จะลด round-trip ได้มากกว่าการลด batch size เฉยๆ

## สาขา 001 — ไม่ได้พัง แค่ schedule ไม่ตรงกับสาขาอื่น

Log ไม่มี "Sync failed" เลยตลอดที่เช็คได้ (ยกเว้น 2026-07-04 ครั้งเดียว เป็น
isolated incident ไม่ต่อเนื่อง) `.env` ใช้ `SC_001\SQLEXPRESS` ถูกต้องอยู่แล้ว
ไม่เข้าข่ายบั๊กของ 004 หรือ 003

ปัญหาจริงที่เจอ: scheduled task ยังเป็นชื่อ/รูปแบบเก่า
`ADAPOS Sync Daily 1930` (รันรอบเดียว/วัน ตอน 19:30) ไม่ตรงกับ pattern
เช้า(08:20)+เย็น(19:20) ที่สาขาอื่นใช้ตั้งแต่ commit `ef33ee2` (2026-07-07)
เพราะเครื่องนี้ไม่เคยรัน `register-task.ps1` เวอร์ชันใหม่เลย พระจันทร์ที่เห็น
ในแดชบอร์ดในบางวันคือ "ยังไม่ถึง 19:30" เฉยๆ ไม่ใช่ error

แก้ไข: ให้ผู้ดูแลเครื่อง sc-001 รัน (Administrator):

```powershell
Unregister-ScheduledTask -TaskName "ADAPOS Sync Daily 1930" -Confirm:$false
cd "C:\...\apps\adapos-sync"
powershell -ExecutionPolicy Bypass -File .\register-task.ps1 -Branch 001
```

(ยังไม่ยืนยันว่ารันแล้วหรือยัง ณ ตอนเขียนเอกสารนี้)

## Notification badge สำหรับ sync ที่ยังไม่ได้แก้ (`apps/admin-web`)

เพิ่ม badge แจ้งเตือนที่ปุ่ม nav "ตรวจสอบฐานข้อมูล" (data-quality) และเมนูย่อย
"ประวัติ Sync" — โชว์เฉพาะสาขาที่ **สถานะรอบล่าสุดของวันนี้ยังเป็น "failed"**
เท่านั้น ถ้าวันนี้เคย fail ตอนเช้าแต่รอบเย็นสำเร็จแล้ว ถือว่าแก้ไขแล้ว ไม่นับ
(ใช้ endpoint เดิม `/api/sync/nightly-log?days=1` ได้ทันที เพราะ query เดิม
`bool_or(status='success')` มีความสำคัญเหนือ `any_failed` อยู่แล้ว ตรงกับ
requirement พอดี — ไม่ต้องแก้ backend)

การ implement (`apps/admin-web/src/App.jsx`):

- state `syncFailureBranches` + polling ทุก 30 วินาที (pattern เดียวกับ badge
  คำขอสินค้าที่มีอยู่แล้ว) เมื่อ session เป็น admin
- `groupBadgeCount` เลือก count ที่ถูกต้องตามกลุ่มเมนู (stock-requests vs
  sync-log) แล้วโชว์ทั้งที่ปุ่ม group และเมนูย่อย ด้วย class `nav-notif-badge`
  เดิมที่มีอยู่แล้ว

Build ผ่าน (`npm run build -w apps/admin-web`) — ยังไม่ได้ commit ณ ตอนเขียน
เอกสารนี้
