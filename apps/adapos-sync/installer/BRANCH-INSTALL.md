# Branch Laptop Install Guide

Use this guide when installing `apps/adapos-sync` on a branch laptop.

This file also documents the branch `004` pain points from the 2026-05-28 install so the next Codex/Claude/technician does not lose time on the same traps.

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

