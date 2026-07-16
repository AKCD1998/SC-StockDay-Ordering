# สาขา 003 และ 004 sync ไม่ทำงาน — 2026-07-16 เช้า

สรุปสิ่งที่เกิดขึ้น สาเหตุ และวิธีแก้ สำหรับเหตุการณ์เช้าวันที่ 16 ก.ค. 2026
(แยกจากเหตุการณ์ DB/stock-day query ที่แก้ไปเมื่อวันที่ 15 ก.ค. — คนละสาเหตุ คนละระบบ)

---

## สาขา 003 — Scheduled Task หายไปทั้งหมด

### อาการที่เจอ
Dashboard "ประวัติ Sync" แสดง ❌ สำหรับสาขา 003 ในวันที่ 16/7 ทั้งที่ก่อนหน้านี้
sync สำเร็จมาตลอดหลายสัปดาห์

### สาเหตุที่แท้จริง
Windows Scheduled Task ทั้ง 2 ตัว (`AdaPOS Sync (Branch 003) - Morning`
เวลา 08:20 และ `- Evening` เวลา 19:20) **หายไปจาก Task Scheduler
โดยสิ้นเชิง** — ไม่ใช่แค่ถูกปิด (Disabled) แต่ไม่มีอยู่ในระบบเลย

- Log ล่าสุดบนเครื่องคือ `sync-20260715-082003.log` (เช้าวันที่ 15)
  ซึ่งวิ่งสำเร็จบางส่วนแล้วพังตอน post transfers เพราะ timeout
  (บั๊กที่รู้อยู่แล้ว มี fix อยู่ในโค้ดแล้วแต่ยังไม่ได้ pull ตอนนั้น)
- ไม่มี log ของรอบ 19:20 (15/7) และ 08:20 (16/7) เลย — เพราะไม่มี task
  ให้ยิงตั้งแต่แรก
- Task Scheduler operational log ถูกปิดไว้บนเครื่องนี้ ไม่มีบันทึกว่า
  task หายไปตอนไหนหรือใครลบ — เจอแค่ PowerShell history มีร่องรอยว่า
  เคยมีคนรัน `register-task.ps1 -Branch 003` เพื่อสร้าง task ใหม่มาก่อน
  แต่ไม่มี timestamp ยืนยัน

### วิธีแก้
รัน `register-task.ps1` ใหม่บนเครื่องสาขา 003 (ต้องรันแบบ Administrator):

```powershell
cd "C:\Users\Administrator\Desktop\RxAuu\SC-StockDay-Ordering\apps\adapos-sync"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\register-task.ps1" -Branch 003
```

ก่อนรันได้ตรวจสอบตัวสคริปต์แล้วว่าปลอดภัย — `-Branch` ถูกใช้แค่ตั้งชื่อ
task เท่านั้น ไม่ได้ถูกส่งเข้าไปในคำสั่งจริง (branch ที่ใช้จริงมาจาก
`.env` ของเครื่องนั้นเองเสมอ ซึ่งตรวจแล้วว่าถูกต้อง)

### ผล
✅ Task ทั้ง 2 ตัวถูกสร้างใหม่สำเร็จ, State = Ready

- Evening: next run 16/7 19:20 (คืนนี้ — **ยังไม่ได้ยืนยันผลจริง**)
- Morning: next run 17/7 08:20

**ยังไม่ปิดเคสสมบูรณ์** — ต้องรอดูผลจริงคืนนี้ 19:20 ก่อน

---

## สาขา 004 — self-update crash ทำให้ sync ไม่เริ่มเลย

### อาการที่เจอ
Dashboard แสดง 🌙 (รอ sync) ตลอด — sync ไม่มี attempt ใดๆ เลยมาตั้งแต่
เช้าวันที่ 15 ก.ค. 08:20 (ครั้งสุดท้ายที่พังด้วย timeout ตอน post products)

ต่างจากสาขา 003: **Scheduled Task ของ 004 ยังอยู่ครบ ถูกต้องทุกจุด**
(`Get-ScheduledTaskInfo` แสดง LastTaskResult = 0 ทั้งคู่ — ดูเหมือนสำเร็จ
แต่จริงๆ ไม่มีอะไรเกิดขึ้นเลย)

### สาเหตุที่แท้จริง — บั๊ก 2 ตัวซ้อนกัน

**บั๊กตัวที่ 1 (ตัวจริงที่ทำให้ crash):**
ใน `open-adapos-and-sync.ps1` มีฟีเจอร์ self-update ที่ใช้ `git` เช็ค/pull
โค้ดใหม่อัตโนมัติทุกครั้งก่อน sync สคริปต์ทั้งไฟล์ตั้ง
`$ErrorActionPreference = "Stop"` ไว้ตั้งแต่ต้น

ปัญหาคือ **ใน Windows PowerShell 5.1 การตั้งค่านี้ทำให้ error จาก
native command (เช่น git) ที่เขียนลง stderr กลายเป็น exception ที่หยุด
สคริปต์ทั้งไฟล์ทันที — และ `2>$null` (ที่เขียนไว้เพื่อกันไม่ให้เกิดปัญหานี้)
**ไม่ได้ผล** เพราะมันแค่ซ่อนข้อความ ไม่ได้ป้องกันการโยน exception**

พอ Scheduled Task รันด้วยสิทธิ์ `SYSTEM` (ตาม design ของ
`register-task.ps1`) แต่ repo เป็นของ `Administrator` — git มองว่านี่คือ
"dubious ownership" แล้ว error ออกมาทาง stderr → PowerShell เห็นเป็น
exception ร้ายแรง → สคริปต์ crash ทันทีตั้งแต่บรรทัดแรกของ self-update
**ก่อนที่จะเขียน log แม้แต่บรรทัดเดียว** — sync agent (`node.exe`) เลย
ไม่เคยถูกเรียกใช้งานเลยทั้ง 2 ครั้ง

**บั๊กตัวที่ 2 (ตัวที่ทำให้ไม่มีใครสังเกตเห็น):**
`RUN-ADAPOS-SYNC.bat` เรียก PowerShell 2 ครั้งติดกัน (ตัว sync จริง แล้วก็
`show-result.ps1` เพื่อโชว์ผลลัพธ์) — ตัวที่สองไปเขียนทับ `%ERRORLEVEL%`
ของตัวแรก แล้วไฟล์ `.bat` **ไม่มีคำสั่ง `exit /b`** ปิดท้ายเลย ทำให้
`cmd.exe` (ตัวที่ Task Scheduler เฝ้าดูจริงๆ) ส่งค่า exit code 0 กลับไป
เสมอ ไม่ว่าข้างในจะพังแค่ไหน — Task Scheduler เลยบันทึกว่า "สำเร็จ" ทุกครั้ง
ทั้งที่จริงไม่มีอะไรเกิดขึ้นเลย

### วิธีแก้ (commit `aa86d8b` บน main แล้ว)

**`open-adapos-and-sync.ps1`** — จำกัดขอบเขต `$ErrorActionPreference`
เป็น `Continue` เฉพาะในฟังก์ชัน self-update เท่านั้น (ไม่กระทบส่วนอื่นของ
สคริปต์) พร้อมห่อ `try/catch` ไว้อีกชั้นกันเหนียว:

```powershell
$local:ErrorActionPreference = "Continue"
...
try {
  Invoke-SelfUpdate
} catch {
  Write-Log "SELF-UPDATE: unexpected error ($($_.Exception.Message)), continuing with existing code."
}
```

**`RUN-ADAPOS-SYNC.bat`** — เพิ่มบรรทัดสุดท้าย ส่งค่า exit code จริงกลับไป:

```bat
exit /b %EXIT_CODE%
```

### ยืนยันผลแล้ว — ไม่ใช่แค่โค้ดสวย ทดสอบจริง
สั่งรัน Scheduled Task จริง (ไม่ใช่รันมือแบบ Administrator ซึ่งจะไม่เจอ
บั๊กเพราะ Administrator เป็นเจ้าของ repo เอง) — ผลคือ:

```
[2026-07-16 09:52:14] SELF-UPDATE: not inside a git repo, skipping.
[2026-07-16 09:52:14] Starting sync for branch 004.
...
Done. 18531 records sent to API.
[2026-07-16 09:56:23] Sync succeeded.
```

self-update ยังเจอปัญหา git เดิม แต่ตอนนี้แค่ log แล้วข้ามไป **ไม่ crash
สคริปต์ทั้งไฟล์แล้ว** — sync จริงวิ่งจนจบสำเร็จ ส่งข้อมูล 18,531 รายการ

เพราะเป็นการแก้ shared code (ทุกสาขาใช้ไฟล์เดียวกัน) push ขึ้น `main`
แล้ว **สาขาอื่นจะได้รับ fix นี้อัตโนมัติเองในรอบ sync ถัดไปของแต่ละสาขา**
ผ่านกลไก self-update — ไม่ต้องไปทำทีละเครื่อง

### สิ่งที่ยังไม่ได้แก้ (ไม่เร่ง แต่ต้องรู้ไว้)
`safe.directory` ของ git ยังไม่ได้ตั้งให้ SYSTEM บนเครื่องสาขา 004 —
เช็คแล้วว่า `C:\Windows\System32\config\systemprofile\.gitconfig`
**ไม่มีไฟล์นี้เลย** แปลว่า:

- ✅ sync ทำงานได้ปกติแล้ว ไม่กระทบ
- ❌ self-update **จะยัง silently ไม่ทำงาน** บนเครื่องนี้ตลอดไป จนกว่าจะ
  ตั้งค่า `safe.directory` ให้ SYSTEM หรือเปลี่ยนวิธี run task —
  หมายความว่าถ้ามี fix ใหม่ในอนาคต เครื่องนี้จะไม่ได้รับอัตโนมัติ
  ต้องไป pull เองแบบ manual เหมือนที่เคยทำมา

**ยังไม่ได้เช็คว่าสาขาอื่น (000/001/003/005) เจอปัญหา `safe.directory`
เดียวกันหรือเปล่า** — ถ้าเจอเหมือนกัน แปลว่าอาจกระทบทั้ง fleet ไม่ใช่แค่
004 — ควรเช็คตอนดูผลคืนนี้ (19:20) ของสาขา 003 ไปด้วยเลย

---

## สรุปภาพรวม

| สาขา | ปัญหา | สถานะ | ต้องรออะไรต่อ |
|---|---|---|---|
| 003 | Scheduled Task หายทั้งคู่ | แก้แล้ว (re-register) | ผลจริงคืนนี้ 19:20 |
| 004 | self-update crash บัง sync ทั้งหมด | แก้แล้ว + ยืนยันด้วย log จริง | เช็ค safe.directory เพิ่มถ้าจะให้ self-update ใช้ได้ |
| ทุกสาขา | `safe.directory` อาจเป็นปัญหา fleet-wide | ยังไม่เช็ค | เช็คพร้อมกับผลคืนนี้ |

ทั้งสองเคสไม่เกี่ยวกับ backend/Render/database ที่แก้เมื่อวาน (15/7) —
เป็นปัญหาฝั่ง branch PC ล้วนๆ (Task Scheduler config กับบั๊กใน sync
wrapper script)
