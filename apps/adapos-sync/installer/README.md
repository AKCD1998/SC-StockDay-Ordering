# ติดตั้งโปรแกรมซิงก์ข้อมูลรายคืน

โฟลเดอร์นี้ใช้สำหรับติดตั้งโปรแกรมซิงก์ข้อมูลของสาขาให้ทำงานอัตโนมัติทุกคืนเวลา 22:00 น. หลังติดตั้งเสร็จ เครื่องจะส่งข้อมูลไปที่ส่วนกลางตามค่าที่กรอกไว้ในไฟล์ `.env`

## สิ่งที่ต้องมี

ติดตั้งโปรแกรมต่อไปนี้ก่อนเริ่มงาน

- Node.js 20 ขึ้นไป: https://nodejs.org/en/download
- Git for Windows: https://git-scm.com/download/win

## ขั้นตอนติดตั้ง

1. เปิด PowerShell แบบผู้ดูแลระบบ
2. ไปที่โฟลเดอร์ `apps\adapos-sync\installer`
3. รันคำสั่ง `.\install.ps1`
4. ตอบคำถามบนหน้าจอ
5. กรอกรหัสสาขา, ข้อมูล SQL Server, URL ของ API และ token ให้ครบ
6. รอให้สคริปต์ทดสอบการเชื่อมต่อและลงทะเบียนงานอัตโนมัติ

## ถ้าต้องโคลนโปรเจกต์ก่อน

ถ้าเครื่องยังไม่มีโปรเจกต์ ให้ใช้คำสั่งนี้ก่อน

```powershell
git clone https://github.com/AKCD1998/SC-StockDay-Ordering.git
```

แล้วเข้าไปที่โฟลเดอร์ `SC-StockDay-Ordering\apps\adapos-sync\installer`

## วิธีตรวจสอบว่าติดตั้งสำเร็จ

- หลังจบสคริปต์ จะเห็นชื่อ Scheduled Task ของสาขา
- จะเห็นเวลา `Next run time`
- มีไฟล์ `.env` อยู่ที่ `apps\adapos-sync\.env`
- สามารถเปิด Task Scheduler แล้วค้นหาชื่อ `AdaPOS Nightly Sync (Branch XXX)`

## ถ้ามีปัญหาให้ตรวจสอบแบบเร็ว

1. ดับเบิลคลิก `diagnose.bat`
2. รอให้ไฟล์ `diagnose-output.txt` เปิดขึ้นมา
3. ส่งไฟล์นี้ให้ทีมที่ดูแลระบบทาง LINE หรืออีเมล

## ไฟล์สำคัญในโฟลเดอร์นี้

- `install.ps1` ติดตั้งและตั้งค่า
- `diagnose.bat` เปิดการตรวจสอบแบบคลิกเดียว
- `diagnose.ps1` สร้างรายงานปัญหาอย่างละเอียด
- `uninstall.ps1` ลบงาน Scheduled Task ออก

## ตารางแก้ปัญหาเบื้องต้น

| อาการ | วิธีแก้ |
|---|---|
| เปิด `install.ps1` แล้วบอกว่าไม่ใช่ Administrator | ปิดหน้าต่างเดิม แล้วเปิด PowerShell แบบ Run as administrator |
| ขึ้นว่าไม่พบ Node.js | ติดตั้ง Node.js 20 จากลิงก์ด้านบน แล้วรันใหม่ |
| ขึ้นว่าไม่พบ Git | ติดตั้ง Git for Windows จากลิงก์ด้านบน แล้วรันใหม่ |
| Heartbeat ขึ้น 401 | Token ไม่ถูกต้อง ให้รัน `install.ps1` ใหม่แล้วกรอก `ADAPOS_SYNC_SHARED_TOKEN` อีกครั้ง |
| เชื่อม SQL Server ไม่ได้ | ตรวจสอบว่าเครื่องแม่เปิด SQL Server อยู่ และพอร์ต 1433 ไม่ถูกบล็อก |

## ถ้าต้องถอดการติดตั้ง

เปิด PowerShell แบบผู้ดูแลระบบ แล้วรัน

```powershell
.\uninstall.ps1
```

สคริปต์จะลบเฉพาะ Scheduled Task ออก แต่จะไม่ลบโฟลเดอร์โปรเจกต์และไฟล์ `.env`
