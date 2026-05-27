# Mother PC Setup

The live adaPOS database is not expected to be reachable from the development machine. The sync service should be installed on the mother PC later.

## What the sync service needs

- Node.js 18+
- Network access to the app API
- Read-only SQL Server access to `AdaAcc`
- `.env` populated with the mother-PC SQL Server connection settings

## Required environment values

```env
ADAPOS_SQLSERVER_HOST=mother-pc-or-sql-host
ADAPOS_SQLSERVER_PORT=1433
ADAPOS_SQLSERVER_USER=readonly_user
ADAPOS_SQLSERVER_PASSWORD=change_me
ADAPOS_SQLSERVER_DATABASE=AdaAcc
ADAPOS_SYNC_INTERVAL_MINUTES=10
ADAPOS_SYNC_DRY_RUN=false
ADAPOS_SYNC_API_BASE_URL=http://your-api-host:4000
```

## Branch 005 lesson learned

Do not assume the mother PC SQL Server is `.\SQLEXPRESS` on port `1433`.

On branch `005`, AdaPOS had real data, but the sync agent failed because we were
pointing it at the wrong SQL endpoint. Windows did not show a local SQL service
on `localhost:1433`, while AdaPOS was already connected to SQL Server over the
network.

The working branch `005` SQL endpoint found on 2026-05-27 was:

```env
ADAPOS_SQLSERVER_HOST=192.168.0.127
ADAPOS_SQLSERVER_PORT=49684
ADAPOS_SQLSERVER_DATABASE=AdaAcc
ADAPOS_SYNC_BRANCH_CODE=005
```

Important mistake to remember:

- Editing the repo root `.env` is not enough for the sync agent.
- The sync agent reads `apps/adapos-sync/.env` when run from `apps/adapos-sync`.
- Keep the AdaPOS sync values in both files aligned if the root `.env` is used as a reference.
- Do not paste API tokens into this doc. Put the real token in `apps/adapos-sync/.env`.

How we found the real SQL endpoint:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -like '*Ada*' -or $_.ExecutablePath -like '*AdaSoft*' } |
  Select-Object ProcessId, Name, ExecutablePath, CommandLine

Get-NetTCPConnection -State Established |
  ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    [pscustomobject]@{
      LocalAddress  = $_.LocalAddress
      LocalPort     = $_.LocalPort
      RemoteAddress = $_.RemoteAddress
      RemotePort    = $_.RemotePort
      Process       = $p.ProcessName
      Pid           = $_.OwningProcess
    }
  } |
  Where-Object { $_.Process -like '*Ada*' -or $_.RemotePort -in 1433,1434 } |
  Format-Table -AutoSize
```

For branch `005`, that showed AdaPOS connected to `192.168.0.127:49684`.
Testing that endpoint confirmed:

```text
SQL Server name: DESKTOP-TQ7J8HJ\SQLEXPRESS
Database: AdaAcc
Version: SQL Server 2008 R2
```

Successful dry run on branch `005` read:

```text
products: 6464 rows
sales: 1338 rows
transfers: 167 rows
transfer_lines: 2534 rows
branch_stock: 38502 rows
Total records read: 49005
```

Successful live run sent:

```text
products: 6464 sent
sales: 1338 sent
transfers: 167 headers, 2534 lines accepted
branch_stock: 6417 snapshots sent
Done. 16920 records sent to API.
```

## First test on mother PC

Run dry-run first:

```powershell
cd "C:\path\to\SC-StockDay-Ordering"
Copy-Item apps\adapos-sync\.env.example apps\adapos-sync\.env
npm install
npm run dev:sync
```

## Suggested rollout

1. Verify SQL Server connection using read-only credentials
2. Run dry-run mode and confirm payload sizes
3. Enable live API posting
4. Register the sync service with Windows Task Scheduler or a Windows service wrapper

## Small inspection commands for the mother PC

If deeper adaPOS verification is needed later, ask for small copy-paste-friendly checks only. Example:

```sql
SELECT TOP 10 FTPdtCode, FTPdtName, FTPdtBarCode1, FCPdtQtyNow
FROM TCNMPdt
ORDER BY FTPdtCode;
```
