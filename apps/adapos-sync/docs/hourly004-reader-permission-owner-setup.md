# ตั้งสิทธิ์อ่าน Hourly004 ครั้งเดียว — สำหรับผู้ดูแล SERVER004

ชุดนี้ให้ผู้ใช้รันเอง การรัน
`Apply -ApproveReadScope` คือการอนุมัติและดำเนินการตามขอบเขตที่เสนอใน
`hourly004-direct-read-permissions-20261112.json` เท่านั้น

ไม่ต้องโหลด ZIP/ตัวตรวจ ไม่ต้องแก้เมนู Security ทีละจุด ใช้ Windows PowerShell
บน SERVER004 ที่เปิดด้วย Run as administrator และบัญชี Administrator เดิม
โหลด source จาก commit ที่ตรวจแล้วของ PR87 เข้า RAM แล้วเรียก helper เดียว
`scripts/Set-Hourly004ReaderPermissions.ps1` ไม่ใช้ URL สาขาที่เปลี่ยนได้

## ผู้ใช้ทำครั้งเดียว

1. เข้า SERVER004 เปิด Start พิมพ์ Windows PowerShell คลิกขวา Run as administrator
   และยืนยันหน้าต่าง Windows ตามปกติ ไม่ต้องเปิด ChatGPT/Codex แบบ Administrator
2. วางคำสั่งบรรทัดเดียวที่แชตหลักส่งให้ รอ JSON โดยเปิดหน้าต่างไว้
3. ถ้า status เป็น `READ_PERMISSIONS_APPLIED_NATIVE_ACCEPTANCE_PENDING` แจ้งแชตหลัก
   ว่า “รันแล้ว” ผู้ใช้ไม่ต้องอ่าน ACL หรือส่ง snapshot/raw logs
   หากหยุด ให้คงหน้าต่างไว้และแจ้ง errorCode ไม่กดรันซ้ำเอง

การเชื่อม Ozymandias เดิมยังใช้ต่อ ไม่เปลี่ยน sandbox/profile/approval policy
หรือ credentials หาก native token ยังติดข้อจำกัดอีกชั้นหลังการให้สิทธิ์ Windows
ให้หยุดและเสนอขอบเขตใหม่ ไม่เพิ่มกลุ่ม/สิทธิ์หรือลดข้อจำกัดเอง

## ขอบเขตและการรักษางานเดิม

- ตรวจเครื่อง SERVER004, เวลาไทย, native PS5.1 และ Administrator ที่ยกระดับแล้ว
  ก่อนแตะสิทธิ์ ตรวจ SID บัญชี sandbox เดิมจาก Windows และต้องอยู่ในเครื่องเดียวกัน
- เพิ่มสิทธิ์ตาม manifest: 3 ไฟล์, metadata ของ 4 directory, queue directory
  และ 11 Task เฉพาะ Hourly004 รวม 19 วัตถุ ไม่เพิ่มสิทธิ์รัน/แก้ Task
  ไม่ให้สิทธิ์อ่านเนื้อหา payload ในคิว และไม่ให้สิทธิ์อ่านทั้งต้นไม้หลักฐาน
- สิทธิ์ระดับ Windows ผูกกับบัญชี sandbox งานอื่นที่ใช้บัญชีเดียวกันอาจอ่าน
  วัตถุชุดนี้ได้ด้วย ไม่อ้างว่าเป็นสิทธิ์ OS เฉพาะชื่อ Ozymandias
- หยุดหาก Hourly กำลังรัน/ใกล้รอบ 5 นาที, Full Sync กำลังรัน/ใกล้รอบ 15 นาที,
  queue ไม่ว่าง, object/type/ACL ไม่ตรง หรือมีสิทธิ์เดิมที่ต้องตรวจเพิ่ม
  ไม่มีการหยุดงานธุรกิจเพื่อบังคับให้ผ่าน
- ตรวจว่าไม่มีงาน Administrator อื่นกำลังแก้ ACL/Task ชุดเดียวกันระหว่างนี้
  มีการตรวจ identity/definition/DACL ซ้ำหลัง quiet check แต่ Task API ไม่มี
  atomic compare-and-swap กับ Administrator อีกคน จึงไม่รับรองการแก้พร้อมกัน
- ไม่รัน Task/Sync/replay/capture/upload ไม่แตะ runtime code, config หรือ
  Full Sync/Delta ตรวจ Full Sync definitions/ACL และ config bytes ก่อนหลังใน RAM
  ไม่แสดงหรือสำรองค่าลับจาก config

## สำรอง ผลลัพธ์ และการย้อนกลับ

เก็บ before-image ของสิทธิ์ไว้ก่อนเปลี่ยนจุดแรกใน directory ที่มีเฉพาะ
SYSTEM/Administrators ใต้ protected directory เดิม:
`complete-on-20261022\reader-permission-setup-20261112`
ไม่มี credentials, Task arguments หรือ XML ใน snapshot ไม่พิมพ์ SDDL/SID/file IDs
ออกมา ผลสรุปปลอดภัยอยู่ `apply-result.json` ให้แชตหลักอ่านผ่าน SMB เดิม

helper มี `Plan`, `Apply`, `Resume`, `Status`, `Rollback` ค่าเริ่มต้นคือ Plan
Apply/Resume/Rollback ต้องมี `-ApproveReadScope` โดยผู้ดูแลเดิม ไม่มี self-elevation,
เพิ่ม user/group, เปลี่ยน security policy หรือ remote-write workaround

`Status` อ่านสิทธิ์อย่างเดียว ไม่ต้องรอ quiet และไม่เขียนผล/อ่าน config
Rollback ใช้ helper/commit เดิมกับ `-Action Rollback -ApproveReadScope`
คืนเฉพาะ before-image เมื่อวัตถุและ current after-image ตรงที่บันทึกไว้
เก็บสิทธิ์ที่มีอยู่ก่อน ไม่ทับ foreign changes ไม่ลบ snapshot/evidence/queue
ถ้าติดตั้งค้างให้ตรวจ Status และทบทวน snapshot ก่อนเลือก Resume หรือ Rollback
ไม่ Apply ซ้ำเพื่อทำต่อแบบ blind
ไม่มี automatic retry/rollback/continuation

## เหตุ readback วันที่ 12 พ.ย. 2026 และการทำต่อ

ผู้ดูแลรัน Apply บน SERVER004 เวลา 16:30:55 +07 และหยุดที่วัตถุแรกด้วย
`PERMISSION_READBACK_DIFFER` ก่อน native acceptance การอ่าน SMB/Task แบบ
read-only หลังเหตุยืนยันว่าไฟล์แรกมี ACE ตรง expected after-image ทุก byte/ลำดับ
แต่ Windows เพิ่ม `SE_DACL_AUTO_INHERITED` (0x400) ส่วนอีก 18 วัตถุยังตรง
before-image และ identity ของไฟล์/ไดเรกทอรีทั้ง 8 ตรง snapshot
`objectsChanged: 0` ในรายงานเดิมเป็นจำนวนที่ตรวจผ่าน ไม่ได้แปลว่าไม่ได้เขียน

แก้เฉพาะการเทียบหลังอ่าน: ยอมรับความต่างของ 0x400 เท่านั้น เปรียบเทียบ
ACL binary ทั้งชุด รวม revision, ลำดับ, masks, ACE/inheritance flags และ
control flags อื่นอย่างเคร่งครัด ไม่ล้าง AI จากสิทธิ์จริง ไม่เรียง/รวม ACE
และไม่เปลี่ยน canonicalization หรือ validation ของ snapshot เดิม

เมื่อแชตหลักตรวจ revision/CI และ snapshot แล้ว ผู้ดูแลใช้ helper commit ใหม่
ด้วย `-Action Resume -ApproveReadScope` ในหน้าต่างเดิม แทนคำสั่ง Apply เก่า
Resume ต้องพบ before.json เดิมที่ตรวจครบ SID/spec/identity/after-image และ
ทั้ง 19 วัตถุต้องตรง before หรือ after ก่อนเขียนจุดแรก ข้าม after-image ที่
สำเร็จแล้ว และเพิ่มเฉพาะจุดที่เหลือ ไม่สร้าง/ทับ/ลบ snapshot เดิม
หาก snapshot หาย/ผิดหรือพบ foreign change ให้หยุด ไม่ retry/rollback เอง

ผล Resume อยู่ `resume-result.json` แยกจาก apply-result เดิม โดยเก็บแบบ
create-once ไม่ทับหลักฐานความล้มเหลว หากต้องทำต่อหลัง Resume ที่ล้มอีก
ให้ทบทวนสถานะจริงกับผลในหน้าต่างก่อน เพราะไฟล์ผลเก่าจะไม่ถูกเขียนทับ
สถานะสำเร็จคือ `READ_PERMISSIONS_RESUMED_NATIVE_ACCEPTANCE_PENDING`
ซึ่งยังไม่ใช่หลักฐานว่า Ozymandias อ่านจริงได้

## หลังผู้ใช้รัน

แชตหลักอ่านผลสรุปและตรวจจริงผ่านสิทธิ์เดิม จากนั้นให้ Ozymandias ใช้ native
context เดิมทำ owned-child deadline proof และ receipt-profile Status จริง
ต้องอ่าน receipt/ACK, pointer, 11 Task และ queue ผ่านก่อนเพิ่มการอ่านต้นทาง
เข้าตารางคลาวด์เดิม ไม่สร้างตารางใหม่ ไม่ถือว่า ACL setup PASS คือ native PASS
และไม่สั่งรันชดเชย ทดสอบการใช้ซ้ำตามรอบธรรมชาติต่อ

## ผลทดสอบและข้อจำกัด

ทดสอบ controller Plan/Apply/Resume/Status/Rollback บน PS5.1 ผ่าน provider จำลอง,
partial writes, write-then-error, missing/tampered backup, foreign ACL/identity
change ระหว่าง quiet, preservation failure และ pre-existing grants
ทดสอบ SetSecurityInfo บน handle กับไฟล์/ไดเรกทอรีชั่วคราวจริง รวมการสืบทอด
metadata-only ไปยัง child โดยไม่มี ReadData ไม่มี production permission write
มี wrong-host gate จริงและผู้ตรวจแยกตรวจแก้ findings แล้ว

เพิ่ม regression ตามเหตุจริง: seed ไฟล์ชั่วคราวที่มี inherited ACE แต่ไม่มี
AI ด้วย legacy SetFileSecurity แล้วเรียก SetSecurityInfo บน handle จริง
พิสูจน์ว่ามีเฉพาะ AI เพิ่มและ ACE binary เดิมตรงกัน ทดสอบ Resume จาก
1 after/18 before โดย snapshot ไม่เปลี่ยน, ทำซ้ำไม่เขียน, rollback และ
ปฏิเสธ protection/AutoInheritRequired/ACE order/mask/deny/extra/identity
ที่ต่าง ไม่ใช้ผลจำลองแทนการตรวจ Task/receipt บน SERVER004 จริง

ผลจำลองไม่ยืนยันว่า Task service, filesystem หรือ native policy บน SERVER004
จะผ่านแน่นอน ยังต้องตรวจหลังการรันจริง การทดสอบแก้นี้ไม่ได้เขียน production
เพิ่มจาก owner Apply ที่หยุดข้างต้น คง guard12/recoveryOFF ตามนโยบาย ไม่ใช้ค่า expected เป็นหลักฐาน
ว่าอ่าน policy จาก runtime แล้ว

API ที่ใช้: [Task read/execute แยกกัน](https://learn.microsoft.com/en-us/windows/win32/taskschd/security-contexts-for-running-tasks),
[SetSecurityDescriptor flags](https://learn.microsoft.com/en-us/windows/win32/taskschd/registeredtask-setsecuritydescriptor),
[SetSecurityInfo บน handle](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-setsecurityinfo),
[ความหมาย control flags](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptor-control)
