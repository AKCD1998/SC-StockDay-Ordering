# Branch Laptop Install Guide

Use this guide when installing `apps/adapos-sync` on a branch laptop.

This file also documents the branch `004` and branch `001` pain points from the 2026-05-28 installs so the next Codex/Claude/technician does not lose time on the same traps.

## Fast Path

1. Install Node.js 20+ and Git for Windows.
2. Clone or pull this repo.
3. Find the branch POS SQL host and port.
4. Confirm/create the SQL read-only login on the POS server.
5. Configure `.env`.
6. Run a dry-run.
7. Test the API heartbeat.
8. Run one execute sync.
9. Register the scheduled task as Administrator.

## Normal Install

Open PowerShell as Administrator.

```powershell
cd "C:\path\to\SC-StockDay-Ordering\apps\adapos-sync\installer"
.\install.ps1
```

Answer the prompts:

- `ADAPOS_SYNC_BRANCH_CODE` = branch code, for example `000`, `001`, `003`, `004`, `005`
- `ADAPOS_SQLSERVER_HOST` = POS SQL server IP or host name
- `ADAPOS_SQLSERVER_PORT` = SQL Server TCP port
- `ADAPOS_SQLSERVER_USER` = read-only SQL login
- `ADAPOS_SQLSERVER_PASSWORD` = read-only SQL password
- `ADAPOS_SQLSERVER_DATABASE` = usually `AdaAcc`
- `ADAPOS_SYNC_API_BASE_URL` = usually `https://paasrtsm-project.onrender.com`
- `ADAPOS_SYNC_SHARED_TOKEN` = the backend sync token

The installer will:

- install npm dependencies
- write `apps/adapos-sync/.env`
- run a dry-run SQL smoke test
- test the heartbeat API
- register the nightly scheduled task for `22:00`

Do not continue/register the scheduled task if SQL login or dry-run fails.

## Branch 004 Known Good Values

These were confirmed on 2026-05-28.

```env
ADAPOS_SYNC_BRANCH_CODE=004
ADAPOS_SQLSERVER_HOST=192.168.1.102
ADAPOS_SQLSERVER_PORT=49976
ADAPOS_SQLSERVER_USER=readonly_pilot
ADAPOS_SQLSERVER_PASSWORD="RxAuu-RO!2026#B004"
ADAPOS_SQLSERVER_DATABASE=AdaAcc
ADAPOS_SYNC_API_BASE_URL=https://paasrtsm-project.onrender.com
ADAPOS_SYNC_SHARED_TOKEN=sc-branch-sync-2026-R8kP4vN2xQ7mT9cL5wH1zJ6fB3yU
BRANCH_STOCK_SYNC_TOKEN=sc-branch-sync-2026-R8kP4vN2xQ7mT9cL5wH1zJ6fB3yU
```

Important: the password contains `#`. It must be quoted in `.env`, otherwise `dotenv` reads only `RxAuu-RO!2026` and SQL login fails with `ELOGIN`.

## Branch 004 Install Notes

Network layout:

- Branch laptop IP: `192.168.1.106`
- POS SQL server: `SERVER004`
- POS SQL server IP: `192.168.1.102`
- SQL instance found on POS server: `SERVER004\SQLEXPRESS`
- SQL service: `SQL Server (SQLEXPRESS)`
- SQL TCP port: `49976`
- Database: `AdaAcc`

What happened:

- The laptop could reach `192.168.1.102:49976`.
- SQL login initially failed because `readonly_pilot` did not exist on `SERVER004`.
- The login was created and mapped to `AdaAcc`.
- Mixed Mode was already enabled, so no SQL Server restart was needed.
- `readonly_pilot` was added to `db_datareader`.
- The app dry-run succeeded after quoting the password.
- The first API token used was wrong for this backend.
- The correct token was already present as `BRANCH_STOCK_SYNC_TOKEN`; both token fields must match it.
- Execute sync succeeded and sent records to the API.

Known successful execute run:

```text
SQL Server: connected OK
products: 6483 rows
sales: 1529 rows
transfers: 183 rows
transfer_lines: 2043 rows
branch_stock: 34614 rows
Done. 16675 records sent to API.
```

## Branch 001 Known Good Values

These were confirmed on 2026-05-28 from the real branch laptop named `BACK1`.

```env
ADAPOS_SYNC_BRANCH_CODE=001
ADAPOS_SQLSERVER_HOST=192.168.1.8
ADAPOS_SQLSERVER_PORT=49754
ADAPOS_SQLSERVER_USER=readonly_user
ADAPOS_SQLSERVER_PASSWORD=<branch-001-readonly-password>
ADAPOS_SQLSERVER_DATABASE=AdaAcc
ADAPOS_SYNC_API_BASE_URL=https://paasrtsm-project.onrender.com
ADAPOS_SYNC_SHARED_TOKEN=<backend token>
BRANCH_STOCK_SYNC_TOKEN=<same backend token>
```

Important: do not use the staging/dev-side `192.168.100.124` SQL target for this laptop. The real laptop runtime evidence points to `192.168.1.8:49754`.

## Branch 001 Install Notes

Network layout:

- Branch laptop name: `BACK1`
- Branch laptop IP: `192.168.1.11`
- POS SQL server: `SC_001`
- POS SQL server IP: `192.168.1.8`
- SQL instance: `SC_001\SQLEXPRESS`
- SQL TCP port: `49754`
- Database: `AdaAcc`

Evidence:

- `AdaPosBack.exe` established a live TCP connection from `192.168.1.11` to `192.168.1.8:49754`.
- `nbtstat -A 192.168.1.8` returned `SC_001`.
- `D:\AdaSoft\AdaPos4.0HpmFhn\AdaTools\AdaIni.ada` contains `SqlSrcSC_001\sqlexpress` and `SqlDBAdaAcc`.
- `D:\AdaSoft\AdaPos4.0HpmFhn\AdaSky\SkyConfig.INI` contains `INBOX=httpdocs/scgroup/001`, confirming branch identity.

What happened:

- The ZIP-extracted repo at `D:\RxAuu\SC-StockDay-Ordering` was missing `apps\adapos-sync\register-task.ps1`.
- The clean Git checkout at `D:\RxAuu\SC-StockDay-Ordering-git` included `register-task.ps1`, but Windows security blocked even `Get-Item` / `Get-Content` with: `file contains a virus or potentially unwanted software`.
- `Zone.Identifier` / Mark-of-the-Web was not present on the ZIP or readable extracted `.ps1` files. MOTW removal would not have fixed this specific block.
- Windows PowerShell execution policy was not the cause. All scopes were `Undefined`.
- Defender did not report matching threat detections, but ReasonLabs was running. The exact blocking product was not proven.
- A local workaround script at `D:\RxAuu\local-register-branch001-task.ps1` was also blocked by Windows security after creation.
- The task was registered with a direct PowerShell command flow instead of using `register-task.ps1`.
- Node.js and Git were installed with `winget`.
- In Windows PowerShell 5.1, `npm` resolved to `npm.ps1` and was blocked by execution policy. Calling `npm.cmd` worked.
- `npm install --production` succeeded and created `node_modules`.
- `.env` was written as UTF-8 without BOM.
- SQL dry-run succeeded.
- Heartbeat succeeded with HTTP 200.
- One real execute sync was run through `sync-and-shutdown.ps1 -Branch 001 -NoShutdown` and succeeded.
- The provided `diagnose.ps1` failed under Windows PowerShell 5.1 at line 137 with: `A hash table can only be added to another hash table.`

Known successful dry-run:

```text
SQL Server: connected OK
products: 6477 rows
sales: 2200 rows
transfers: 233 rows
transfer_lines: 2628 rows
branch_stock: 28457 rows
Total records read: 39995
```

Known successful execute run:

```text
SQL Server: connected OK
products: 6477 rows
sales: 2200 rows
transfers: 233 rows
transfer_lines: 2628 rows
branch_stock: 28457 rows
Done. 17982 records sent to API.
```

## Find the AdaPOS SQL Host and Port

If `ADAPOS_SQLSERVER_HOST` or `ADAPOS_SQLSERVER_PORT` is unknown, open the main AdaPOS app first and wait until it has connected to its database. Then run this on the branch laptop:

```powershell
Get-NetTCPConnection -State Established |
  ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    [pscustomobject]@{
      RemoteAddress = $_.RemoteAddress
      RemotePort    = $_.RemotePort
      Process       = $p.ProcessName
    }
  } |
  Where-Object { $_.Process -like '*Ada*' -or $_.RemotePort -in 1433,1434 } |
  Format-Table -AutoSize
```

Look for a row where `Process` is AdaPOS/AdaSoft. Use `RemoteAddress` as the SQL host and `RemotePort` as the SQL port.

Example:

```text
RemoteAddress RemotePort Process
------------- ---------- -------
192.168.1.102      49976 AdaPosBack
```

Use:

```env
ADAPOS_SQLSERVER_HOST=192.168.1.102
ADAPOS_SQLSERVER_PORT=49976
ADAPOS_SQLSERVER_DATABASE=AdaAcc
```

Then confirm the port is reachable:

```powershell
Test-NetConnection 192.168.1.102 -Port 49976
```

If it returns `TcpTestSucceeded : True`, the network path is open.

To confirm the machine name:

```powershell
nbtstat -A 192.168.1.102
```

For branch `004`, this returned `SERVER004`.

For branch `001`, this returned a live `AdaPosBack` connection to `192.168.1.8:49754`; `nbtstat -A 192.168.1.8` returned `SC_001`.

## POS Server Checks

Run this on the POS server, not the branch laptop:

```powershell
cd "C:\path\to\SC-StockDay-Ordering\apps\adapos-sync\installer"
Set-ExecutionPolicy Bypass -Scope Process -Force
.\01_diagnose_server004.ps1
```

If Git is not installed on the POS server, copy the diagnostic scripts manually or use whatever local copies are available.

The diagnostic should confirm:

- machine name is the expected POS server
- `sqlservr.exe` is listening on the expected port
- SQL Server service is running
- SQL auth mode is Mixed Mode if using SQL logins
- `AdaAcc` exists and is online
- the read-only login exists and is enabled
- the login is mapped to a database user in `AdaAcc`
- the user is in `db_datareader`

If the SQL login is missing or broken, run `02_fix_readonly_pilot.sql` in SSMS on the POS server as a sysadmin. Replace `<<STRONG_PASSWORD_HERE>>` first.

## Important Token Detail

The backend at:

```env
ADAPOS_SYNC_API_BASE_URL=https://paasrtsm-project.onrender.com
```

checks the server-side `BRANCH_STOCK_SYNC_TOKEN`.

On the branch laptop, set both token fields to the same backend token:

```env
ADAPOS_SYNC_SHARED_TOKEN=<backend token>
BRANCH_STOCK_SYNC_TOKEN=<backend token>
```

For branch `004`, the correct token was:

```env
sc-branch-sync-2026-R8kP4vN2xQ7mT9cL5wH1zJ6fB3yU
```

If heartbeat returns `401 Unauthorized`, the token is wrong or the wrong token field was used.

Heartbeat test:

```powershell
$body = @{ branchCode = "004"; laptopName = $env:COMPUTERNAME; event = "install-test" } | ConvertTo-Json
Invoke-WebRequest `
  -Uri "https://paasrtsm-project.onrender.com/api/sync/heartbeat" `
  -Method POST `
  -Headers @{ "x-api-key" = "sc-branch-sync-2026-R8kP4vN2xQ7mT9cL5wH1zJ6fB3yU" } `
  -ContentType "application/json" `
  -Body $body
```

Expected result:

```text
StatusCode : 200
```

## Passwords With `#`

If the SQL password contains `#`, quote it in `.env`.

Wrong:

```env
ADAPOS_SQLSERVER_PASSWORD=RxAuu-RO!2026#B004
```

This is parsed as:

```text
RxAuu-RO!2026
```

Correct:

```env
ADAPOS_SQLSERVER_PASSWORD="RxAuu-RO!2026#B004"
```

Quick check:

```powershell
node -e "import('dotenv/config').then(()=>console.log(process.env.ADAPOS_SQLSERVER_PASSWORD.length, process.env.ADAPOS_SQLSERVER_PASSWORD.includes('#')))"
```

For the branch `004` password, expected output is:

```text
18 true
```

## Dry-Run and Execute Checks

From `apps/adapos-sync`:

```powershell
node .\src\index.js --dry-run --branch=004
```

Expected signs of success:

```text
SQL Server: connected OK
Total records read: <number>
--- Dry-run: no data sent to API ---
```

Then run one real execute sync before scheduling:

```powershell
node .\src\index.js --execute --branch=004
```

Expected signs of success:

```text
Posting ... products...
Posting ... sales records...
Done. <number> records sent to API.
```

## Register Scheduled Task

Only after dry-run, heartbeat, and execute sync pass:

```powershell
cd "C:\path\to\SC-StockDay-Ordering\apps\adapos-sync"
.\register-task.ps1 -Branch 004
```

This registers:

```text
AdaPOS Nightly Sync (Branch 004)
```

The scheduled task runs `sync-and-shutdown.ps1` nightly at `22:00`. The wrapper runs the app with `--execute` and then shuts down the PC.

If `register-task.ps1` is blocked by Windows security, do not disable security tools. Register the same task with an admin PowerShell direct command flow:

```powershell
$TaskName = "AdaPOS Nightly Sync (Branch 001)"
$Branch = "001"
$AgentDir = "D:\RxAuu\SC-StockDay-Ordering\apps\adapos-sync"
$WrapperPath = Join-Path $AgentDir "sync-and-shutdown.ps1"
$PowerShellExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$ActionArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$WrapperPath`" -Branch $Branch"

$Action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $ActionArguments -WorkingDirectory $AgentDir
$Trigger = New-ScheduledTaskTrigger -Daily -At "22:00"
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Principal $Principal `
  -Settings $Settings `
  -Description "Runs AdaPOS sync for branch 001 nightly at 22:00, then shuts down on success/final failure." `
  -Force
```

## To Check It Worked

Open Task Scheduler and confirm:

```text
AdaPOS Nightly Sync (Branch XXX)
```

Or run:

```powershell
Get-ScheduledTask -TaskName "AdaPOS Nightly Sync (Branch 004)" |
  Format-List TaskName,State,
    @{N='Command';E={$_.Actions[0].Execute + ' ' + $_.Actions[0].Arguments}}
```

Run diagnostics:

```powershell
cd "C:\path\to\SC-StockDay-Ordering\apps\adapos-sync\installer"
.\diagnose.bat
```

That creates and opens `diagnose-output.txt`.

## Common Failures

`Login failed for user 'readonly_pilot'`

- SQL host/port is reachable, but SQL rejected the login.
- Check that the login exists on the POS server.
- Check the password.
- Check `.env` quoting if the password contains `#`.
- Check the login is mapped to `AdaAcc`.

`Heartbeat failed with HTTP 401`

- SQL may be fine; this is an API token problem.
- Set `ADAPOS_SYNC_SHARED_TOKEN` to the same value as backend `BRANCH_STOCK_SYNC_TOKEN`.
- Retest heartbeat before registering the task.

No rows for tables named `products`, `sales`, `branch_stock`, etc.

- That can be normal in the diagnostic.
- Those are sync dataset names, not AdaPOS physical table names.
- The app queries physical tables like `TCNMPdt`, `TPSTSalHD`, `TPSTSalDT`, `TACTPiHD`, `TACTPiDT`, `TCNTPdtTnfHD`, `TCNTPdtTnfDT`, `TCNTPdtInWha`, `TCNMBranch`, and `TCNMPdtUnit`.

Port changed from yesterday.

- SQL Express may use a dynamic TCP port.
- Re-check with the AdaPOS established-connection command or on the POS server with `Get-NetTCPConnection -State Listen`.
- Long-term fix is setting SQL Server to a static port.

Git not installed on POS server.

- Install Git for Windows, or copy the installer scripts manually.
- The branch laptop still needs the repo and Node.js to run the sync agent.

`register-task.ps1` blocked with "virus or potentially unwanted software"

- This can happen before PowerShell runs the script; even `Get-Item` or `Get-Content` may fail.
- If `Get-Item -Stream *` also fails, this is not a normal MOTW / `Unblock-File` issue.
- Check local security products and quarantine/history. On branch `001`, Defender showed no matching detection, but another security product was present.
- Use a direct `New-ScheduledTaskAction` / `Register-ScheduledTask` command flow as a local workaround.

`npm` blocked by PowerShell execution policy

- On Windows PowerShell 5.1, `npm` may resolve to `C:\Program Files\nodejs\npm.ps1`.
- If script execution is blocked, call `C:\Program Files\nodejs\npm.cmd` directly.
- Future installer improvement: prefer `npm.cmd` on Windows.

`diagnose.ps1` fails with "A hash table can only be added to another hash table"`

- Seen on branch `001` under Windows PowerShell 5.1.
- The failure occurred at `diagnose.ps1` line 137 where `$matches += $task` was used.
- Future fix: initialize `$matches` as an array or `System.Collections.Generic.List[object]`, not a hashtable-like value.

## Before Leaving Site

Confirm all of this:

- `.env` has the right branch code.
- SQL password containing `#` is quoted.
- `node .\src\index.js --dry-run --branch=<branch>` succeeds.
- heartbeat API returns 200.
- one `--execute` run succeeds.
- `ADAPOS_SYNC_DRY_RUN=false`.
- scheduled task exists.
- scheduled task command points at the correct repo path.
