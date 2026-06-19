# Session — 2026-06-19 — Stock Requests, Incoming Workflow, Badges, and Admin Alert Routing

Session นี้โฟกัสที่ระบบ `คำขอสินค้าระหว่างสาขา` ทั้งฝั่ง UI, API, สถานะการตอบกลับ,
เอกสารประกอบ, notification badge, และการเตรียมทางต่อสำหรับกรณี `สินค้าหมด / แจ้ง admin`.

## ภาพรวม

สิ่งที่เกิดขึ้นใน session นี้มี 5 ก้อนหลัก:

1. ย้าย draft review มาไว้ inline ในแท็บ `คำขอของฉัน`
2. เพิ่ม / ปรับ badge แจ้งเตือนสำหรับคำขอสินค้า
3. ทำหน้า `📥 รับคำขอ` ให้ตอบคำขอได้จริง พร้อมสถานะและเอกสาร
4. แก้ปัญหา branch context ของ staff ให้ login แล้วรู้สาขาทันที
5. เพิ่ม flow ใหม่สำหรับ `สินค้าหมด` ให้ส่งเป็น admin alert ไปที่ HQ/admin

---

## Frontend — สิ่งที่ทำใน `SC-StockDay-Ordering`

### 1. Draft review ย้ายมาอยู่ใน `คำขอของฉัน`

Draft review ที่เดิมเป็น full-screen overlay ถูกย้ายมาแสดงแบบ inline ในแท็บ
`คำขอของฉัน` เพื่อให้ flow ส่งคำของ่ายขึ้นและไม่เด้งไปอีกหน้าหนึ่ง

- ย้าย state `requestDraftItems` และ `requestBatchNote` ขึ้นมาไว้ระดับ `App`
- เพิ่ม `handleClearDraft()` และ `handleSubmitDraft(...)`
- ให้ `BranchStockPanel` รับ draft ผ่าน props แทนการถือ state เอง
- ลบ review overlay เดิมออกจาก `BranchStockPanel`
- ให้ `MyRequestsTab` แสดง draft section ด้านบน แล้วค่อยตามด้วยรายการคำขอเดิม

### 2. เพิ่มรายละเอียดใน `คำขอของฉัน`

เมื่อกด expand รายการคำขอ:

- frontend จะเรียก `GET /api/stock-requests/:batchPublicId`
- cache ข้อมูลไว้ใน `detailCache`
- แสดงรายละเอียดแยกตามสาขาปลายทาง
- แสดง line items พร้อม `รหัส`, `ชื่อสินค้า`, `จำนวนที่ขอ`, `หน่วย`, `ผลตอบกลับ`

มี label สำหรับผลตอบกลับ เช่น:

- `APPROVED` → `อนุมัติ`
- `PARTIAL` → `อนุมัติบางส่วน`
- `REJECTED` → `ปฏิเสธ`

### 3. Badge แจ้งเตือนในเมนูคำขอสินค้า

มีการเพิ่ม badge สีแดงใน 2 จุด:

- ปุ่มเมนูหลัก `คำขอสินค้า`
- ปุ่ม sub-tab `📥 รับคำขอ`

ช่วงแรก badge อิงจาก unread notification แล้วภายหลังปรับ logic ให้แม่นกว่าเดิม:

- refresh badge ทันทีหลังส่ง response ไม่ต้องรอ poll รอบถัดไป
- เปลี่ยนความหมาย badge ให้สะท้อน `incoming requests ที่ยังต้องดำเนินการ`
- ตัดรายการที่มี `responseResult` แล้วออกจาก badge แม้สถานะหลักยังเป็น `SUBMITTED`

ผลคือ badge จะหายเมื่อคำขอนั้นถูกดำเนินการตอบกลับแล้วจริง

### 4. หน้า `📥 รับคำขอ` และ response workflow

ทำหน้า `📥 รับคำขอ` ให้รองรับ workflow ตอบคำขอได้จริง:

- แสดงคำขอแบบ collapsible per batch
- แสดงรหัสคำขอ, สาขาต้นทาง, เวลา, สถานะ
- แสดงรายการสินค้าแต่ละตัวพร้อมจำนวนที่ขอและหน่วย
- เพิ่ม action 3 แบบต่อสินค้า:
  - `อนุมัติ`
  - `ปฏิเสธ`
  - `ระบุ`
- ถ้า `ปฏิเสธ` หรือ `กำหนดจำนวน = 0` จะถือเป็น reject
- ยืนยันทั้ง batch ด้วยปุ่มแนว `ยืนยันและพิมพ์/สร้างเอกสาร`

### 5. เอกสารประกอบการตอบคำขอ

มีการต่อ UI และ backend สำหรับเอกสาร 2 แนว:

- เอกสารสรุปผลการดำเนินการคำขอ
- เอกสารใบปะหน้าสำหรับของที่ส่งจริง

กรณี reject ทั้งหมด จะมีเฉพาะเอกสารสรุปผล
กรณีอนุมัติทั้งหมดหรือบางส่วน จะมีทั้งเอกสารสรุปผลและใบปะหน้า

### 6. UI polish รอบย่อย

มีการเก็บรายละเอียดหน้า stock requests หลายจุด เช่น:

- ปุ่ม `ล้างรายการ` และ `ลบ` ใช้โทนแดง / ตัวอักษรขาว
- `ล้างรายการ` มี confirm ก่อนล้าง
- เปลี่ยน copy บางจุด เช่น `ขอจาก:` → `ส่งคำขอสินค้าไปที่ :`
- เอา notice `HTTP 403` ที่ไม่ช่วยอะไรออกจาก flow บางส่วนของหน้า
- จัดแนวหัวตารางและตัวเลขใน line items ใหม่ให้อ่านง่ายขึ้น
- เพิ่มสถานะ `รอตอบ` ให้มี bullet สีส้มเรืองแสงกะพริบเบา ๆ
- เพิ่มข้อความกำกับปุ่ม action สีเขียว / แดง / ส้ม ให้ผู้ใช้รู้ว่าแต่ละสีหมายถึงอะไร
- ปรับ light theme ให้ selector/รายละเอียดอ่านง่ายขึ้น
- แยก dark theme ออกมาให้ยังคงเข้าธีมเดิมและสบายตา
- ปรับ modal เอกสารไม่ให้ตารางล้น และเพิ่ม scroll ภายใน

### 7. ปรับ request dialog summary

ใน dialog ตอบรับคำขอสินค้า มีการเพิ่ม summary card และจัด layout ใหม่:

- `สาขาของคุณ`
- `ที่ฉันมีตอนนี้`
- `จำนวน`
- `หน่วย`

โดย `ที่ฉันมีตอนนี้` ใช้เลขสีเขียว และมีการจัด card ให้เป็นระเบียบขึ้นเพื่ออ่านง่าย

### 8. Flow `สินค้าหมด / แจ้ง admin`

เพิ่มความสามารถใหม่สำหรับกรณี branch user กด `+` แล้วไม่มีสาขาไหนให้ขอ:

- ระบบจะ route คำขอเป็น `admin alert` ไปที่ HQ/admin แทน
- ฝั่ง incoming ของ admin จะแสดงเป็น card สีแดงเข้ม
- card มี visual emphasis แบบ pulse เพื่อให้รู้ว่าเป็นคำขอเร่งด่วนจากสาขา
- card เหล่านี้ถูกแยกจากคำขอมาตรฐานด้วย `requestMode`

Frontend commit สำคัญช่วงท้าย:

| Commit | Title |
|---|---|
| `88e8035` | `fix(admin-web): label incoming request action buttons` |
| `0269821` | `fix(admin-web): align srq line-item table columns — header, unit center, resp expands` |
| `0a67804` | `fix(admin-web): align stock request line columns` |
| `ed30b25` | `fix(admin-web): pulse pending request responses` |
| `8d7da83` | `fix(admin-web): improve light theme request detail contrast` |
| `64fcec6` | `fix(admin-web): restore dedicated dark request detail theme` |
| `07196f1` | `fix(admin-web): add stock request notification badges` |
| `57fe0c7` | `fix(admin-web): refresh incoming badges after response` |
| `c9d9ded` | `fix(admin-web): badge stock requests by pending incoming items` |
| `ca7533d` | `fix(admin-web): ignore responded incoming items in badges` |
| `b4fd3f1` | `fix(admin-web): improve request dialog summary cards` |
| `810d0d6` | `feat(admin-web): route stockout requests to admin HQ` |

---

## Backend — สิ่งที่ทำใน `PaaSRTSM-project`

### 1. เริ่มจาก bug 403 ของ stock requests

ต้น session มีปัญหา:

- `GET /api/stock-requests/mine` ตอบ `403`
- `GET /api/stock-requests/incoming` ตอบ `403`

สาเหตุเดิมคือ Render ยังไม่ deploy commits ที่แก้ route เหล่านี้ให้:

- ไม่บังคับ `requireBranchIdentity` ในบาง GET routes
- คืน `[]` แบบ graceful ถ้า `auth.effectiveBranchCode` เป็น `null`

commits สำคัญของช่วงนั้น:

| Commit | Title |
|---|---|
| `94649c9` | `fix(admin-api): return 0 on notifications/unread-count when no branch set` |
| `65c630c` | `fix(admin-api): return empty list from /stock-requests/mine when no branch set` |
| `45440ad` | `fix(admin-api): gracefully return [] from /stock-requests/incoming when no branch set` |

### 2. Staff login แล้ว apply branch context อัตโนมัติ

เพื่อไม่ให้ staff ต้องมาเลือก branch context เองทุกครั้ง:

- derive สาขาจาก username เช่น `staff004` → branch `004`
- expose single allowed branch ให้อัตโนมัติ
- ถ้าสาขานั้นใช้ได้ จะ set `effective_branch_code` ตั้งแต่ตอน login

ไฟล์ที่เกี่ยวข้อง:

- `apps/admin-api/src/auth/users.js`
- `apps/admin-api/src/routes/auth.js`
- `tests/branch_auth.test.js`

commit:

| Commit | Title |
|---|---|
| `63b251a` | `feat(branch-override): implement staff branch allowlist and permissions handling` |
| `7b871e0` | `fix(stock-requests): allow staff branch context` |
| `7b5867a` | `fix(auth): auto-apply staff branch context on login` |

ผลคือ staff login ครั้งแรกแล้วควรรู้สาขาได้เลย ไม่ควรต้องตั้ง branch context เองใน flow ปกติ

### 3. ระบบรับคำขอ, ตอบกลับ, acknowledge, เอกสาร

backend รองรับ flow รับคำขอและตอบคำขอมากขึ้น:

- endpoint สำหรับ generate / retrieve เอกสาร stock request
- endpoint สำหรับ acknowledge คำขอ
- logic คำนวณ batch status
- logic ส่ง response ต่อ line item
- workflow สำหรับ dispatch / receipt fulfillment

commit สำคัญ:

| Commit | Title |
|---|---|
| `6d085d6` | `feat(stock-requests): add acknowledge endpoint for stock requests and implement batch status computation` |
| `53ac71b` | `feat(stock-requests): add endpoints for generating and retrieving stock request documents` |
| `f52b24b` | `feat: implement stock request dispatch and receipt fulfillment` |
| `d391f90` | `feat(stock-requests): implement document generation for stock requests and update response handling` |

### 4. เคลียร์ badge หลังตอบคำขอ

เพื่อให้ `📥 รับคำขอ` ไม่ขึ้น badge ค้างหลังดำเนินการแล้ว:

- เมื่อปลายทาง submit response จะ mark notification เดิมของ event `REQUEST_SUBMITTED` เป็น read
- test API ถูกปรับให้ครอบคลุม logic นี้

commit:

| Commit | Title |
|---|---|
| `7a3965f` | `fix(stock-requests): clear incoming badge after response` |

### 5. รองรับ `request_mode = ADMIN_ALERT`

เพื่อให้คำขอ `สินค้าหมด / แจ้ง admin` แยกจากคำขอปกติ:

- เพิ่ม column `request_mode` ใน `ordering.stock_requests`
- รองรับค่า `STANDARD` และ `ADMIN_ALERT`
- loader / mapper / insert logic ส่ง field นี้ครบ
- summary และ detail ฝั่ง incoming ใช้ field นี้แยก card / behavior ได้

ไฟล์สำคัญ:

- `migrations/037_add_stock_request_mode.sql`
- `apps/admin-api/src/services/stockRequests.js`
- `tests/stock_request_admin_alert_migration.test.js`
- `tests/stock_requests_api.test.js`

commit:

| Commit | Title |
|---|---|
| `b2df188` | `feat(stock-requests): add admin alert request mode` |

---

## Deploy และการทดสอบ

### Backend

- backend service: `srv-d6c0sd0gjchc73fvup5g`
- commit `7b5867a` ถูก deploy สำเร็จและขึ้น `live`
- commit `b2df188` ตอนแรก pre-deploy fail แต่ manual retry deploy สำเร็จ

การทดสอบที่รันผ่านระหว่างงาน:

- `tests/branch_auth.test.js`
- `tests/stock_request_admin_alert_migration.test.js`
- `tests/stock_requests_api.test.js`
- regression หลักของ stock request submit / incoming visibility / multi-branch batch

### Frontend

- frontend deploy ล่าสุดในช่วงนี้รวมถึงงาน admin alert route
- service: `srv-d87t9sjeo5us738ldfu0`
- deploy สำเร็จหลัง commit `810d0d6`

---

## เอกสารออกแบบ AdaPos write-back

มีการคุยต่อเรื่อง “ถ้าจะให้เว็บสร้างรายการจ่ายโอนสินค้าใน AdaPos ได้จริง” ว่าต้องข้ามจาก
read-only architecture เดิมไปเป็น write-back architecture ที่มี guardrail ชัดเจน

ประเด็นหลักที่สรุปไว้:

- ต้องมีชั้นกลางอย่างน้อย 1 ตัว เช่น branch agent / writer service
- web app ไม่ควรยิงเข้า AdaPos / AdaAcc โดยตรง
- ต้องแยก subsystem ชัดเจน และมี guardrail ไม่ให้ไปแตะเอกสารเก่าโดยไม่ตั้งใจ
- ต้องออกแบบ document creation flow ให้ map ไปยัง AdaPos document type จริง

มีไฟล์ local draft อยู่ที่:

- [project_adapos_writeback_implement_spec.md](C:/Users/scgro/Desktop/Webapp training project/SC-StockDay-Ordering/docs/adasoft/project_adapos_writeback_implement_spec.md)

ไฟล์นี้ยังเป็น local/untracked ใน frontend repo ณ ตอนสรุปนี้

---

## สถานะล่าสุด / สิ่งที่ควรรู้ตอนส่งต่องาน

- ระบบ stock request ตอนนี้มีทั้งฝั่ง `ส่งคำขอ`, `คำขอของฉัน`, `รับคำขอ`, badge, status, response, และเอกสารพื้นฐานแล้ว
- ปัญหา branch context ของ user ประเภท `staffNNN` ถูกแก้ให้ auto-apply จาก username
- badge ถูกปรับจาก unread notification ธรรมดา ไปเป็น pending incoming work ที่ใกล้ความจริงกว่า
- มี flow ใหม่สำหรับ `สินค้าหมด` ที่ route ไป admin/HQ โดยไม่ใช้เส้นทางเดียวกับคำขอมาตรฐาน
- ยังมี migration model ของ backend ที่ re-run ทุกไฟล์ตอน deploy ซึ่งควรปรับเป็น `schema_migrations` ในอนาคต

## ไฟล์ local ที่ยังไม่ committed

ณ เวลาที่ทำ session note นี้ พบไฟล์ untracked ใน frontend repo:

- `docs/adasoft/project_adapos_writeback_implement_spec.md`

