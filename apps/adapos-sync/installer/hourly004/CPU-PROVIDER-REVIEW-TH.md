# CPU provider: ข้อเสนอสำหรับตรวจรับก่อนเปลี่ยน production

สถานะ: code proposal ใน PR #81 เดิมเท่านั้น Production ยังใช้ v4 / guard12s / upload recovery OFF ไม่ติดตั้ง instrumentation หรือแพ็กเกจใหม่ ไม่ rollback/merge/deploy และไม่รัน Task/Sync/capture/replay/rebaseline ชดเชย ไม่มี ZIP ย่อยหรือตัวตรวจแยกให้ผู้ดูแลนำไปติดตั้ง

## ข้อเท็จจริงที่แยกตามเวลาและ identity

- 27 ต.ค. 2026 รอบ10:00 ของ SYSTEM หยุดก่อน SQL/collection/upload ด้วย CPU_UNAVAILABLE; guard9905ms/budget12000ms และ cpu-provider8215ms มี OperationTimeoutSec8 แต่ไม่มี native exception ต้นฉบับ จึงไม่ทราบ HRESULT/CIM status ของเหตุครั้งนั้น ไม่มี Host CPU จึงไม่ทราบว่า CPU สูงหรือไม่
- เริ่มงาน10:54:53บน SERVER004 / SE Asia Standard Time / Administrator เดิม Worktree แยกสะอาดและตรง remote หลัง fetch ไม่พบ AGENTS.md ที่มีผล ไม่เปลี่ยนบัญชี/ACL/ช่องทาง ตอนไกล้11:00จึงเว้นการอ่าน CPU และ tests จนรอบธรรมชาติจบ
- อ่านคำสั่ง CIM เดิมโดยตรงเพียง1ครั้งใน native PS5.1 หลัง quiet checks ที่ไม่เกี่ยว CPU ผ่าน เวลา11:03:35.892–11:03:36.298 +07:00 ได้1sample / 7% / elapsed389ms ไม่มี exception ณ ครั้งนี้ ค่า formatted provider ไม่มีหลักฐานอายุ sample จึงไม่ได้รับรอง freshness ย้อนหลัง
- เทียบอิสระเพียง1derived sample จาก GetSystemTimes2จุด:11:06:21.504–11:06:23.062 +07:00, interval1016.450ms, 3.076923%, รวมเตรียม1558ms กำหนด budget6s เครื่องมี1processor group/4logical processors ทั้งสองการอ่านเป็น Administrator คนละช่วงเวลา ไม่เทียบเป็นค่าพร้อมกัน ไม่เลือกค่าต่ำสุด ไม่พิสูจน์ผล SYSTEM ของ provider ใหม่
- หลักฐานที่ Task11:00สร้างเองใน v4เดิม มี durable receipt verified, principalSYSTEM, CPU70samples/max28%, sourceอ่านครบ6835/35และรายงานACK6835 นี่เป็นหลักฐานว่า old provider สำเร็จในช่วง11:00 ไม่ได้พิสูจน์เหตุ10:00 ไม่ใช่การตรวจส่วนกลางรอบ11:00 และไม่ได้ทดสอบ provider ใหม่เป็นSYSTEM
- Metadata11:06: Winmgmt Running; WmiApSrv/PerfHost Stopped/Manual; PerfOS registrationอ่านได้และไม่พบ explicit Disable Performance Counters value; class/provider registrationพบ ไม่ถือว่า servicesที่หยุดเป็นเหตุเสีย หรือ registrationเป็นหลักฐานสุขภาพ provider
- WMI Operational logเปิดและอ่านได้ตอนตรวจ; queryช่วง09:59:45–10:00:25ที่ระบุ UTC offsetชัดเจนให้0events ตรงข้อมูลแชทหลัก ผล queryที่เวลาไม่qualifiedถูกตัดออกจากข้อสรุป ไม่อ่าน/เผยแพร่ raw message/stack/TargetObject การไม่มีeventsไม่พิสูจน์ว่า providerปกติหรือเปิดlogอยู่ตลอดช่วงเหตุ

สมมติฐานที่ยังไม่พิสูจน์: timeout/transient delay/initializationหรือบริบทของ WMI/performance provider เวลาประมาณ8sเป็นเพียงเบาะแส ไม่ใช่ native timeout exception และไม่เชื่อมเป็นเหตุรอบอื่น ไม่สรุป ACLผิดหรือโทษ reader

## Patch ที่เสนอ

1. ใช้ CPU provider เดียวสำหรับ Hourly complete guard: GetSystemTimes สอง cumulative points ต่อหนึ่ง intervalใหม่ ขอ warm-up1000ms ยอมรับ window1000–1500ms เท่านั้น First pointไม่ใช่CPU0 ไม่มีcache/retry/fallbackไปเลือกค่าที่ต่ำกว่า คำนวณ busy% =100×(deltaKernel+deltaUser-deltaIdle)/(deltaKernel+deltaUser); kernelรวมidleอยู่แล้ว
2. ยืนยัน1active groupและ1–64active logical processorsทั้งสองจุด ปฏิเสธ topologyที่เปลี่ยน/หลายgroupsเพื่อไม่รายงานCPUเฉพาะgroupเป็นhost CPU ตรวจข้อมูลเต็ม, integer FILETIME100ns, deltaไม่ย้อน/ไม่ศูนย์/idleไม่เกินtotal และ total accountingสอดคล้องช่วงเวลา/จำนวนprocessorsแบบbounded ไม่มีค่าที่เชื่อได้ให้หยุด
3. ส่ง absolute QPC deadlineเดียวจาก NodeไปPS5.1 Node hrtimeบนWindowsและ .NET Stopwatchใช้ QPC domainเดียวกัน เริ่มก่อนlease/diagnostics/spawn เหมือนv4 Childตรวจdeadlineก่อนทุกproviderและก่อนReady CPUเริ่มไม่ได้หากเหลือไม่พอ1250msรวมreserve ไม่มีการเริ่มtimer12sใหม่หรือขยายcollection/Task budget Parentยังตรวจdeadlineและfreshnessก่อนรับReady/close/resolve แม้timer callbackช้า
4. CPU measurementต้องเกิดหลังguardเริ่ม, raw pointsครบ2, scopeครบ, ไม่ใช่warm-up และอายุไม่เกิน1000ms ณ จุดรับผล ค่า70หรือมากกว่าหยุดเช่นเดิม; null/invalid/staleไม่ถูกแทนด้วย0 Cleanup2sเดิมแยกและเก็บleaseหากยังยืนยันchildจบไม่ได้ ไม่มีguardretry/captureซ้ำ
5. เก็บ providerFailure ผ่าน whitelistทั้งPS→Node→diagnostics→status: Exception/InnerExceptionสูงสุด4, numericHRESULT/NativeErrorCode/CIMStatusCodeเมื่อมี, ErrorCategory และFQIDส่วนที่ผ่านwhitelist ไม่มีrawmessage/stack/TargetObject/SQL/connection strings/commandlines ข้อผิดพลาดvalidationแยกจากnative error ไม่ตัดสินtimeoutจากelapsed และไม่แปลงทุกกรณีเป็นaccess denied Statusฉายเฉพาะattemptเดียวกันที่verifyแล้ว เก็บ cpuObservation เฉพาะprovider/scope/จำนวนจุด/windowMs/ageMsAtGuardและจำนวนprocessors โดยตัดabsolute QPC timestampsออก ageMsAtGuardคืออายุเมื่อguardตรวจ ไม่ใช่CPUปัจจุบัน และห้ามนำหลักฐานนี้ไปรับรองguardหรือรอบใหม่ หากattemptยังunknownต้องคืนnull

Native calls/queryที่ยังคงอยู่ เช่น Win32_Process/Task provider ยังอาจล้มและทำให้ guardหยุด ไม่ได้ประกาศว่าแก้WMIหรือความเสถียรทั้งหมด

## การทดสอบ / ผลกระทบ / การย้อนกลับ

Native PS5.1 fixtureใช้ math/validation/guard/clock/file/recoveryจริง แทนเฉพาะexternal data/host/Task/process/clock/raw pointsด้วยfixture ไม่สร้างTaskจริง ไม่เปลี่ยนidentity ไม่อ่านCPUจริงวนในtests ครอบคลุมtimeout/throw, null/many, invalid/counterreset/stale/future, warm-up, CPU0/69.999/70/71/100, scope/topology, budgetก่อนอ่าน/ก่อนจุดสอง, lateReady/close/eventloopdelay, cleanup/lease และsafe errorsที่persistถึงStatus รวมregression v4 checkpoint/outbox/receipt กับcontroller Update/Status/Rollback/Recoverเดิม

ต้องอ่านผลทดสอบแนบของ revisionจริง จำนวนtestsไม่รับรองรอบธรรมชาติ C#bindingถูกcompileบนPS5.1โดยไม่อ่านCPUซ้ำ การอ่านkernelจริงที่เก็บไว้ข้างต้นใช้ABIเดียวกันแต่เป็นAdministrator ไม่ใช่ proofของSYSTEMสำหรับpatchนี้

ผลกระทบ: warm-up1sต่อguardเพิ่มwall timeในงบเดิม เส้นทาง6835/35มีcollector guards70ครั้งและhost guardเริ่มต้น ต้องเผื่องบเดิมโดยไม่เพิ่ม15min/20min PSstartup/native compilation/process/Task delaysยังใช้งบ12s ค่าCPUเป็นaverageในช่วงsample ไม่ต่อเนื่อง ไม่ใช่CPUเฉพาะNodeหรือphysicalhypervisor เครื่องหลายgroups/ข้อมูลไม่ครบ/เหลือbudgetน้อยจะfailclosedแทนการข้ามguard

แพ็กเกจ v4ที่อนุมัติและติดตั้งแล้วยังคงเดิม Patchนี้ยังไม่สร้างinstallerรุ่นใหม่ และห้ามoverlayไฟล์ใดลงv4โดยตรง ก่อนติดตั้งในอนาคตต้องรวม Node+PS+helper+diagnostics ในชุดversionใหม่เดียว ตรึง v4เป็นpredecessorและตรวจUpdate/Status/Rollback/Recoverของbundleนั้นกับrevisionอีกครั้ง ไม่ใช้ZIPเก่าหรือguard30s

ตอนนี้ไม่มีproductionchangeให้rollback การถอนข้อเสนอทำได้โดยrevertcommitของPRก่อนmergeเท่านั้น หากอนาคตติดตั้งbundleที่อนุมัติแล้ว การRollbackต้องผ่านcontrollerของbundleเพื่อคืนv4จากpinnedbefore-imageพร้อมรักษาoutbox/receipt/ACL/Taskเดิม และต้องอนุมัติแยก ไม่copy/rebaselinepointerเอง ไม่ rollbackproductionในการตรวจครั้งนี้ การคืนv4คืนข้อจำกัดCIMเดิม ไม่ได้ซ่อมWMI

สิ่งที่ต้องรอหลังอนุมัติชุดใหม่: รอบSYSTEMตามตารางจริงพร้อมsafe provider/sampling/error evidence, deadline/cleanup/lease, cohortครบและACK/คิว/ส่วนกลางslotเดียวกัน ไม่มีTaskRunหรือชดเชย ระหว่างนี้SYSTEMสำหรับproviderใหม่ยังunknown

อ้างอิงการเลือกAPI/clock: [GetSystemTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getsystemtimes), [Windows QPC/.NET Stopwatch](https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps), [libuv Windows hrtime implementation](https://github.com/libuv/libuv/blob/v1.x/src/win/util.c) ประกอบกับclock-domain fixtureบนเครื่องนี้ ไม่ใช้เอกสารแทนผลSYSTEM
