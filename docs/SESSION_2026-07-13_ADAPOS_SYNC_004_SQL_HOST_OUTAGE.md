# Session — 2026-07-13 — สาขา 004 Sync ค้าง 4 วัน: root cause คือ .env ชี้ IP ผิดหลัง DHCP เปลี่ยน

## สรุปปัญหา

Dashboard "ประวัติ Sync" ของสาขา 004 ขึ้นกากบาท ตรวจสอบพบว่า `apps/adapos-sync`
บนเครื่อง **server004** fail ทุกรอบติดต่อกัน **16 รอบ** (เช้า-เย็น x 8 วัน) ตั้งแต่
2026-07-09 19:20 จนถึงเช้าของ 2026-07-13 ด้วย error เดิมทุกครั้ง:

```
Sync failed: Failed to connect to 192.168.1.102:49976 in 15000ms
Code: ETIMEOUT
```

## Root cause ที่แท้จริง

**ไม่ใช่ SQL Server ล่ม** — `MSSQL$SQLEXPRESS` รันอยู่ตลอดบนเครื่อง server004 เอง
และฟัง port 49976 ปกติ (มี established connections จากเครื่องอื่นในสาขา
`192.168.1.106`, `192.168.1.100` เข้ามาจริงตลอดช่วงที่ sync agent fail)

สาเหตุจริง: **LAN IP ของเครื่อง server004 เปลี่ยนจาก `192.168.1.102` เป็น
`192.168.1.101`** แต่ `apps/adapos-sync/.env` (`ADAPOS_SQLSERVER_HOST`) ยังชี้
IP เก่าอยู่ — sync agent เลยพยายามต่อ SQL Server ผ่านเครือข่าย LAN ไปยัง IP
ที่ไม่มีใครฟังอยู่แล้ว ทั้งที่ SQL Server อยู่บนเครื่องเดียวกับตัวมันเอง

### หลักฐานที่ยืนยัน

- `Get-Service MSSQL$SQLEXPRESS` → `Running` ตลอด
- `Get-NetTCPConnection -LocalPort 49976` → listening บน `0.0.0.0`/`::` และมี
  established connections จากเครื่องอื่นในสาขาจริง ณ เวลาที่ตรวจ
- `ipconfig` → server004 มีแค่ 2 adapter: Tailscale (`100.113.59.42`) และ
  Ethernet LAN (`192.168.1.101`) — ไม่มี `.102` อยู่บนเครื่องนี้เลย
- Windows Event Log (`System`, DHCPv4 client, event id 50036) พบการ restart
  ของ DHCP client **นอกรอบปกติ** ที่ **2026-07-09 16:43** (ทุกวันอื่นมีแค่รอบ
  เดียวตอน ~07:3x เช้า) — อยู่ในช่วงเวลาเดียวกับที่เชื่อมต่อสำเร็จครั้งสุดท้าย
  (10:30) กับ fail ครั้งแรก (19:20) พอดี — ตรงกับจังหวะที่ IP น่าจะเปลี่ยน
- ไม่มี error ประเภท backend/Render (`Request timed out ...onrender.com`) ปน
  อยู่เลยตลอดช่วง 4 วัน — ยืนยันว่าไม่เกี่ยวกับ backend

## การแก้ไข

เปลี่ยน `ADAPOS_SQLSERVER_HOST` ใน `apps/adapos-sync/.env` (บนเครื่อง server004
เท่านั้น — ไฟล์นี้ไม่ได้ commit เข้า git) จาก LAN IP เป็น **`127.0.0.1`**

เหตุผลที่ใช้ `127.0.0.1` แทนการแก้เป็น `192.168.1.101` ตรงๆ: ถ้าแก้เป็น IP LAN
ใหม่ก็แค่ย้ายบั๊กเดิมไปรอ DHCP เปลี่ยนรอบหน้า — sync agent กับ SQL Server อยู่
เครื่องเดียวกัน การต่อผ่าน loopback (`127.0.0.1`) ไม่ผ่าน network adapter เลย
จึงไม่มีทางถูกกระทบจาก DHCP lease เปลี่ยนอีกในอนาคต (SQL Server ฟังอยู่บน
`0.0.0.0` อยู่แล้ว ยืนยันว่ารับ connection ผ่าน loopback ได้แน่นอน)

เคสนี้ยังมี pattern ที่ถูกต้องอยู่แล้วในโค้ดเดิม — `01_diagnose_server004.ps1`
ใช้ `$Server = "localhost"` สำหรับ sqlcmd check ของตัวเอง (บรรทัด 67) แต่
pattern นี้ไม่เคยถูกเอามาใช้กับ `.env` ของ sync agent ตัวจริง

### กันไม่ให้เกิดซ้ำกับสาขาอื่น

เพิ่มคอมเมนต์ใน `apps/adapos-sync/.env.example` เตือนว่าให้ใช้ `127.0.0.1`
เมื่อ SQL Server อยู่เครื่องเดียวกับ sync agent (setup ปกติ) และใช้ LAN
IP/hostname เฉพาะกรณี SQL Server อยู่คนละเครื่องจริงๆ เท่านั้น

## Diagnostic detour ที่ไม่เกี่ยวข้อง (บันทึกไว้กันสับสนซ้ำ)

ระหว่างวินิจฉัย พบ credential `sa` / `adasoft` ที่ถูก document ไว้ใน
`docs/adasoft/project_adapos_session9_full_expedition.md:284` (connection
string ไปยัง `192.168.0.155` / database `AdaMember40`) — **credential นี้ไม่
เกี่ยวกับปัญหานี้เลย** เป็นคนละ host/database กับที่ branch 004 sync ใช้
(`192.168.1.102` เดิม / `AdaAcc`) และตัวปัญหาเป็น network-level (ping ไม่ตอบ
ตอนที่ตรวจ) ซึ่ง credential ระดับไหนก็ช่วยไม่ได้อยู่แล้ว

`docs/adasoft/project_adapos_storedproc_analysis.md:49` ระบุว่า sa/adasoft
credential นี้ถูกตั้งเป็น **CRITICAL security finding** (SQL injection ผ่าน
`EXEC()` ที่ไม่ sanitize ร่วมกับ SA account ที่ active อยู่ เปิดทางไปถึง
`xp_cmdshell` ได้) — ยังไม่ได้แก้ไข ควรพิจารณาแยกเป็นงาน security แยกต่างหาก
