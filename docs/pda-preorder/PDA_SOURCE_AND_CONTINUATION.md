# วิธีรับช่วงงานร่วมกับ PDA และหาซอร์สแอป

**Current R25 —25November:** submitted005 count pages support exact change review, scroll-to-end green confirmation, the existing password and three full versions including current. Cancellation/local amendments preserve accepted data. Android/PWA25 delivered; existing work and R21–R24 ordinary clients retained. [Source, retention, delivery and tests](events/2026-11-25-pda-r25-reviewed-resubmission.md).

**Current R24 —25November:** each real annual page submission requires server-verified password confirmation; drafts remain editable after explicit rejection and uncertain retries retain their original receipt identity. Android/PWA24 delivered, existing work/accounts retained. [Source, delivery and acceptance](events/2026-11-25-pda-r24-final-submit-confirmation.md).

**R23 PWA correction —25November:** companion activation now shows one blue QR scan action. WebPR116 only; existing signedAPK23 and all saved work retained. Future PWA export source follows `eda9585` on `codex/scpda-r23-single-qr-source`. [Correction and verification](events/2026-11-25-pda-r23-single-qr.md).

**Current R23 —25November:** Android/PWA23 is published and live with queued005 pages, explicit save/pause, primary self-count, shared assignment summaries, startup resume and preserved branch profiles. Visiting staff receive ordinary destination-branch functions within existing admission; home work remains separate. Same package/signer, seven static credentials and the existing74-page/3035-item005 event preserved. [Source, delivery, contract and tests](events/2026-11-25-pda-r23-queued-work-and-branch-profiles.md).

**Historical R22 —25November:** branch005 annual count is live:74A4pages/3035items, warehouse001 inside005, initially blank. Android/PWA22 published; existing004 R21 daily/QR/counts remain accepted. Same package/signer/storage and seven credential records preserved; no Ada stock write. [Release, event and acceptance](events/2026-11-25-pda-r22-annual005.md).

**Historical R16 —16 November:** user-authorized01004 / new branch004 Android pilot for Thursday19 November. App **0.7.1-test.16**, branch `codex/scpda-004-r16`, source `98f479db1edd479cb3b218dabc3e7d3568892a57`; published in SC App Center and delivered in the existing Drive folder. Backend PR66/migration087 and admin web PR105 are live;001/005 credentials, enrollment and evidence preserved. [Source, activation and delivery](events/2026-11-16-pda-branch004-r16.md). Counts are physical evidence pending review, not an Ada/current-stock adjustment. Physical004 Android enrollment/first count remains pending. The separate Local product-connector candidate is not included; preserve its work and its single TEST-round ownership.

ผู้ใช้ขอให้ PDA owner ชี้แจงวิธีทำงานให้แชต Preorder หลังมีรายงานว่าใน Drive มี APK/รายงานแต่ไม่มีซอร์สให้ต่อหน้า Preorder เอกสารนี้แก้จุดส่งต่องานนั้น ไม่ได้โอน ownership หรืออนุญาตเขียนข้อมูลจริงใน ADA

## แหล่งข้อมูลแต่ละชนิด

- **Git source branches / PRs:** ซอร์สที่ใช้พัฒนาและทดสอบ
- **`coord/pda-preorder-ledger`:** สมุดกลางเรื่องสถานะ เจ้าของงาน contract และหลักฐาน ต้อง fetch ก่อนอ่านและอัปเดตหลังงานสำคัญ ไม่ใช่ branch แอปสำหรับพัฒนา
- **Google Drive `เภสัชอู๋ / pdaAppProject`:** APK/ชุดติดตั้ง/คู่มือ/หลักฐานส่งมอบ ไม่ใช่ที่เดียวที่เก็บซอร์ส การไม่พบ source ZIP ใน Drive ไม่ได้แปลว่าไม่มีซอร์สแอป
- **เครื่อง Cloud:** แต่ละแชตอาจอยู่คนละเครื่อง path/SDK/localhost/session จึงไม่จำเป็นต้องมีเหมือนกัน ใช้ Git กู้ซอร์สเดิม ไม่ต้องให้ผู้ใช้เล่าทุกอย่างหรือส่งรหัสใหม่

## ซอร์ส Android ล่าสุด —R25

- Branch: `codex/scpda-change-review-r25`
- Commit: `9bbf38bb1aebbf74df6b61940c57f16af4d01875`
- Version: **0.9.3-test.25/code25**
- [ซอร์สที่ส่งมอบ](https://github.com/AKCD1998/SC-StockDay-Ordering/tree/9bbf38bb1aebbf74df6b61940c57f16af4d01875)
- รักษา startup gate และ branch profiles; การสลับสาขาต้องล้างและขอ ProductSession/Preorder capabilities แยก ไม่ใช้ reader/count แทนสิทธิ์สินค้า

## ซอร์ส Android ใน checkpoint R16 (ประวัติ)

- Repository: **`AKCD1998/SC-StockDay-Ordering`**
- Branch: **`codex/scpda-004-r16`**
- Commit: **`98f479db1edd479cb3b218dabc3e7d3568892a57`**
- รุ่นส่งมอบ: **0.7.1-test.16**, versionCode16
- [เปิดซอร์สที่ commit นี้](https://github.com/AKCD1998/SC-StockDay-Ordering/tree/98f479db1edd479cb3b218dabc3e7d3568892a57)

ใช้ checkout ของ repository เดิม ตรวจ remote/status/worktree ก่อน อย่าสลับหรือ merge ใส่ branch ที่ผู้อื่นกำลังทำงาน ตัวอย่างคำสั่งตรวจแบบไม่เปลี่ยน engineering branch:

```sh
git fetch origin coord/pda-preorder-ledger codex/scpda-004-r16
git show origin/coord/pda-preorder-ledger:docs/pda-preorder/STATE.md
git show origin/coord/pda-preorder-ledger:docs/pda-preorder/CONTRACT.md
git show 98f479db1edd479cb3b218dabc3e7d3568892a57:apps/scpda-android/README.md
git ls-tree -r --name-only 98f479db1edd479cb3b218dabc3e7d3568892a57 apps/scpda-android apps/pda-preview scripts
```

ถ้าต้องอ่านหลายไฟล์ ให้ใช้ worktree สำหรับอ่านโดยเฉพาะ หลังตรวจว่าปลายทางยังไม่มีและไม่มีเจ้าของใช้งาน:

```sh
git worktree add --detach /workspace/preorder-pda-r16-source-review 98f479db1edd479cb3b218dabc3e7d3568892a57
```

path นี้เป็นตัวอย่างใหม่บนเครื่องของผู้รับ ไม่ใช่การอ้างว่าเข้าถึงเครื่อง PDA owner แล้ว ห้าม merge coordination branch เข้า app/Preorder branch เพื่อให้เห็นเอกสาร และไม่ต้อง merge/cherry-pick ทั้ง R11 เข้า PR100 เพียงเพื่ออ่านไฟล์

## แผนที่ไฟล์ที่เกี่ยวข้องจริง

| งาน | ไฟล์ในซอร์ส R16 |
|---|---|
| หน้าจอหลัก/สามแท็บ/การสลับแท็บและคงร่าง | `apps/pda-preview/scpda.html`, `scpda-ui.mjs`, `scpda.css` |
| หน้าตาและคิวผลนับเดิม | `apps/pda-preview/scpda-count-ui.mjs`, `scpda-count-sync.mjs`, `scpda-local-counts.mjs` |
| identity/หน่วย/ข้อมูลสินค้าจาก reader เดิม | `apps/pda-preview/stockday-live-contract.mjs` |
| หน้าราคาและ refresh | `apps/pda-preview/scpda-price-check.mjs`, `scpda-price-refresh.mjs` |
| Android bridge / fixed HTTPS / auth / proof / native operation allowlist | `apps/scpda-android/src/th/co/scgroup1989/scpda/MainActivity.java`, `StockDaySession.java` |
| Browser transport อ้างอิงสำหรับพรีวิว | `apps/pda-preview/scpda-browser-host.mjs` — ไม่ใช่หลักฐานว่า hosted Site เปิดรับจริงแล้ว |
| รวม HTML/CSS/JS เป็น assets และสร้าง/เซ็น APK | `scripts/build-scpda-android-assets.mjs`, `scripts/build-scpda-android.py` |
| วิธี build / ข้อจำกัดการทดสอบ | `apps/scpda-android/README.md`, `docs/SCPDA_COUNT_SEND_R11_2026-11-15.md` |
| ตัวอย่างการพิสูจน์ exact APK → shipping JVM → HTTP/Postgres | `apps/scpda-android/tests/ui-count-pilot.py`, `ui-password-native.cjs`, `NativeReadHarness.java` |

Android ใช้ bundled HTML/JS ผ่าน WebView และ native bridge ชื่อ `SCPDAHost` ไม่ใช่โครงการ Kotlin/React Native ที่หายไป ไม่มีความจำเป็นต้องแกะ APK เพื่อกู้ซอร์ส หน้า `พรีออเดอร์` มี shell อยู่แล้วและยังเป็น pending panel จึงไม่ต้องสร้างแท็บ/แอปใหม่ อย่าเริ่มจาก `count-demo.html` หรือ legacy demo แล้วเรียกว่าต่อแอปจริง

## วิธีแบ่งงานและเดินต่อ

1. **Preorder owner** ทำ business workflow / web / domain API ต่อใน PR100 และ PR61 เดิม ตรวจ current PR head กับ `main` ไม่ยึด SHA เก่าในบันทึกเป็นล่าสุด บันทึก DTO, stable case/item IDs, version/idempotency/receipt/error และ capability ของ branch/HQ/CEO ให้ PDA owner อ่านได้
2. **PDA owner** ยังรับผิดชอบ app UI/native transport/build การเข้าถึงซอร์สเพื่ออ่านไม่ใช่การโอน owner ให้แชต Preorder การไม่มี source ZIP บน Drive ไม่ควรเป็น blocker ของงานเว็บ/domain หรือเหตุให้ขอผู้ใช้ส่งซอร์สซ้ำ
3. สิ่งที่ต้องตกลงเพิ่มจริงคือ **mobile auth adapter เข้า Preorder domain** ปัจจุบัน web-cookie auth, PDA reader proof และ count-purpose access เป็นคนละ scope อย่าเอา reader/count token ไปเรียก web route แล้วถือว่าใช้งานได้ หรือเพิ่ม role จากชื่อบัญชี/local role switch บันทึกวิธี map identity/capabilities จาก server และขอบเขต native operations ให้ชัดก่อนทำ integration
4. เดินงานอ่านข้อมูล/ตรวจ schema/เตรียม adapter/ทำ test fixture/ส่วนที่ไม่ขึ้นกับ blocker ต่อได้ภายใต้คำสั่งเดิม เมื่อขาดข้อมูล ให้ค้น repository, PR, ledger และ connection ที่มี แล้วระบุสิ่งที่ลองและข้อมูลที่ขาดเป็นจุด ๆ ไม่หยุดทั้งงานเพราะคำว่า “ยังไม่ทราบ” และไม่สรุปให้รอผู้ใช้/vendor ทั้งที่ยังตรวจระบบของเราได้
5. รับสินค้าอ่านจาก `adapos-sync` เดิม ส่วน product-master writer แยกเป็น operator action ที่ตรวจซ้ำ/สิทธิ์/audit/idempotency และอ่านกลับก่อนผูก request วิธีเขียนจริงยังต้องยืนยันจาก ADA ที่ใช้จริง; **อย่าเดา SQL INSERT, ถือว่าตาราง mirror คือ ADA หรือใส่ไว้ใน daily sync อัตโนมัติ** การค้นคว้าแบบอ่านและจัดทำข้อเสนอ concrete ทำต่อได้ ไม่ใช่การรับรองว่าตัวเขียนเสร็จแล้ว
6. ก่อนบอกว่าพร้อม ต้องพิสูจน์ UI → auth/API → durable store → receipt → อีก client/reopen/retry และข้อมูลเดิมไม่หาย CI/component/mock ผ่านต้องระบุ scope; ไม่เท่ากับ live/physical-phone acceptance
7. ถ้าจำเป็นต้องขออนุมัติของจริง ให้เตรียมโค้ด/แผน/ผลทดสอบที่ตรวจได้ก่อน แล้วระบุ action และขอบเขตที่ยังต้องอนุมัติจริงจากคำสั่งปัจจุบัน ไม่ใช้ข้อห้ามใน handoff เก่าเป็น blanket blocker ของงานที่ผู้ใช้สั่งต่อไว้แล้ว

## สถานะ production ที่ต้องรักษา

R11 count collection เปิดจริงเฉพาะ **01001 / branch001** แล้ว พร้อมเว็บไซต์ **ข้อมูลสินค้า → เช็คสินค้า** สำหรับ branch001/admin; migration083 ใช้แล้ว ดู [หลักฐาน R11](events/2026-11-15-pda-r11-count-activation.md) การขาด Preorder adapter ไม่ได้แปลว่างาน PDA count ทั้งระบบยังไม่ deploy

Preorder PR61/100 ยังเป็น draft ไม่ได้ deploy: ณ ที่ตรวจรอบนี้ backend head `da47bcd4fba44719b6a2ca9b9640f4efa56c0cc5`, web head `4aa5f1a2af07af7be0708eb982821b062fd51db1` และ CI ของ head ทั้งสองสำเร็จ นี่ไม่ยืนยัน product writer, CRM sync หรือ lifecycle ว่าครบแล้ว ให้เช็ก head ใหม่ก่อนเริ่มงานถัดไป

คง package/registration/signing certificate/IndexedDB origin/count history/price UI และ paused OCR ของแอป การ build APK อัปเดตใช้คีย์เซ็นเดิมผ่าน PDA owner; อย่าสร้างคีย์ใหม่แล้วให้ผู้ใช้ถอนแอปเพื่อแก้ incompatibility ไม่คัดลอก private keys, `.env`, passwords, cookies หรือ customer database ไปไว้ใน ledger/Drive

## การประสานงานที่ตรวจสอบได้

อัปเดตเฉพาะ owner file ของตน + event ชื่อไม่ซ้ำ แล้วอัปเดต shared STATE/CONTRACT เมื่อข้อเท็จจริงเปลี่ยน Push ไป canonical `coord/pda-preorder-ledger` โดยไม่ force แชตผู้รับควรตอบรับใน event ของตนพร้อม exact source SHA/ขอบเขตที่ทำต่อ/สิ่งที่ยังขาด ไม่แก้ owner checkpoint ของอีกฝั่งเพื่ออ้างว่ารับเรื่องแล้ว

GitHub PR comment เป็นจุดแจ้งงานให้ค้นพบได้ ไม่ได้ปลุกอีก chat อัตโนมัติ การโพสต์ข้อความยังไม่ใช่หลักฐานว่าผู้รับอ่านแล้ว ไม่มีการเรียกผู้ใช้มาตั้งบริบทเดิมใหม่เมื่อ Git/ledger ให้บริบทได้อยู่แล้ว

App Center client files in R15: `apps/pda-preview/scpda-app-center.mjs`, `scpda-app-center.css`; native `AppCenterClient.java`, `ScpdaAppUpdater.java`, `UpdateApkProvider.java`. Storefront source is `apps/admin-web/src/AppCenterPanel.jsx` in web main, not in the compiled-app branch. Backend publication runbook is `docs/SC_APP_CENTER.md` in PaaSRTSM-project main.
