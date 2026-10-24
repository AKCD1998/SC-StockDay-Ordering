# แท็บเอกสาร ขย.9 สำหรับ admin — ชุดพร้อมตรวจบนเครื่อง

เพิ่มแท็บ เอกสาร ภายในหน้า Branch Stock เฉพาะ admin พร้อมงวดรายเดือน
สถานะทั้งบริษัทและ 000/001/003/004/005 เคสปัญหา หมายเหตุ รุ่นร่าง PDF
และประวัติการเปลี่ยนแปลง การยุติการสืบค้นแยกจากการแก้ไขสำเร็จและการเซ็น
ของเภสัชกร

บันทึกหลักฐานเดิมนำเข้าในฐานข้อมูลแยกจากการเผยแพร่โค้ด ทุกเคสมีวันอ้างอิง
ของหลักฐาน ไม่ใช่ผลตรวจสดหรือการปิดเคสให้อัตโนมัติ รายละเอียดธุรกิจอยู่ใน
ทะเบียนส่วนตัวและส่งเฉพาะ API ของ admin; ตัวอย่างในชุดทดสอบเป็นข้อมูลสมมติ

## ขอบเขตโค้ด

- App.jsx ไม่เปลี่ยน: 2,214 physical lines ทั้งก่อนและหลัง (นับ LF; เนื้อหาตรงกันเมื่อปรับ CRLF)
- BranchStockPanel.jsx เพิ่มเฉพาะ wrapper แท็บ; ส่วนสต็อกเดิมอยู่ใน BranchStockContent
- เจ้าของหน้าใหม่คือ src/ky9-documents/Ky9DocumentsPanel.jsx และ stylesheet เฉพาะหน้า
- Backend คู่กัน: _codex_worktrees/paas-ky9-documents-20261024
- Branch ทั้งสอง repository: codex/ky9-admin-documents-20261024
- ไม่แตะ logic สต็อก, Ada, sync, ข้อมูล OCR หรือแม่แบบสร้าง PDF

## ผลตรวจ

52 tests ของหน้าเอกสาร/สิทธิ์/Branch Stock/หัวตารางผ่าน และ build ผ่าน
Backend: 4 tests รวม PostgreSQL จริงแยกบนเครื่อง และ 13 branch-auth tests ผ่าน
ทดสอบหน้าจอจริงโดยบันทึกเคสตัวอย่างในฐานทดสอบ; สถานะสาขาไม่เปลี่ยนเอง
ตัวอย่างและภาพหน้าจออยู่ output/ky9-documents-review (ไม่รวมใน production build)

คำสั่งตรวจจาก apps/admin-web:

    node ../../node_modules/vitest/vitest.mjs run src/ky9-documents src/BranchStockPanel.test.jsx src/BranchStockHeaderLayout.test.js
    node ../../node_modules/vite/bin/vite.js build

ผู้ใช้อนุมัติให้เผยแพร่หน้าเว็บ/API และติดตั้งทะเบียนเอกสารแล้ว ต้องตรวจ
migration chain ของ backend ก่อน merge และตรวจผลบนระบบจริงหลัง deploy
รายละเอียด API/แผนเผยแพร่/rollback อยู่ docs/ky9-documents/ADMIN_DOCUMENT_REGISTER.md
ใน worktree ของ backend
