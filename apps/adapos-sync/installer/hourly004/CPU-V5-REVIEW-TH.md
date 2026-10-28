# Hourly004 CPU v5 — เตรียมตรวจรับ ยังไม่ติดตั้ง

ใช้เฉพาะ SERVER004/004 ที่ติดตั้ง checkpoint v4 แล้ว ชุดใหม่อยู่ `stability-20261028-cpu-v5` และย้อนกลับไปv4ที่ตรึงไว้ ห้ามoverlayไฟล์ในv4

เปลี่ยน CPU provider เป็น Windows GetSystemTimes สองจุดในช่วงใหม่ประมาณ1วินาที ใช้providerเดียว ไม่มีcache/fallback/เลือกค่าต่ำ/เพิ่มretry คงabsolute guard12วินาทีและหยุดCPU>=70% คง6835/batch200/per-batch60วินาที/collection15นาที/Task20นาที/upload recoveryOFF

เก็บnative error fieldsตามwhitelistและประวัติรอบล้มในreceiptเดิม สูงสุด8รายการ/3072bytes ไม่เพิ่มไฟล์/Task/SQL รอบสำเร็จไม่ทับประวัติที่ยังอยู่ในขอบเขต Statusแยกประวัติจากรอบปัจจุบัน ไม่ใช้เหตุเก่ารับรองยอดหรือเดาเหตุที่หายไป

28ต.ค.09/10/14 Taskจบ1และPGไม่มีcapture แต่รายละเอียดถูกผลใหม่ทับแล้ว WMI Operational logช่วง30วินาทีแรกไม่พบevent จึงยังระบุเหตุเฉพาะรอบไม่ได้ 27ต.ค.10:00มีCPU_UNAVAILABLEที่formatted providerของv4แต่ไม่มีnative exception ชุดนี้ลดการพึ่งproviderนั้นและเพิ่มหลักฐาน ไม่อ้างซ่อมWMIหรือพิสูจน์สาเหตุ Windowsแล้ว Win32_Process/Task providerยังอาจล้มและต้องหยุด

warm-upเพิ่มประมาณ1วินาทีต่อguard รอบเต็มมีอย่างน้อย71การตรวจ ใช้งบเดิมทั้งหมด ข้อมูลไม่ครบ/เก่า/topologyไม่รองรับ/หมดงบต้องหยุด SYSTEMสำหรับproviderใหม่ยังต้องพิสูจน์จากรอบธรรมชาติหลังอนุมัติ ผลfixture/Administratorไม่ใช่ผลSYSTEM

ไม่เปลี่ยน sharedcheckout/.env/credentials/ACL/Tasks/cohort/automation/Full Sync/Delta ไม่merge/deploy API ไม่สั่งSync/TaskRun/replay/rebaseline/captureชดเชย

## คำสั่งบน SERVER004

แตกZIPใหม่ไป `C:\Temp\Hourly004-CPU-v5-20261028` ใช้existingAdministratorเดิม ถ้าdeniedหยุด ไม่เปลี่ยนบัญชี/ACL/ช่องทางเพื่อข้ามสิทธิ์

ตรวจอ่านอย่างเดียวก่อน:

```powershell
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -ExecutionPolicy RemoteSigned -File 'C:\Temp\Hourly004-CPU-v5-20261028\hourly004-update.ps1' -Action Status
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -ExecutionPolicy RemoteSigned -File 'C:\Temp\Hourly004-CPU-v5-20261028\hourly004-update.ps1' -Action Preflight
```

**หลังอนุมัติชุด/revisionนี้เท่านั้น:**

```powershell
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -ExecutionPolicy RemoteSigned -File 'C:\Temp\Hourly004-CPU-v5-20261028\hourly004-update.ps1' -Action Update -ReleaseApproved
```

ใช้quietchecksเดิม ตรึงpredecessor/source/dependencies ตรวจACL/Tasks/config bytesก่อนหลัง หากไม่ผ่านหยุด ไม่retryวน/ปรับเกณฑ์/หยุดFullหรือHourlyเพื่อให้ผ่าน

หลังUpdateให้Statusแล้วรอรอบตามตาราง ตรวจsource observed/ACK6835,35batches,pending0,Taskresult0และPG declared/actual/distinct6835ในslotเดียวกัน ไม่สั่งชดเชย ไม่อ้างbusinessfreshness/atomicityที่ยังไม่qualified

## ทางย้อนกลับและติดตั้งค้าง

หลังอนุมัติactionนั้น ใช้helperเดียวกัน `-Action Rollback -ReleaseApproved` หรือ `-Action Recover -ReleaseApproved` เท่านั้น

Rollbackคืนpointerv4ตามpinnedbefore-image เก็บoutbox/receipt/evidence/ACL/Tasksเดิม v4กลับใช้CIMCPUและไม่สะสมประวัติใหม่แบบv5

Statusตรวจบันทึกติดตั้งv4ที่จบแล้วจากexactpinnedimages+terminal หากv4ยังค้างให้หยุด ใช้ชุดv4เดิมตรวจรับ/Recover ห้ามv5กู้candidateผิดรุ่น สำหรับv5 Recoverเฉพาะtransactionที่พิสูจน์ownership/objectidentity/bytes/permissionsได้ หากforeign change/ownerยังอยู่/unknownให้หยุด ไม่ลบlockหรือเขียนทับ มีrenamegapจนกู้สำเร็จ ไม่รับประกันทุกเหตุไฟดับ/diskfailure

## สร้างชุดซ้ำแบบoffline

`node apps/adapos-sync/installer/build-hourly004-review.cjs <approved-v4-directory> <new-output-directory>`

ตรวจapprovedv4treeตามpinก่อนสร้าง คงbytesของFull Sync/Deltaเดิม คัดเฉพาะHourlyที่เปลี่ยน ไม่รวม.env/credentials ตรวจZIPและnativePS5.1ก่อนส่งมอบ ไม่มีmigration/flag/backenddeployในชุดนี้
