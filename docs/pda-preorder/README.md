# สมุดงานกลาง: SCPDA ↔ Preorder

Canonical repository: `AKCD1998/SC-StockDay-Ordering`  
Canonical coordination branch: **`coord/pda-preorder-ledger`**  
Scope: engineering decisions, ownership, interface contracts and evidence. This is not an inventory, payment or customer-data ledger.

## อ่านเริ่มต้น

1. [สถานะร่วม](STATE.md) — สิ่งที่ทำแล้ว ผลตรวจ และสิ่งที่ยังไม่เปิดจริง
2. [แบ่งเจ้าของงาน](OWNERSHIP.md) — แชต PDA กับแชต Preorder รับผิดชอบอะไร
3. [จุดเชื่อมร่วม](CONTRACT.md) — แยกข้อกำหนดที่ผู้ใช้ยืนยันแล้วออกจาก API ที่ยังเป็นร่าง
4. [สถานะเจ้าของ PDA](owners/PDA.md) และ [สถานะเจ้าของ Preorder](owners/PREORDER.md)
5. [เริ่มแชต Preorder](BOOTSTRAP_PREORDER.md) / [ทำงานต่อในแชต PDA](BOOTSTRAP_PDA.md)
6. [การใช้ Cloud เดิมและการซิงก์ ledger](SYNC_AND_ENVIRONMENT.md)
7. [ซอร์ส Android และวิธีรับช่วงกับ PDA](PDA_SOURCE_AND_CONTINUATION.md) — Git เป็นแหล่งซอร์ส, Drive เป็นชุดส่งมอบ; แผนที่ไฟล์ R11 และจุดเชื่อม Preorder ที่ต้องทำต่อ

## ข้อตกลงสั้น ๆ

- แชตเดิมเป็นเจ้าของ **SCPDA บน smartphone** ต่อไป
- แชต Preorder เป็นเจ้าของ **business workflow / เว็บ / API ของ Preorder** หลังแชตใหม่ยืนยันรับช่วงจริง ยังไม่ถือว่าสร้างหรือส่งข้อความถึงแชตนั้นแล้ว
- ทั้งสองฝั่งอ่าน ledger ล่าสุดก่อนเริ่มงานและอัปเดตหลังมีความคืบหน้าที่สำคัญ ไม่ต้องให้ผู้ใช้เล่าบริบทใหม่ทุกครั้ง
- ข้อตกลงร่วมที่เปลี่ยนต้องบันทึกใน `CONTRACT.md` พร้อมเหตุผลและผลกระทบต่ออีกฝั่ง การบันทึกร่างไม่เท่ากับทั้งสองฝั่งตรวจรับ API แล้ว
- บันทึกเหตุการณ์ใหม่เป็นไฟล์ใน [events/](events/) เพื่อไม่เขียนทับประวัติ ส่วนสถานะปัจจุบันแต่ละเจ้าของอยู่คนละไฟล์
- ชื่อ account, URL parameter, role switch ของ mockup และข้อมูลจาก client ไม่ใช่สิทธิ์จริงของ server
- ไม่คัดลอก secrets, tokens, cookies, private install credentials, customer data หรือฐานข้อมูลจริงมาไว้ใน ledger
- การแยกแชตไม่อนุญาต production deploy, account/permission/CORS changes, migration หรือ official Ada/POS writes เพิ่มเติม

## ลิงก์ถาวรสำหรับสองแชต

- [Ledger กลางบน GitHub](https://github.com/AKCD1998/SC-StockDay-Ordering/tree/coord/pda-preorder-ledger/docs/pda-preorder)
- [Bootstrap ของแชต Preorder](https://github.com/AKCD1998/SC-StockDay-Ordering/blob/coord/pda-preorder-ledger/docs/pda-preorder/BOOTSTRAP_PREORDER.md)
- [Draft PR #100 ที่ต้องทำต่อ](https://github.com/AKCD1998/SC-StockDay-Ordering/pull/100)

Coordination branch นี้แยกจาก branch เขียนแอปและ branch PR #100 เพื่อให้ ledger อยู่ต่อได้เมื่อ PR เปลี่ยนหรือ merge ภายหลัง ไม่ต้อง merge branch เอกสารนี้เข้า production เพื่ออ่านร่วมกัน ห้ามลบ/ย้าย canonical branch โดยไม่อัปเดตจุดอ่านของทั้งสองแชต

## สิ่งที่ ledger ทำและไม่ทำ

Git ช่วยให้สองแชตเห็นบันทึกฉบับเดียวกัน **หลัง fetch/pull** ไม่ได้ซิงก์บทสนทนา สั่งปลุกอีกแชต หรือแชร์ RAM, browser sessions, localhost listeners และ filesystem ข้าม Cloud โดยอัตโนมัติ หากแชตใหม่ได้เครื่องใหม่ ให้อ่าน checkpoint/commit จาก ledger แล้วต่อจากงานเดิม ไม่เริ่มการออกแบบหรือสร้างโปรเจกต์ทดแทน
