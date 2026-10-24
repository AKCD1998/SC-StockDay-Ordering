# Hourly 004: ชุดตรวจทานก่อนปล่อย 24 ตุลาคม 2026

ชุดเดียวนี้รวม Preflight, Update, Status และ Rollback สำหรับ Task เดิมบน SERVER004 ไม่ติดตั้งโดยอัตโนมัติ ไม่สร้างหรือสั่ง Task และไม่สั่ง SQL capture/replay เพื่อทดสอบ

ค่าในชุดนี้: guard 12 วินาทีตามที่ติดตั้งจริง, CIM แต่ละครั้งสูงสุด 8 วินาทีภายใน guard, cleanup child สูงสุดอีก 2 วินาทีแล้วหยุด, SQL ต่อชุด 60 วินาที, เก็บข้อมูล 15 นาที, Task เดิม 20 นาที, CPU ต้องต่ำกว่า 70%, หลบ Full Sync 15 นาที และ cohort เดิม 6,835 รายการ/35 ชุด ไม่มีการติดตั้งข้อเสนอ guard 30 วินาที

สคริปต์อัปเดตต้องใช้สิทธิ์ Administrator เดิม หาก denied หรือ baseline ไม่ตรง จะหยุดโดยไม่เปลี่ยนบัญชี ACL credentials หรือ Task ตัวรันจริงยังทำงานด้วย SYSTEM ตาม Task เดิม ข้อมูลสถานะจาก Administrator ต้องแยกจากผลธรรมชาติของ SYSTEM

ก่อนอนุมัติ ใช้ Windows PowerShell 5.1 ในโฟลเดอร์ที่แตก ZIP:

```powershell
.\hourly004-update.ps1 -Action Status
.\hourly004-update.ps1 -Action Preflight
```

Status อ่านสถานะอย่างเดียว Preflight ตรวจเครื่อง สิทธิ์ ช่วงเวลา กระบวนการ lock CPU baseline และความครบของแพ็กเกจ โดยไม่เรียก production entrypoint และไม่ query สินค้า Preflight ที่ provider ไม่ตอบ ไม่ได้ให้สิทธิ์ข้าม guard

หลังเจ้าของตรวจทาน PR ผลทดสอบ ผลกระทบ และ rollback แล้วจึงใช้:

```powershell
.\hourly004-update.ps1 -Action Update -ReleaseApproved
.\hourly004-update.ps1 -Action Status
```

Update ยืนยัน baseline ของ launcher/core/guard เดิมแบบ byte-for-byte แล้ว stage โค้ดและ dependencies ที่ล็อกไว้ใน protected directory แยก เปลี่ยนเฉพาะ pointer ของ launcher เดิมแบบ atomic ไม่แก้ shared checkout, .env, cohort, SQL permissions, Task actions/principal/schedules, timezone, Full Sync หรือ Transfer Delta ก่อนและหลังสลับตรวจค่าที่ป้องกันไว้ใน RAM ไม่เขียน credentials หรือ Task arguments ลงหลักฐาน

แก้ขั้นติดตั้งเพิ่มเติม 24 ตุลาคม: `File.Replace` บนไฟล์เก่าที่ไม่มี flag auto-inherited ทำให้ security descriptor ต่างจาก baseline จึงหยุดและคืนไฟล์ต้นฉบับแล้ว วิธีใหม่เตรียม backup และ pending ที่สร้างใหม่ด้วย bytes และ security descriptor เดิม ตรวจความตรงกันครบก่อนใช้ same-directory `MoveFileEx` แบบ replace/write-through ไม่เรียก ACL API กับไฟล์ target เดิม ไม่เปลี่ยนบัญชีหรือเพิ่ม privilege หาก owner/group/descriptor ไม่ตรงจะหยุดก่อนสลับ การตรวจเทียบ descriptor ยังเป็นแบบ exact ไม่ผ่อนเกณฑ์ โค้ด runtime และนโยบาย guard/recovery ไม่เปลี่ยนจากชุดตรวจทานเดิม

ห้ามใช้ชุดนี้ทับ guard 30 วินาทีหรือ baseline อื่นที่ติดตั้งไปแล้ว หากพบรุ่นอื่นให้เก็บสถานะและหยุด การ merge PR เพียงอย่างเดียวไม่เปลี่ยน launcher ที่ติดตั้งอยู่

ถ้า activation ล้มหลังเปลี่ยน pointer จะคืนเฉพาะไฟล์ที่ transaction นี้เพิ่งเปลี่ยน และจะไม่ทับการเปลี่ยนของคนอื่น หาก stage ล้มก่อนสลับ ตัวเดิมยังทำงาน และส่วนที่ stage ไว้คงอยู่เพื่อให้ตรวจทาน

Rollback ของการติดตั้งสำเร็จ:

```powershell
.\hourly004-update.ps1 -Action Rollback -ReleaseApproved
.\hourly004-update.ps1 -Action Status
```

Rollback รับเฉพาะ pointer ของชุดนี้และ backup เดิมที่ตรง baseline คงคิว outbox และหลักฐานทั้งหมดไว้ ไม่แก้ configuration หรือ Task และไม่ย้อน guard ของผู้อื่น ตัว release และ backup ยังอยู่เพื่อการตรวจทาน

สถานะอยู่ที่ `complete-on-20261022/latest-slot-result.json` เดิม แยก lastSuccess จากความพยายามปัจจุบัน พร้อมอายุ ความไม่ครบ ขั้น ระยะเวลา งบคงเหลือ การอ่าน/ส่ง/รับ และคิว การเขียน progress เก็บเฉพาะ 12 เหตุการณ์ล่าสุดบนดิสก์ ขณะจบรอบเก็บเหตุการณ์ใน RAM สูงสุด 768 เหตุการณ์ พร้อมจำนวนที่ตัดออก ไม่มี raw error, stderr, command line, connection string, token, payload identity, product code, เลขเอกสาร หรือยอดรายสินค้า

งบเก็บข้อมูล 15 นาทีนับรวมการเปิดตัวรัน/guard, เชื่อม SQL และอ่าน metrics ของรอบนี้ด้วย คงผลสำเร็จ 11:00 ที่ตรวจยืนยันต้นทางและจำนวนรวมส่วนกลางไว้เป็น handoff receipt ซึ่งมีที่มาและอายุชัดเจน หากมีผลสำเร็จในไฟล์เดิมที่ใหม่กว่าให้ใช้ผลนั้น ไม่อ้างว่าประวัติเดิมครบทุกช่วง และไม่รับรองว่าเป็นยอดปัจจุบัน

ข้อมูล CPU เป็น sample และเวลาของ process นี้ SQL IO เป็น delta ของ session เดียว ไม่ใช่ภาระรวม SQL Server และ physical writes ไม่ใช่จำนวนธุรกรรมธุรกิจ เวลารวม guard ไม่ใช่เวลา SQL ข้อมูลนี้ไม่รับรอง snapshot atomicity, clock synchronization หรือความสดของยอดธุรกิจ

Recovery ใหม่ยังปิดตายด้วย `enabled:false` ใน launcher ไม่มี env switch ที่เปิดเองได้ มีเพียง candidate ที่ทดสอบการลอง upload ซ้ำหนึ่งครั้งเมื่อพบ `ECONNRESET` เท่านั้น โดยคง bytes/identity เดิม พัก 500 ms ตรวจ guard อีกครั้ง และนับทุกอย่างในงบ upload เดิม ไม่ retry จาก timeout อย่างเดียว ไม่ลองอ่าน SQL ซ้ำ ไม่ต่อข้อมูลข้ามรอบ และไม่ retry guard/CPU/Full/สิทธิ์/readonly/ข้อมูลไม่ครบ การนำ candidate นี้ไปเปิดใช้ต้องตรวจทานและปล่อยแยกอย่างชัดเจน

เมื่อ child ไม่ยอมจบ จะหยุดรอบและคง lease ที่ตรวจ PID ได้ไว้ ป้องกันการสร้าง child เพิ่ม หาก PID ยังมีอยู่ อ่านไม่ได้ หรือ lease ไม่ครบ ต้องให้ผู้ดูแลตรวจ ไม่เปลี่ยนสิทธิ์และไม่ฆ่า process ของผู้อื่น

หลังติดตั้งให้รอรอบธรรมชาติ ห้าม Task Run/capture ชดเชย ตรวจจำนวนประกาศ แถวจริง สินค้าที่ไม่ซ้ำ ack และคิวจากทั้งสองฝั่งร่วมกัน LastTaskResult=0 อย่างเดียวไม่เพียงพอ ผลจำลองไม่ใช่คำรับรองว่ารอบจริงจะผ่าน
