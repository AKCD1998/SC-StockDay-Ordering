# Postmortem — 2026-09-20 — Stock Requests ค้างจาก session หมดอายุและ runtime crash ตอนแก้จำนวน

## สถานะ

| รายการ | ค่า |
|---|---|
| สถานะ | แก้ไขและ deploy แล้ว |
| วันที่ตรวจสอบและแก้ไข | 20 กันยายน 2026 |
| ระบบที่กระทบ | Admin Web — `#/stock-requests` |
| ระดับผลกระทบ | Major workflow failure เฉพาะงานคำขอสินค้าระหว่างสาขา |
| ผู้ใช้ที่รายงาน | พนักงานสาขาที่เข้าเว็บผ่าน Google Apps Script launcher |
| การสูญหายของข้อมูล | ไม่พบหลักฐานว่ามีข้อมูลสูญหายหรือถูกเขียนผิด |
| Commit แก้ session handling | `9ef9f45b15af1047ad927c550f75f3202aa07a58` |
| Commit แก้ quantity runtime crash | `a618fee4879675926dc304f1dd2bc95fd37f61fd` |
| Production bundle หลังแก้ครบ | `assets/index-IEcs1lsY.js` |

เวลาทั้งหมดในเอกสารนี้เป็นเวลา Asia/Bangkok (ICT, UTC+7) เว้นแต่ระบุเป็นอย่างอื่น

## Executive summary

พนักงานสาขารายงานว่าหน้า Stock Requests ค้างระหว่างเตรียมและส่งคำขอสินค้า โดยเข้าใช้งานผ่านปุ่ม
“เริ่มต้นใช้งาน” ใน Google Apps Script launcher อาการที่เห็นมีทั้งกลับไปหน้า login, แสดง
“กำลังตรวจสอบเซสชัน...” และหน้าว่าง ทำให้ในระยะแรกดูเหมือนเป็นเหตุการณ์เดียวกัน

การตรวจสอบพบว่าอาการที่คล้ายกันนี้เกิดจาก **สอง failure modes แยกกัน**:

1. เมื่อ session หมดอายุ request บางส่วนได้รับ `401` แต่หน้าเว็บเดิมไม่มีจุดจัดการ `401` ร่วมกันและยังมี
   polling ทำงานต่อ ผู้ใช้จึงไม่ถูกพากลับเข้าสู่ขั้นตอน login ที่ชัดเจน นอกจากนี้ staff client ยังเรียกข้อมูล
   sibling batch ที่สิทธิ์ของ staff ไม่ควรใช้ ซึ่งสร้าง request ที่ไม่จำเป็นและทำให้สัญญาณระหว่างวิเคราะห์สับสน
2. คลิปการใช้งานจริงภายหลังแสดงว่าเมื่อผู้ใช้เปลี่ยนค่าในช่อง “จำนวน” ฟังก์ชัน `patchDraftItem()` เรียก
   `normalizeRequestedQty()` ซึ่งไม่มี declaration หรือ import ใน `StockRequestsPanel.jsx` ทำให้ browser โยน
   `ReferenceError` และ React tree ล้ม เหตุนี้เกิดใน frontend ก่อนการส่งคำขอไป backend

สาเหตุที่สองถูกนำเข้ามาตั้งแต่การ extract component ใน commit `2cf74b8` เมื่อ 16 กันยายน 2026 และมีรูปแบบเดียวกับ
เหตุการณ์ `Code39Barcode is not defined` ที่บันทึกไว้ใน
`docs/INCIDENT_2026-09-17_STOCK_REQUEST_CODE39_RUNTIME_CRASH.md`: consumer ถูกย้ายไปไฟล์ใหม่ แต่ local dependency
ยังอยู่ใน `App.jsx` การ build ผ่านได้เพราะ unresolved identifier นี้เป็น JavaScript syntax ที่ถูกต้องและ path ที่เสีย
ไม่ได้ถูก execute โดยชุดทดสอบเดิม

แก้ไขโดยเพิ่ม API client กลางที่แจ้ง App เมื่อพบ `401`, ยุติ polling และพากลับหน้า login พร้อมข้อความภาษาไทย,
จำกัดการดึงข้อมูลตาม role, คืน `normalizeRequestedQty()` ให้ module ที่ใช้งาน และเพิ่ม interaction regression test
สำหรับการเปลี่ยนจำนวน หลังแก้ชุดทดสอบ Admin Web ผ่าน 125/125 และ production build สำเร็จ

Google Apps Script launcher และการพิมพ์ URL ของ Render โดยตรงไม่ได้เลือกคนละ Git branch ทั้งสองเส้นทางไปยัง
Render production deployment เดียวกัน ความแตกต่างที่ผู้ใช้เห็นอาจมาจาก session, tab ที่เปิดค้าง หรือ JavaScript
bundle เก่าที่ browser โหลดไว้ ไม่ใช่ branch คนละชุด

## ผลกระทบต่อผู้ใช้

### ยืนยันแล้ว

- session ที่หมดอายุสามารถทำให้หน้าเดิมยังคง polling และแสดงสถานะที่ไม่บอกผู้ใช้ชัดว่าต้อง login ใหม่
- ผู้ใช้ที่มี draft และเปลี่ยนช่อง “จำนวน” บน bundle ที่มีปัญหาจะชน runtime exception
- runtime exception สามารถทำให้หน้า Stock Requests ว่างหรือกลับเข้าสู่ขั้น “กำลังตรวจสอบเซสชัน...” หลัง browser
  reload/remount
- workflow เตรียมคำขอสินค้าถูกขัดจังหวะและผู้ใช้ไม่มั่นใจว่าคำขอถูกส่งสำเร็จหรือไม่
- คลิปที่ได้รับไม่ได้แสดงการกดปุ่ม “ยืนยันส่งคำขอสินค้า” ณ จังหวะที่หน้าล้ม; จังหวะที่ทำให้เกิดปัญหาในคลิปคือ
  การใช้งาน input จำนวน
- Render API log ในช่วงคลิปตอบ `200`/`304` สำหรับ request ที่ตรวจพบ และไม่พบ `401`, `403` หรือ `5xx`
  ในช่วงดังกล่าว

### ไม่พบ

- ไม่พบหลักฐานว่า quantity crash ส่งข้อมูลผิดไป backend เพราะ exception เกิดใน handler ฝั่ง client
- ไม่พบหลักฐานว่าคำขอสินค้า, จำนวนสินค้า หรือข้อมูลตอบรับของสาขาสูญหายจากเหตุการณ์นี้
- ไม่พบหลักฐานว่า Apps Script launcher ส่งผู้ใช้ไป deployment หรือ branch อื่น

### ขอบเขตที่ยังไม่ทราบ

- ไม่มี client-side exception monitoring จึงระบุจำนวนผู้ใช้และจำนวนครั้งที่เกิด runtime exceptionย้อนหลังไม่ได้
- เวลาประมาณ 20:30 ที่รายงานครั้งแรกไม่มีวันที่และ client console ที่ผูกกับเหตุการณ์อย่างแน่นอน จึงไม่ควรสรุปว่า
  เป็น failure mode ใดเพียงอย่างเดียว
- ไม่สามารถยืนยันจากคลิปว่าคำขอที่ผู้ใช้ตั้งใจส่งถูกสร้างแล้วหรือยัง ต้องตรวจจาก request ID หรือรายการคำขอในระบบ
  แยกต่างหากก่อนส่งซ้ำ

## หลักฐานที่ใช้วิเคราะห์

### คลิปการใช้งานจริง

| รายการ | ค่า |
|---|---|
| ชื่อไฟล์ที่ได้รับ | `fc019894-e842-40af-9b8c-341909deb677.mp4` |
| SHA-256 | `AB69795C87227C634CA29F006DCF452698B6675CB35A6FEB9A0845A39DB2EA35` |
| ความยาว | 19.520104 วินาที |
| ความละเอียด | 540 × 960 |
| เวลาใน metadata | 20 ก.ย. 2026 12:13:48 ICT |

ลำดับที่เห็นในคลิป:

1. ผู้ใช้ `staff001` อยู่หน้า “คำขอของฉัน” และมี draft พร้อมช่องจำนวน
2. ผู้ใช้เปิดเมนูบัญชี จากนั้นหน้าไปยัง login และ login กลับเข้ามา
3. เมื่อ pointer ใช้งานลูกศรของ number input หน้าเว็บกลายเป็นหน้าว่าง/มืด
4. ต่อมาหน้าแสดง “กำลังตรวจสอบเซสชัน...” และกลับมา
5. อาการเกิดซ้ำเมื่อใช้งานช่องจำนวนอีกครั้ง

### Render request logs

จาก IP และ user agent ที่สัมพันธ์กับคลิป พบ `/admin/me` เวลา 12:12:55, 12:13:11 และ 12:13:39 ซึ่งบ่งชี้ว่า
App ถูก initialize/remount หลายครั้ง ในช่วงเดียวกัน endpoint ที่เกี่ยวข้อง เช่น `/admin/me`,
`/api/stock-request-draft/me`, `/api/stock-requests/mine`, `/api/stock-requests/incoming` และ detail requests
ตอบ `200` หรือ `304`

หลักฐานนี้ใช้ตัด backend authorization/server failure ออกจาก root cause ของจังหวะที่เห็นในคลิป แต่ไม่ได้แปลว่า
session-expiry failure ที่ตรวจพบก่อนหน้าไม่เคยเกิดขึ้น

### Source และ Git history

- `normalizeRequestedQty()` มีอยู่ใน `App.jsx` และ `BranchStockPanel.jsx` แต่เป็น module-local function
- `StockRequestsPanel.jsx` เรียก helper นี้จาก `patchDraftItem()` โดยไม่มี declaration/import
- `git blame` ชี้ว่าการอ้างถึง helper ที่ขาดถูกนำเข้ามาใน commit `2cf74b8` เมื่อ extract Stock Requests panel
- commit เดียวกันเคยทำให้ `Code39Barcode` หายจาก module scope และเกิด incident เมื่อ 17 กันยายน 2026
- build เดิมผ่าน เพราะ bundler ไม่ได้ทำหน้าที่เทียบทุก identifier กับ module scope แบบ ESLint `no-undef`

## Timeline

| เวลา | เหตุการณ์ |
|---|---|
| 16 ก.ย. 2026 11:07 | Commit `2cf74b8` extract `StockRequestsPanel` และทิ้ง `normalizeRequestedQty()` ไว้ในไฟล์ต้นทาง |
| 17 ก.ย. 2026 | แก้ incident `Code39Barcode` ซึ่งมีรูปแบบ missing dependency จาก refactor เดียวกัน; action item เรื่อง `no-undef` ยังเป็น TODO |
| ก่อน 20 ก.ย. 2026 | พนักงานรายงานว่าหน้าค้างหลังพยายามส่งคำขอ โดยระบุเวลาประมาณ 20:30 แต่ไม่มีวันที่/console ที่ยืนยันแน่ชัด |
| 20 ก.ย. 2026 ช่วงเช้า | ตรวจพบ session-expiry handling ที่ไม่สมบูรณ์และ request ตาม role ที่ไม่เหมาะสม |
| 20 ก.ย. 2026 09:44 | Commit `9ef9f45` เพิ่ม shared `apiFetch`, จัดการ `401`, ยุติ polling และปรับ request ตาม role |
| 20 ก.ย. 2026 12:13:48 | คลิปการใช้งานจริงบันทึกอาการเดิมระหว่างแก้ช่องจำนวน |
| 20 ก.ย. 2026 ประมาณ 12:18–12:30 | เทียบ frame ในคลิปกับ Render logs; ยืนยันว่า API ช่วงคลิปตอบสำเร็จและพบจังหวะ crash ตรงกับ number input |
| 20 ก.ย. 2026 12:35 | Commit `a618fee` คืน `normalizeRequestedQty()` ให้ `StockRequestsPanel.jsx` และเพิ่ม regression test |
| 20 ก.ย. 2026 12:35:58 | Render เริ่มเสิร์ฟ production bundle ใหม่ `assets/index-IEcs1lsY.js` |
| หลัง deploy | ตรวจ production root และ bundle ได้ HTTP 200 และพบ normalization logic ใน bundle ใหม่ |

## Root cause

### Failure mode A — session หมดอายุแต่ UI ไม่เข้าสู่ recovery flow กลาง

authenticated requests ถูกเรียกจากหลาย component โดยตรง เมื่อ response เป็น `401` ไม่มี event กลางให้ App ล้าง session,
กลับหน้า login และ teardown polling อย่างสม่ำเสมอ ผลคือหน้าสามารถอยู่ใน state กึ่ง login/กึ่ง polling และแสดงอาการค้าง
หรือโหลดซ้ำโดยไม่มีคำอธิบายที่ผู้ใช้ดำเนินการต่อได้

staff client ยังโหลด sibling batch context ที่มีไว้สำหรับผู้ใช้สิทธิ์สูงกว่า การเรียกนี้ไม่ใช่สิ่งจำเป็นสำหรับ staff workflow
และทำให้ log มี authorization noise เพิ่มขึ้น

### Failure mode B — local helper หายหลัง component extraction

ก่อน refactor โครงสร้าง dependency เป็นดังนี้:

```text
App.jsx
├── normalizeRequestedQty
└── MyRequestsTab → patchDraftItem → normalizeRequestedQty
```

หลัง commit `2cf74b8`:

```text
App.jsx
└── normalizeRequestedQty

StockRequestsPanel.jsx
└── MyRequestsTab → patchDraftItem → normalizeRequestedQty  (ไม่มี declaration/import)
```

จึงไม่มีปัญหาตอน render draft ครั้งแรก แต่จะล้มทันทีเมื่อผู้ใช้เปลี่ยนจำนวนและ `patchDraftItem()` ถูก execute

### ปัจจัยร่วม

1. การ review component extraction ไม่มี dependency inventory ครบทั้ง helper, constant, hook และ local component
2. Admin Web CI ไม่มี static check ที่เปิด `no-undef`
3. characterization test เดิม render draft ได้ แต่ไม่ได้ fire change event บน quantity input
4. action item `no-undef` จาก incident 17 กันยายนยังไม่ถูกดำเนินการก่อนพบ missing dependency ตัวที่สอง
5. ไม่มี route/panel error boundary ทำให้ handler exception ส่งผลกับประสบการณ์ทั้งหน้า
6. ไม่มี frontend exception monitoring พร้อม release/bundle ID จึงต้องอาศัยคลิปและเทียบ request logs ภายหลัง
7. อาการ “หน้าค้าง/กลับไปตรวจสอบ session” เหมือนกันจากหลายสาเหตุ ทำให้การวิเคราะห์รอบแรกยึดกับ session มากเกินไป

## Five Whys — quantity runtime crash

1. **ทำไมหน้าเว็บจึงค้างหรือว่างเมื่อแก้จำนวน?**  Event handler โยน JavaScript runtime exception
2. **ทำไม event handler จึงโยน exception?**  `patchDraftItem()` เรียก `normalizeRequestedQty()` ที่ไม่มีใน module scope
3. **ทำไม helper จึงไม่มีใน module scope?**  การ extract component ย้าย consumer แต่ไม่ได้ย้ายหรือ import local helper
4. **ทำไม test/build ไม่จับก่อน deploy?**  build ยอมรับ unresolved identifier และ test เดิมไม่ได้ execute quantity change path
5. **ทำไมช่องว่างนี้ยังคงอยู่หลัง incident รูปแบบเดียวกันครั้งก่อน?**  guardrail ที่ระบุไว้ เช่น `no-undef` และ interaction
   coverage ยังเป็น TODO และยังไม่ถูกบังคับใน CI

## การแก้ไขที่ดำเนินการแล้ว

### Session และ authorization behavior — `9ef9f45`

- เพิ่ม `apps/admin-web/src/lib/apiClient.js` เป็น wrapper กลางสำหรับ authenticated API requests
- กระจายเหตุการณ์ `401` ให้ App เปลี่ยนเป็น logged-out state
- แสดงข้อความ “เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่”
- teardown polling เมื่อ session ใช้งานไม่ได้
- ไม่ให้ staff โหลด sibling batch context ที่ต้องใช้สิทธิ์ requester/admin
- เพิ่ม regression test สำหรับ `401` และยืนยันว่า polling intervals ถูกยกเลิก

### Quantity runtime crash — `a618fee`

- เพิ่ม `normalizeRequestedQty()` ใน `StockRequestsPanel.jsx` ซึ่งเป็น module ที่ใช้งานจริง
- เพิ่ม interaction regression test ที่เปลี่ยน quantity input และตรวจว่า draft updater ได้ `requestedQty: 7`
- focused characterization tests ผ่าน 11/11
- Admin Web test suite ผ่าน 26 files, 125/125 tests
- Vite production build สำเร็จ
- deploy production และตรวจ root/bundle ได้ HTTP 200

## สิ่งที่ทำได้ดี

- คลิปจากพนักงานแสดง pointer และลำดับเหตุการณ์ ทำให้แยกจังหวะแก้จำนวนออกจากจังหวะ submit ได้
- การเทียบเวลาในคลิปกับ Render request logs ช่วยตัด backend failure ออกจากจังหวะ crash ได้อย่างมีหลักฐาน
- แก้ไขบน clean worktree ที่ตั้งต้นจาก `origin/main` โดยไม่กระทบ working tree ที่มีงานอื่น
- เพิ่ม regression test ที่ execute interaction ที่เสียจริง ไม่ได้ตรวจเพียงว่า component render ได้
- ตรวจทั้ง focused test, full suite, production build และ exact deployed asset หลัง push
- การแก้ไขไม่เปลี่ยน database schema หรือ production data

## สิ่งที่ต้องปรับปรุง

| Priority | Action | Owner | สถานะ | เหตุผล/เกณฑ์สำเร็จ |
|---|---|---|---|---|
| P0 | เพิ่ม ESLint/static analysis ที่เปิด `no-undef` และบังคับใน CI ของ Admin Web | Admin Web | TODO | identifier ที่ไม่มี declaration/import ต้องทำให้ PR fail |
| P0 | audit dependency ของทุก component ที่ย้ายใน commit `2cf74b8` | Admin Web | TODO | ยืนยันว่าไม่มี helper/constant/component ที่ยังตกค้างใน `App.jsx` |
| P0 | เพิ่ม critical interaction test: สร้าง draft → เปลี่ยนจำนวน → ใส่หมายเหตุ → submit → แสดงผลสำเร็จ/ผิดพลาด | Admin Web | TODO | ครอบคลุม workflow ที่ร้านใช้จริงด้วย mocked API |
| P1 | รวม quantity normalization เป็น shared tested utility แทนสำเนาในหลายไฟล์ | Admin Web | TODO | มี implementation เดียวและ unit tests สำหรับค่าศูนย์, ติดลบ, ทศนิยม, NaN |
| P1 | เพิ่ม route/panel error boundary พร้อมปุ่ม retry และข้อความที่ไม่ทำให้เข้าใจผิดว่าเป็น session เสมอ | Admin Web | TODO | runtime error ใน panel ไม่ทำให้ทั้ง App ว่าง |
| P1 | เพิ่ม client-side exception monitoring พร้อม user role, route, release commit และ bundle ID โดยไม่เก็บข้อมูลสุขภาพ/ข้อมูลลับ | Platform | TODO | ค้นเหตุการณ์ย้อนหลังและประเมิน blast radius ได้ |
| P1 | เพิ่ม post-deploy browser smoke test สำหรับ Stock Requests critical paths | Platform | TODO | deploy ไม่ถือว่าสำเร็จจน interaction หลักผ่าน |
| P2 | ลด detail-request fan-out หลัง App remount และตรวจว่า polling ไม่ซ้ำ | Admin Web/API | TODO | ลด load และทำให้ incident logs อ่านง่ายขึ้น |
| P2 | แสดง release/version ใน UI หรือ diagnostics panel | Platform | TODO | เจ้าหน้าที่ระบุได้ทันทีว่า tab ใช้ bundle รุ่นใด |
| P2 | เพิ่ม incident intake checklist: เวลา ICT, branch/user, request ID, video, console และขั้นตอนที่กดล่าสุด | Operations | TODO | ลดเวลาแยก session, frontend และ backend failure |

รายการ TODO เป็นข้อเสนอจากเหตุการณ์นี้ ยังไม่ถือว่าดำเนินการแล้วจนกว่าจะมี commit/PR และหลักฐานทดสอบแยกต่างหาก

## Runbook หากเกิดอาการซ้ำ

1. ห้ามให้ผู้ใช้กดส่งซ้ำทันที ให้ตรวจรายการคำขอและ request ID ก่อน
2. บันทึกเวลา ICT, branch, username, URL, action ล่าสุด และถ่ายวิดีโอให้เห็น pointer
3. ตรวจว่า tab ใช้ production bundle ล่าสุดหรือไม่; ปิด tab เก่าแล้วเปิดใหม่ผ่าน launcher หรือ hard refresh หนึ่งครั้ง
4. แยกอาการตามหลักฐาน:
   - `401` → session expiry/re-authentication
   - `403` → role/branch authorization
   - `5xx` → backend/database failure
   - API `200` แต่หน้าว่าง → client runtime/render failure
5. เทียบ client time กับ Render API logs และ client exception monitoring เมื่อมีระบบดังกล่าว
6. ตรวจ production bundle ไม่ใช่เฉพาะ source/main เพราะ tab เก่าอาจยังถือ bundle รุ่นก่อนหน้า

## บทเรียน

อาการที่ผู้ใช้เรียกว่า “หน้าค้าง” ไม่ใช่ root cause และไม่ควรถูกผูกกับ session, network หรือ backend โดยอัตโนมัติ
เหตุการณ์นี้มีสองสาเหตุที่ให้ภาพภายนอกคล้ายกัน การวิเคราะห์ที่แม่นยำต้องผูก **action ล่าสุดใน UI**, **client exception**
และ **request log ในช่วงเวลาเดียวกัน** เข้าด้วยกัน

เหตุการณ์นี้ยังเป็นการเกิดซ้ำของ class เดียวกับ incident `Code39Barcode` จาก refactor เดียวกัน การแก้ทีละ identifier
ช่วยหยุดเหตุเฉพาะหน้า แต่ guardrail ที่แท้จริงคือ static analysis และ interaction-level tests ที่บังคับใน CI
postmortem นี้เป็นเอกสารแบบ blameless: ปัญหาเกิดจากช่องว่างของกระบวนการและเครื่องมือ ไม่ใช่ความผิดของบุคคลใดบุคคลหนึ่ง
