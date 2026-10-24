# Hourly 004 checkpoint v4: ชุดตรวจรับก่อนติดตั้ง

ชุดเดียวนี้มี Preflight, Update, Status, Rollback และ Recover สำหรับ Task เดิมบน SERVER004 ยังไม่ติดตั้งอัตโนมัติ ไม่สร้างหรือสั่ง Task ไม่เรียก production entrypoint เพื่อทดสอบ และไม่สั่ง capture/replay จริง

รุ่นนี้ต่อจาก stability-20261024 ที่ติดตั้งแล้ว ใช้ release แยก stability-20261024-checkpoint-v4 และ backup pointer ชื่อใหม่ ไม่เขียนทับ release v1, backup ดั้งเดิม หรือ staging ที่ค้าง รับเฉพาะ pointer/core/guard/source และต้นไม้ release v1 ที่ตรง baseline รุ่นอื่นหรือไฟล์เปลี่ยนต้องหยุดให้ตรวจทาน ห้ามใช้ทับ guard 30 วินาทีที่พักไว้

## เกณฑ์เดิม

Guard คง 12 วินาที, CIM แต่ละครั้งสูงสุด 8 วินาทีภายใน guard, cleanup child เดิมสูงสุดอีก 2 วินาทีแล้วหยุด ไม่ขยายเวลาเหล่านี้ SQL ต่อชุด 60 วินาที, collection 900,000 ms, Task 20 นาที, CPU ต้องต่ำกว่า 70%, หลบ Full Sync 15 นาที และ cohort 6,835 รายการ/ชุดละ 200/35 ชุด Acceptance window และ readonly boundary เดิมคงอยู่

Upload recovery ใหม่ยังปิดด้วย enabled:false ไม่มี env switch เปิดเอง ไม่ retry SQL/guard/CPU/Full/readonly/การอ่านไม่ครบ ไม่ต่อผลต่างรอบ ไม่เปลี่ยนสูตร หน่วย mapping หรือบัญชีจอง ไม่แก้ Full Sync/Transfer Delta/สาขาอื่น

## Writer และ critical state

แยก progress ที่ใช้แสดงผลออกจาก outbox และ durable receipt Progress เป็น async แบบ coalesced มีเพียงหนึ่งงานกำลังเขียนและหนึ่งงานรอ ไม่รอ file I/O ภายใน callback ของ guard หรือ SQL ใช้ latest-slot-result.json เดิม ไม่สร้าง monitor/dashboard

หนึ่ง publication ลองสูงสุด 3 ครั้ง พัก 10/25 ms เฉพาะ contention หรือ EPERM ที่ขั้น rename ซึ่งบน Windows ยังแยก access กับ contention ไม่ได้ ไม่ถือเป็นหลักฐาน ACL ผิด EACCES/ENOSPC/EDQUOT/EROFS หรือ I/O อื่นไม่ถูกแปลงเป็น EACCES และไม่ retry เพื่อข้ามสิทธิ์ เก็บ code/category/stage จาก whitelist ไม่มี raw error, path, stderr, payload identity หรือค่าลับในสถานะ/รายงาน

งบ display I/O รวมทั้งรอบ 2,000 ms รวมเวลารอ retry และ fsync กัน 250 ms สำหรับผลสุดท้าย Progress ไม่เกิน 128 publications ไม่ถี่กว่า 1 วินาที ขนาดสูงสุด 256 KiB เมื่อ I/O ค้างถึง deadline หยุดเริ่มงานแสดงผลเพิ่ม เวลายังนับใน collection/delivery/Task budget เดิม ไม่เริ่ม budget ใหม่ หาก display I/O ของตัวเองยังค้างหลังปิด SQL/locks และ critical state แล้ว runtime จบเฉพาะ process ตัวเอง Lease คงไว้จน native I/O จบหรือยืนยันได้ว่า PID ตายแล้ว ไม่ฆ่า process ผู้อื่น

Durable metadata ใช้ snapshot สองไฟล์ข้างไฟล์สถานะ ไม่เกิน 8 KiB ต่อไฟล์ ตรวจ generation และ integrity ภายใน เขียนสลับไฟล์ที่ไม่ active แบบ in-place + fsync โดยไม่ rename จึงคงสำเนา valid เดิมเมื่ออีกสำเนาขาดกลางทาง มีเฉพาะ attempt, ผลสำเร็จล่าสุด และ ACK metadata ที่จำเป็น ไม่มีข้อมูลยอดรายสินค้า ค่า identity/integrity ภายในไม่ถูกฉายออก Status/รายงาน

บันทึก attempt ก่อนเริ่ม SQL และบันทึก ACK หลังตรวจความครบตรง payload แต่ก่อนลบ outbox หาก outbox/receipt บันทึกไม่ได้ให้หยุดอย่างปลอดภัย คง body เดิมไว้ ACK หายหรือ process เริ่มใหม่จึงใช้ body/identity และ idempotency เดิม ไม่อ่าน SQL ซ้ำเพื่อ replay ไม่เพิ่ม recovery upload ใน production รุ่นนี้ ACK ซ้ำใน attempt เดียวไม่สร้าง durable generation เพิ่มโดยไม่จำเป็น

เมื่อ progress ล้มแล้วเขียนสำเร็จ failure ปัจจุบันกลับเป็น false แยกจาก everFailed/failureCount ไม่ใช้ sticky boolean ตัด collection หากเผยแพร่ผลปัจจุบันไม่ได้ Status เป็น unknown และค่าปัจจุบันเป็น null คง lastSuccess พร้อมเวลา สถานะและอายุ ผลธุรกิจที่ ACK ครบอาจบันทึกเป็นผลสำเร็จในอดีตได้ แต่ไม่ใช้แทนสถานะปัจจุบันที่เผยแพร่ไม่ได้ และไม่รับรองว่าเป็นยอดปัจจุบัน

Status เป็น reader อย่างเดียว ไม่ import config/SQL/runtime main ตรวจ attempt sequence, slot, เวลา, final publication sequence และ Task ล่าสุดก่อนฉายผลปัจจุบัน หากข้อมูล Task อ่านไม่ได้/ไม่ตรงตาม runtime mode หรือ view เก่า/ขาดกลางทาง ให้ unknown และคง lastSuccess ที่ตรวจรูปแบบได้ Progress ระหว่างรันแสดงเป็น observation ณ เวลานั้นกับ currentStateVerified:false

## ใช้หลังตรวจรับ

ใช้ Windows PowerShell 5.1 และ Administrator เดิมในโฟลเดอร์ที่แตก ZIP:

```powershell
.\hourly004-update.ps1 -Action Status
.\hourly004-update.ps1 -Action Preflight
```

Preflight ตรวจ host/timezone/สิทธิ์เดิม, processes, locks, CPU, Task/Full Sync window, source และ integrity ของ release/แพ็กเกจ ไม่ query สินค้า หาก denied หยุดเฉพาะส่วนนั้น ห้ามเปลี่ยนบัญชี ACL credentials หรือช่องทาง

หลังเจ้าของตรวจรับ diff ผลทดสอบ ผลกระทบและ rollback ของ v4 แล้วจึงใช้:

```powershell
.\hourly004-update.ps1 -Action Update -ReleaseApproved
.\hourly004-update.ps1 -Action Status
```

Update stage dependencies ที่ล็อกไว้ใน directory แยก ตรวจความครบ แล้วสลับเฉพาะ pointer เดิม ตรวจ source/config/cohort, owner/group/security descriptor และ Task XML/SDDL แบบ exact ก่อน/หลัง ไม่แก้ shared checkout, .env, credentials, permissions, Task actions/principal/schedule/limit หรือ timezone เตรียม descriptor กับ backup/pending ที่ transaction สร้างใหม่เท่านั้น ไม่เรียก ACL API กับ target เดิม

ถ้า activation ล้ม คืนเฉพาะ pointer ที่ transaction นี้เป็นเจ้าของจาก backup ที่ตรวจแล้ว ไม่ทับ foreign change ถ้า stage ล้มก่อนสลับ v1 ยังทำงานและเก็บ staging ให้ตรวจ

```powershell
.\hourly004-update.ps1 -Action Rollback -ReleaseApproved
.\hourly004-update.ps1 -Action Status
```

Rollback รับเฉพาะ v3 ของชุดนี้ คืน pointer v1 ที่ตรึงไว้ ตรวจต้นไม้ v1 ก่อนคืน คง outbox, receipts, หลักฐาน, release และ backup ทั้งหมด ไม่คืนไป launcher ดั้งเดิมวันที่ 22 ไม่ย้อน guard ของผู้อื่น ไม่ลบ lease ที่อ่านไม่ได้หรือ PID ยังมีอยู่

## หลักฐานและข้อจำกัด

รอบธรรมชาติ 15:00 วันที่ 24 ตุลาคมหยุดหลัง 1,400/6,835 รายการจาก writer เดิม โดย sticky persistenceFailed และ EACCES ที่ runtime สร้างเองทำให้เสียเหตุเดิม Last success 14:00 ยังอยู่ ผลตรวจส่วนกลางเดิมมี capture 15:00 จำนวน 0 สาเหตุระดับ Windows ของรอบนั้นยังไม่พิสูจน์ ห้ามสรุป ACL ผิดหรือโทษ reader รายใด

Tests ใช้ synthetic payload, SQL/network stubs และ filesystem fixtures แยกจาก production มี reader ค้างจริงบน Windows ทั้งมี/ไม่มี delete sharing, rename ล้มชั่วคราว/ถาวร, disk full/denied, deadline, process restart, torn receipt, ACK หาย/ซ้ำ และ controller จริงบน PowerShell 5.1 ทั้ง Update/Status/Rollback รวม postflight rollback ไม่ใช้ production entrypoint/Task ผลจำลองไม่ใช่ผลธรรมชาติของ v4 จำนวน tests ไม่รับรองความเสถียร

Critical OS write/fsync ไม่สามารถ preempt กลาง system call ด้วย JavaScript จึงยังอาศัย execution limit 20 นาทีเดิมของ Task ตรวจ budget ก่อน/หลัง critical call ไม่เริ่ม retry เมื่อหมดเวลา งบ display เป็น deadline สำหรับการรอ/เริ่ม operation ไม่ใช่คำรับรอง kernel I/O จบในเวลานั้น EACCES/ENOSPC ใช้ fault injection ไม่แก้ ACL หรือทำดิสก์ production เต็มจริง

Rollback v1 คืนพฤติกรรม writer เดิม จึงเป็นการย้อนโค้ด ไม่ใช่รับรองว่าปัญหาเดิมหาย เก็บ v2 receipts ให้ตรวจต่อ ไม่ลบ/แก้หลักฐานเพื่อให้ผ่าน

CPU เป็น samples ไม่ต่อเนื่อง SQL IO เป็น delta ของ session เดียว ไม่ใช่ภาระรวม server; physical writes ไม่ใช่จำนวนธุรกรรม ไม่รับรอง snapshot atomicity, clock synchronization หรือความสดของยอดธุรกิจ

หลังติดตั้งที่ได้รับอนุมัติใหม่ รอรอบธรรมชาติ ตรวจต้นทางและส่วนกลางร่วมกัน: capture/แถวจริง/สินค้าที่ไม่ซ้ำ/ACK/คิวต้องตรงกัน LastTaskResult=0 อย่างเดียวไม่พอ ห้าม Task Run, Sync, replay หรือ capture ชดเชย


## แก้ข้อพบจากการตรวจรับรอบนี้

ตรึง predecessor เป็น bytes + file identity + security descriptor ก่อน staging เทียบกับ pointer ที่ยอมรับจาก baseline ไม่รับ bytes ที่มาพบหลัง staging เป็น baseline ใหม่ Update และ Rollback ใช้กฎเดียวกัน

ก่อนเปลี่ยน namespace เปิด Windows handle ที่กันการเขียน/rename ของผู้อื่น ตรวจ pin อีกครั้ง แล้วย้ายไฟล์เดิมทั้ง object เป็น before-image backup ผ่าน handle ของมัน การเผยแพร่ candidate และการคืน before-image ใช้ rename แบบ ReplaceIfExists=false ทุกครั้ง หากมี foreign file แทรกให้หยุดและรักษาไฟล์นั้น ไม่ทับ ไม่แก้ ACL เดิม Candidate ถูกยึดด้วย handle ระหว่าง postflight จึงปฏิเสธการเขียน/replace ที่ขัดกับ sharing; ถ้า postflight ล้มให้กู้เฉพาะ object ที่ transaction เป็นเจ้าของ และใช้หลักไม่แทนที่ชื่อปลายทางเช่นเดิม

ข้อแลกเปลี่ยน: rename สองขั้นยังมีช่วงที่ชื่อ launcher ว่าง หาก process ล้ม Task ถัดไปอาจหา entrypoint ไม่พบจนผู้ดูแลกู้สำเร็จ รุ่นนี้เพิ่ม Recover ในชุดเดียวตามหลักฐานที่เขียนเสร็จก่อนย้ายไฟล์ ไม่เติม pointer หรือย้อน production อัตโนมัติ และไม่ลบ pending/backup เพื่อให้ผ่าน

Guard ใช้ absolute monotonic deadline ตั้งแต่ก่อน lease/diagnostics/spawn รวม preparation ทั้งหมด ตั้ง timer ด้วยเวลาที่เหลือ ตรวจ deadline ก่อน spawn ก่อนรับ Ready/close และก่อน resolve success แม้ timer callback ยังไม่ทำงาน Cleanup child สูงสุด 2 วินาทีแยกจาก deadline เดิม ถ้ายังไม่ยืนยัน child จบให้เก็บ lease ไม่เพิ่ม retry

Status หลัง Rollback ใช้ status/slot/start/inspection/finish จาก v1 view และ Task attempt เดียวกัน ไม่ยืม slot จาก receipt ของ v2/v3 ที่เก็บไว้ Receipts เดิมเป็นประวัติ/last success เท่านั้น Current attempt ต้องตรงวัน/slot ไทย ไม่อยู่อนาคตเกิน tolerance 2 วินาที และจบใน Task window 20 นาที Task metadata ต้อง verified และไม่เก่าเกิน 1 ชั่วโมง + tolerance สำหรับการฉาย latest attempt; เกณฑ์นี้ไม่ขยาย capture/acceptance window v4 ต้องตรง receipt attempt ภายใน 2 วินาที v1 อนุญาตเวลาตั้งต้นถึง inspection ภายใน Task window เพื่อรวม guard startup ของ v1 หากกำลังรัน อ่านไม่ได้ หรือหลักฐานไม่ตรง ให้ unknown พร้อม null สำหรับ slot/เวลา/จำนวนปัจจุบัน

ถ้า v1 view เสียทั้งไฟล์ ผล v1 ล่าสุดที่มีอยู่เฉพาะไฟล์นั้นอาจกู้ไม่ได้ Status อ่านอย่างเดียวจึงไม่สร้าง receipt ใหม่หรือเดาข้อมูล ให้ unknown สำหรับ current และแสดงได้เพียงผลในอดีตที่ยังตรวจรูปแบบได้ ไม่ถือว่าประวัติที่เหลือครบ

อ้างอิง Windows API: https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info และ https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea เงื่อนไข sharing และ no-replace ใช้ร่วมกับ native PowerShell 5.1 fixtures ไม่ใช้เอกสารแทนการทดสอบ

## กู้การติดตั้งค้างจากชุดนี้ หลังอนุมัติแยกเท่านั้น

Recover เป็นการกู้ **การติดตั้ง** ไม่เปิด upload recovery ซึ่งยัง OFF และไม่มีสิทธิ์ใช้ production จากการส่งตรวจครั้งนี้ คำสั่งสำหรับผู้ดูแลหลังได้รับอนุมัติใหม่ เรียงลำดับดังนี้:

```powershell
.\hourly004-update.ps1 -Action Status
# อ่าน installationTransaction: ต้อง recoverable และ owner orphan-proven
.\hourly004-update.ps1 -Action Recover -ReleaseApproved
.\hourly004-update.ps1 -Action Status
```

ใช้ controller จาก ZIP เดิมทั้งสามคำสั่ง ไม่แก้/ลบ lock, pending, before-image หรือ metadata ด้วยมือ และไม่รัน Task/Sync/capture เพื่อทดสอบ ผู้ดูแลรอรอบธรรมชาติเมื่อได้รับอนุมัติแล้ว ถ้า Status เป็น unverified หรือ lock owner unknown/active ให้หยุดรักษาหลักฐาน ไม่เปลี่ยนบัญชี/ACL เพื่อให้ผ่าน

ก่อน rename แรก เขียน prepared record แบบ CreateNew + Flush(true) พร้อม owner PID/เวลาเริ่ม process, location, bytes/file identity/security descriptor ของ predecessor และ candidate ที่ถือ handle ไว้ ตรวจ pointer bytes กับ baseline ในชุดก่อนใช้ ไม่เชื่อชื่อ backup อย่างเดียว Terminal records ผูกกับ prepared record ใช้บอก completion/restoration ที่ตรวจแล้ว และเก็บหลักฐานทุก transaction ไว้ Lock ตรวจ PID พร้อมเวลาเริ่มเพื่อแยก PID reuse; query ไม่ได้เป็น unknown ไม่ฆ่า/แย่ง process ใช้ quiet checks เดิมก่อนกู้

หากขาดก่อนเผยแพร่ candidate จะคืน before-image ที่พิสูจน์ได้ด้วย no-replace หาก candidate เผยแพร่แล้วแต่ยังไม่ผ่าน postflight/บันทึก completion จะย้ายเฉพาะ candidate object ที่ตรง pin ไปชื่อ failed ที่ตรึงไว้แล้วคืน predecessor การกู้ Rollback ที่ค้างจึงคืน **v4 ก่อนเริ่ม Rollback** ไม่ใช่ข้ามขั้นเปิด v1 Candidate ที่มี verified completion อยู่แล้วคงไว้หลังตรวจหลักฐานและ release ไม่เปิด candidate ที่ยังไม่ผ่านตรวจให้เอง หาก launcher เป็น foreign file/ before-image เปลี่ยน/metadata ไม่พอ ให้หยุดโดยไม่ overwrite

Recover มี intent ที่ flush ก่อนย้ายไฟล์ รองรับเริ่ม controller ใหม่หลัง crash ทั้งก่อน/หลัง candidate ถูกย้ายออก และหลังคืน predecessor ก่อนบันทึกจบ กู้ซ้ำได้โดยไม่เปลี่ยน predecessor ซ้ำ Lock ที่พิสูจน์ว่า orphan และ lock ของตนที่ปิดปกติถูกย้ายทั้ง object ไปชื่อ archive ใหม่แบบ no-replace ไม่ลบหลักฐาน เก็บ outbox/receipts/lastSuccess และ config/ACL/Tasks เดิม

Status อ่านอย่างเดียว แยก installed runtime ออกจาก installationTransaction: updating, recoverable/interrupted, unverified และ idle พร้อม lock owner และสถานะ metadata/objects ที่ปลอดภัย หาก launcher หายหรือไม่รู้จัก/metadata ขาด เสีย อ่านไม่ได้ ยังคืนผลสรุปและประวัติ lastSuccess ที่อ่านได้ Current attempt เป็น unknown/null หาก installation หรือ Task/attempt ยืนยันไม่ได้ ไม่มี raw exception/path/identity/integrity ในผลลัพธ์

ข้อจำกัด: Flush(true) และ checksum ไม่รับรองความคงทนของ directory entry/อุปกรณ์เมื่อไฟดับจริง ไม่ได้ทดสอบ reboot/power loss และ checksum ไม่ใช่ลายเซ็นป้องกัน administrator แก้ข้อมูล การกู้ต้องอาศัย prepared record ที่ยังครบและ trusted protected directory เดิม หาก record หาย/ขาดก่อนเขียนเสร็จ หรือ lock เก่าจากแพ็กเกจ v3 ไม่มี owner proof ให้ unverified และต้องตรวจหลักฐานเพิ่มเติม ไม่เดา pointer ใหม่ Pending/staging ที่ไม่ผ่านตรวจเก็บไว้ จึงอาจไม่ยอม Update ซ้ำจนตรวจรับชุดถัดไป ไม่มีอัตโนมัติล้างให้ผ่าน
