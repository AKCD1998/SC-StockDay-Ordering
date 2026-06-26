# Auto-Deploy to Branch Laptops via GitHub Actions + Tailscale SSH

**วางแผนไว้: 2026-06-27**

## เป้าหมาย

เมื่อ dev push code ไปที่ `main` บน GitHub → GitHub Actions SSH เข้าทุก branch laptop ผ่าน Tailscale → `git pull` อัตโนมัติ → ไม่ต้องพึ่งพนักงานแต่ละสาขาทำอะไรเลย

## สิ่งที่ต้องทำ (ทำตามลำดับ)

### Step 1 — เปิด OpenSSH Server บนทุก branch laptop

บน Windows 10/11 มี OpenSSH Server อยู่แล้ว แค่ enable:

```powershell
# รันใน PowerShell (Admin) บน branch laptop
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

ทำซ้ำบน laptop ทุกสาขา (001–005)

---

### Step 2 — สร้าง SSH Key สำหรับ GitHub Actions

รันบน dev machine ครั้งเดียว:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/gh_actions_deploy -N ""
```

จะได้ 2 ไฟล์:
- `gh_actions_deploy` — private key (ใส่ใน GitHub Secret)
- `gh_actions_deploy.pub` — public key (copy ไปใส่ในทุก laptop)

---

### Step 3 — ลงทะเบียน Public Key บนทุก laptop

บน laptop แต่ละสาขา (ใช้ user ที่ run Task Scheduler):

```powershell
# สร้าง authorized_keys สำหรับ Administrators group
$authorizedKeysPath = "C:\ProgramData\ssh\administrators_authorized_keys"
Add-Content $authorizedKeysPath "ssh-ed25519 AAAA... github-actions-deploy"

# Set correct permissions (สำคัญ — SSH จะ reject ถ้า permissions ผิด)
icacls $authorizedKeysPath /inheritance:r /grant "SYSTEM:(F)" /grant "Administrators:(F)"
```

---

### Step 4 — หา Tailscale hostname ของแต่ละ laptop

เข้า Tailscale admin console → ดู machine name ของแต่ละสาขา เช่น:
- `branch001-laptop.tail1234.ts.net`
- `branch005-laptop.tail1234.ts.net`

หรือรันบน laptop: `tailscale status`

---

### Step 5 — ใส่ Secrets ใน GitHub Repository

ไปที่ GitHub repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret Name | Value |
|-------------|-------|
| `TAILSCALE_AUTHKEY` | Auth key จาก Tailscale admin console (ใช้ ephemeral key) |
| `SSH_PRIVATE_KEY` | เนื้อหาของไฟล์ `gh_actions_deploy` (private key ทั้งหมด) |
| `BRANCH_LAPTOPS` | `branch001-laptop,branch002-laptop,...` (comma-separated) |

---

### Step 6 — สร้าง GitHub Actions Workflow

สร้างไฟล์ `.github/workflows/deploy-branches.yml`:

```yaml
name: Deploy adapos-sync to branch laptops

on:
  push:
    branches: [main]
    paths:
      - "apps/adapos-sync/**"
      - ".github/workflows/deploy-branches.yml"

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Connect to Tailscale
        uses: tailscale/github-action@v2
        with:
          authkey: ${{ secrets.TAILSCALE_AUTHKEY }}
          version: latest

      - name: Set up SSH key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key

      - name: Deploy to branch 001
        continue-on-error: true
        run: |
          ssh -i ~/.ssh/deploy_key \
              -o StrictHostKeyChecking=no \
              -o ConnectTimeout=15 \
              Administrator@branch001-laptop.tail1234.ts.net \
              "cd 'C:/Users/scgro/Desktop/Webapp training project/SC-StockDay-Ordering/apps/adapos-sync' && git pull --ff-only origin main && npm install --omit=dev --prefer-offline"

      - name: Deploy to branch 002
        continue-on-error: true
        run: |
          ssh -i ~/.ssh/deploy_key \
              -o StrictHostKeyChecking=no \
              -o ConnectTimeout=15 \
              Administrator@branch002-laptop.tail1234.ts.net \
              "cd 'C:/path/adapos-sync' && git pull --ff-only origin main && npm install --omit=dev --prefer-offline"

      # เพิ่ม branch 003, 004, 005 ในรูปแบบเดียวกัน

      - name: Clean up SSH key
        if: always()
        run: rm -f ~/.ssh/deploy_key
```

`continue-on-error: true` ทำให้ branch ที่ laptop ปิดอยู่ไม่ทำให้ deploy fail ทั้งหมด

---

### Step 7 — ทดสอบ

1. ทำ test commit เล็กๆ ที่ `apps/adapos-sync/` แล้ว push ไป `main`
2. เข้าดู GitHub Actions tab → ดู log แต่ละ branch
3. ตรวจสอบบน laptop ว่า `git log --oneline -3` ได้ commit ล่าสุด

---

## ข้อควรระวัง

- `git pull --ff-only` — safe: ไม่ merge ถ้า conflict เกิด ป้องกัน code เสีย
- ถ้า laptop ปิดอยู่ตอน deploy → ข้าม (continue-on-error) → laptop จะ pull เองในรอบ sync ถัดไป ถ้าเพิ่ม `git pull` ไว้ใน `open-adapos-and-sync.ps1` ด้วย (ทำ fallback ระดับ 1 ควบคู่)
- `npm install` จะช้าถ้า `package.json` เปลี่ยน — ปกติไม่เปลี่ยนบ่อย
- Tailscale Auth Key: ใช้ "ephemeral" + "reusable" key เพื่อไม่ให้ expire

---

## Fallback (ทำควบคู่แนะนำ)

เพิ่มใน `open-adapos-and-sync.ps1` บรรทัดแรก เพื่อให้ pull ทุกครั้งที่ sync รัน:

```powershell
Write-Log "Pulling latest code..."
& git -C $PSScriptRoot pull --ff-only origin main 2>&1 | ForEach-Object { Write-Log $_ }
```

ถ้า GitHub Actions ไม่สำเร็จ (laptop ปิด ฯลฯ) → nightly sync จะ catch ได้เอง
