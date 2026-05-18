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
