# Postmortem — 2026-09-17 — หน้า Stock Requests พังจาก `Code39Barcode` หายหลังแยก component

## สถานะ

| รายการ | ค่า |
|---|---|
| สถานะ | แก้ไขและ deploy แล้ว |
| วันที่เกิดเหตุ | 16–17 กันยายน 2026 |
| ระบบที่กระทบ | Admin Web — `#/stock-requests` |
| ระดับผลกระทบ | Major UI failure เฉพาะ workflow คำขอสินค้าระหว่างสาขา |
| การสูญหายของข้อมูล | ไม่พบหลักฐานว่ามีข้อมูลสูญหายหรือถูกเขียนผิด |
| Commit ที่ทำให้เกิด regression | `2cf74b883a2a735837e4c65d380c1a4bb2f2cff0` |
| Pull request ที่นำ regression เข้า `main` | [PR #54](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/54) |
| Commit ที่แก้ไข | `5a30087375ab8dc744bf11b28b7450fad4ac475d` |
| Pull request ที่แก้ไข | [PR #59](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/59) |
| Merge commit ที่แก้ production | `f3f1f678ccd85a4a4416c09786b869380058dcca` |
| Production bundle หลังแก้ | `assets/index-DTtMLY-l.js` |

เวลาทั้งหมดในเอกสารนี้เป็นเวลา Asia/Bangkok (ICT, UTC+7)

## Executive summary

การ refactor ใน PR #54 แยกหน้าคำขอสินค้าระหว่างสาขาออกจากไฟล์
`apps/admin-web/src/App.jsx` ไปเป็น
`apps/admin-web/src/StockRequestsPanel.jsx` แต่ย้ายเฉพาะ component หลักและ
JSX ที่ใช้งาน โดยไม่ได้ย้าย dependency ภายในไฟล์สองรายการตามไปด้วย:

- ตาราง `CODE39_PATTERNS`
- component `Code39Barcode`

`PackingPreviewModal` ที่ถูกย้ายไปไฟล์ใหม่ยังคงเรียก
`<Code39Barcode ... />` อยู่ ดังนั้นเมื่อผู้ใช้เปิดพรีวิวเอกสารสำหรับจัดแพ๊ค
เบราว์เซอร์จึงประเมิน identifier ที่ไม่มีอยู่ใน module scope และโยน
`ReferenceError: Code39Barcode is not defined`

ข้อผิดพลาดเกิดระหว่าง React render และแอปไม่มี error boundary ครอบ workflow
นี้ ทำให้ React tree หลักล้มและผู้ใช้เห็นหน้าว่างแทนที่จะเห็น error เฉพาะ
พรีวิว

Vite production build และ CI เดิมผ่าน เพราะ JavaScript ที่อ้างถึง identifier
ซึ่งไม่มี declaration ยังเป็น syntax ที่ถูกต้อง และ build pipeline ไม่มี
ขั้นตอน static analysis แบบ `no-undef` ส่วนชุดทดสอบเดิมไม่ได้เปิด
packing-preview path จึงไม่ execute บรรทัดที่เสีย

การแก้ไขย้าย barcode renderer และ pattern table ไปอยู่ใน
`StockRequestsPanel.jsx` ซึ่งเป็น module เดียวกับผู้ใช้งาน ลบสำเนาที่ไม่ถูกใช้
ออกจาก `App.jsx` และเพิ่ม regression test สำหรับการ render รหัสคำขอเป็น
Code 39

## ผลกระทบต่อผู้ใช้

### ยืนยันแล้ว

- ผู้ใช้ที่เปิด packing preview จากหน้ารับคำขอสินค้าเจอ JavaScript runtime
  exception
- หน้า Admin Web สามารถกลายเป็นหน้าว่างได้ เนื่องจาก exception หลุดออกจาก
  React render โดยไม่มี error boundary รองรับ
- workflow ดู/พิมพ์เอกสารตรวจนับสินค้าก่อนจัดแพ๊คใช้งานไม่ได้จนกว่า bundle
  ที่แก้แล้วจะถูก deploy

### ไม่พบ

- ไม่พบหลักฐานว่าข้อผิดพลาดนี้เขียนข้อมูลลง backend
- ไม่พบหลักฐานว่าคำขอสินค้า, จำนวนสินค้า หรือคำตอบของสาขาถูกแก้ไขหรือสูญหาย
- การเปิด packing preview เป็น read-only action จึงไม่มี database mutation
  จาก action ที่ทำให้ crash โดยตรง

### ขอบเขตที่ยังไม่ทราบ

- ไม่มี client-side error monitoring ที่บันทึกจำนวนผู้ใช้หรือจำนวนครั้งที่
  exception นี้เกิด จึงระบุ blast radius ที่แน่นอนไม่ได้
- ไม่ทราบเวลาแรกที่ผู้ใช้ production เปิด path ที่เสีย
- bundle ที่มีปัญหาและตรวจพบใน production มี `Last-Modified` เวลา
  16 กันยายน 2026 14:43:41 แต่ไม่มีหลักฐานเพียงพอที่จะบอกว่านี่คือ deployment
  แรกที่มี regression

## สิ่งที่เห็นใน Console และความหมาย

ภาพรายงานเหตุการณ์มีหลายบรรทัด แต่ไม่ใช่ทุกบรรทัดเป็นสาเหตุเดียวกัน:

| Console entry | ความหมาย | เป็นสาเหตุหน้าว่างหรือไม่ |
|---|---|---|
| `ReferenceError: Code39Barcode is not defined` | dependency ของ packing preview หายหลังแยก component | ใช่ — เป็น fatal render error |
| `401 /admin/me` | browser ไม่มี session ที่ backend ยอมรับ ณ เวลานั้น เช่น session หมดอายุหรือยังไม่ได้ login | ไม่ใช่ root cause ของ barcode crash |
| `403` ไปยัง resource ของคำขอ | backend ปฏิเสธสิทธิ์ของ request นั้น; URL ใน screenshot ถูกตัดจึงยังสรุปเหตุผลย่อยไม่ได้ | ไม่ใช่ root cause ของ `ReferenceError` |
| `404 /favicon.ico` | ไม่มี favicon ที่ path มาตรฐาน | ไม่ใช่; เป็น console noise |

401/403 อาจต้องแก้ด้วยการ login ใหม่หรือตรวจ permission แยกต่างหาก แต่ไม่ควร
นำไปรวมกับ root cause ของเหตุการณ์นี้โดยไม่มีหลักฐานเพิ่ม

## Timeline

| เวลา | เหตุการณ์ |
|---|---|
| 16 ก.ย. 11:07:00 | Commit `2cf74b8` แยก `StockRequestsPanel` ออกจาก `App.jsx` และทิ้ง barcode renderer ไว้ในไฟล์เดิม |
| 16 ก.ย. 11:08:30 | PR #54 merge เข้า `main` |
| 16 ก.ย. 14:43:41 | เวลา `Last-Modified` ของ production bundle ที่ยืนยันว่ามีปัญหา |
| 17 ก.ย. ช่วงเช้า | ผู้ใช้รายงานหน้าว่างพร้อม screenshot ของ console; ไม่มีระบบบันทึกเวลา detection ที่ละเอียดกว่านี้ |
| 17 ก.ย. 08:18:56 | Commit `5a30087` แก้ module ownership ของ barcode renderer และเพิ่ม regression test |
| 17 ก.ย. 08:20:27 | PR #59 merge เข้า `main` หลัง CI ผ่าน |
| 17 ก.ย. 08:20:54 | Render เริ่มเสิร์ฟ bundle ใหม่ `index-DTtMLY-l.js` |
| 17 ก.ย. หลัง deploy | ทดสอบ production bundle โดยเปิด Stock Requests → ขยาย incoming request → เปิด packing preview; barcode `SRQ-001` render เป็น SVG 45 bars และไม่มี JavaScript page error |

## Root cause

### สาเหตุโดยตรง

`PackingPreviewModal` ถูกย้ายจาก `App.jsx` ไป `StockRequestsPanel.jsx` แต่
`Code39Barcode` และ `CODE39_PATTERNS` ยังอยู่ใน `App.jsx` และไม่ได้ถูก export /
import เข้ามาในไฟล์ใหม่ จึงไม่มี binding ชื่อ `Code39Barcode` ใน lexical scope
ของ component ที่ใช้งาน

ก่อน refactor โครงสร้างเป็น:

```text
App.jsx
├── CODE39_PATTERNS
├── Code39Barcode
└── PackingPreviewModal → Code39Barcode
```

หลัง refactor ที่มีปัญหา:

```text
App.jsx
├── CODE39_PATTERNS        (ไม่มีผู้ใช้ในไฟล์นี้แล้ว)
└── Code39Barcode          (ไม่มีผู้ใช้ในไฟล์นี้แล้ว)

StockRequestsPanel.jsx
└── PackingPreviewModal → Code39Barcode  (ไม่มี declaration/import)
```

หลังแก้ไข:

```text
StockRequestsPanel.jsx
├── CODE39_PATTERNS
├── Code39Barcode
└── PackingPreviewModal → Code39Barcode
```

### ปัจจัยร่วม

1. การ review การย้าย component ตรวจความครบของ JSX และ exports แต่ไม่ได้ทำ
   dependency inventory ของ identifier ที่ component ใช้
2. build tool ตรวจ syntax และ module imports แต่ไม่ได้ทำหน้าที่แทน linter
   สำหรับ unresolved identifier ทุกกรณี
3. CI ไม่มี ESLint rule `no-undef` หรือ static check ที่เทียบ identifier กับ
   module scope
4. characterization tests เดิม render เฉพาะ tab/list/draft states และไม่ได้
   เปิด incoming request แล้วกด packing preview
5. ไม่มี production smoke test สำหรับ critical interaction path นี้
6. ไม่มี React error boundary จำกัดผลกระทบ จึงเปลี่ยน component-level failure
   ให้กลายเป็นหน้าว่างทั้งแอป
7. ไม่มี frontend error monitoring จึงต้องรอรายงานพร้อม screenshot จากผู้ใช้

## Five Whys

1. **ทำไมหน้าจึงว่าง?**  React render โยน exception ที่ไม่มี error boundary
   จัดการ
2. **ทำไม React render จึงโยน exception?**  `PackingPreviewModal` เรียก
   `Code39Barcode` ที่ไม่มี declaration ใน module
3. **ทำไม declaration หาย?**  การ extract component ย้าย consumer แต่ไม่ได้
   ย้ายหรือ import local helper และ pattern table
4. **ทำไม CI ไม่จับ?**  build ไม่ได้เป็น `no-undef` checker และ test suite
   ไม่ execute packing-preview render path
5. **ทำไม production เป็นผู้ตรวจพบ?**  ไม่มี critical-path browser smoke test
   และไม่มี client-side exception monitoring

## การแก้ไขที่ทำแล้ว

1. ย้าย `CODE39_PATTERNS` และ `Code39Barcode` ไปไว้ใน
   `apps/admin-web/src/StockRequestsPanel.jsx`
2. ลบ dead definitions ออกจาก `apps/admin-web/src/App.jsx`
3. export `Code39Barcode` เพื่อให้ทดสอบ behavior โดยตรงได้
4. เพิ่ม regression test ที่ยืนยันว่า:
   - input ถูก trim และเปลี่ยนเป็นตัวพิมพ์ใหญ่
   - accessible label และข้อความแสดง `SRQ-001`
   - SVG มี `<rect>` อย่างน้อยหนึ่งแท่ง
5. รัน admin-web test suite: 25 files, 121 tests ผ่านทั้งหมด
6. รัน Vite production build สำเร็จ
7. รัน browser flow บน local production build สำเร็จและไม่มี console error
8. GitHub Actions run `35170100591` ผ่าน workspace tests และ build ของ
   Admin Web, Order Web และ Lookup Web
9. หลัง deploy ทดสอบ exact production bundle ผ่าน browser โดย mock เฉพาะ
   session/API data; `SRQ-001` render เป็น 45 SVG bars และไม่มี page error

## สิ่งที่ทำได้ดี

- screenshot มี stack trace และชื่อ identifier ชัดเจน ทำให้แยก fatal error
  ออกจาก network noise ได้เร็ว
- git history ระบุ commit ที่นำ regression เข้ามาได้ตรงจุด
- แก้ไขบน branch ที่สร้างจาก `origin/main` ล่าสุด ไม่ปะปนกับ working tree เก่า
  ที่มีงานอื่นค้างอยู่
- มีทั้ง unit/regression verification, full suite, production build, CI และ
  browser verification ก่อนและหลัง deploy
- การแก้ไขไม่เปลี่ยน API หรือข้อมูล production

## สิ่งที่ต้องปรับปรุง

| Priority | Action | สถานะ | เหตุผล |
|---|---|---|---|
| P0 | เพิ่ม ESLint หรือ static check ที่เปิด `no-undef` ใน CI ของ Admin Web | TODO | ให้ unresolved identifier ทำให้ PR fail ก่อน merge |
| P1 | เพิ่ม interaction test: incoming request → expand → packing preview → barcode visible | TODO | ทดสอบ user path ที่เคยเสียโดยตรง ไม่ใช่เฉพาะ helper |
| P1 | เพิ่ม production-like browser smoke tests สำหรับ critical admin routes | TODO | จับปัญหาที่ unit/build ไม่ execute |
| P1 | เพิ่ม checklist สำหรับ component extraction: props, local helpers, constants, hooks, styles, exports/imports และ tests | TODO | ลดการทิ้ง hidden dependency ไว้ในไฟล์ต้นทาง |
| P2 | เพิ่ม React error boundary ที่ระดับ route/panel | TODO | ให้ component เดียวพังแล้วแสดง recovery UI แทนหน้าว่างทั้งแอป |
| P2 | เพิ่ม client-side exception monitoring พร้อม release/bundle identifier | TODO | รู้จำนวนผู้ใช้และเวลาเกิดโดยไม่ต้องรอ screenshot |
| P3 | เพิ่ม favicon หรือจัดการ path ให้ถูกต้อง | TODO | ลด console noise เพื่อให้ fatal errors เด่นขึ้น |

รายการ TODO เป็นข้อเสนอจากเหตุการณ์นี้ ยังไม่ถือว่าดำเนินการแล้วจนกว่าจะมี
commit/PR และหลักฐานทดสอบแยกต่างหาก

## Guardrail สำหรับ refactor ครั้งต่อไป

ก่อน merge งานที่ย้าย component ข้ามไฟล์ ให้ตรวจอย่างน้อย:

1. ค้นหา identifier ทุกตัวที่ component อ้างถึงและจัดประเภทว่าเป็น import,
   prop, local helper, constant, hook, style หรือ browser global
2. ค้นหา helper/constant ที่เหลือในไฟล์ต้นทางแต่ไม่มีผู้ใช้ เพื่อจับ dependency
   ที่ลืมย้าย
3. เปิด interaction ที่ลึกที่สุดของ component อย่างน้อยหนึ่งครั้งใน test หรือ
   browser ไม่ใช่ตรวจแค่หน้าแรก
4. รัน static analysis, test suite และ production build แยกกัน เพราะทั้งสาม
   ตรวจคนละชนิดของความผิดพลาด
5. ถ้า interaction มี portal/modal ให้ทดสอบตอน modal เปิดจริง

## บทเรียน

การ extract component ที่ดูเหมือนเป็นการย้ายโค้ดเชิงโครงสร้างสามารถเปลี่ยน
lexical scope และทำให้ local dependencies หายได้ แม้ diff จะดูเหมือนรักษา JSX
ครบและ production build จะผ่าน การป้องกันที่เหมาะสมต้องใช้ทั้ง static analysis
และ interaction-level test ไม่ควรพึ่ง bundler เพียงอย่างเดียว

เหตุการณ์นี้เป็นข้อบกพร่องของกระบวนการและ guardrail ไม่ใช่ความผิดของบุคคลใด
บุคคลหนึ่ง เป้าหมายของ postmortem คือทำให้ refactor แบบเดียวกันปลอดภัยขึ้นใน
ครั้งต่อไป

