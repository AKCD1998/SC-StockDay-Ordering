# Branch laptop install guide

Use these steps from the branch laptop after the repo is already on that machine.

## Steps

1. Install Node.js 20+ and Git for Windows.
2. Clone this repo onto the laptop:

```powershell
git clone https://github.com/AKCD1998/SC-StockDay-Ordering.git
```

3. Open PowerShell as Administrator.
4. Go to:

```powershell
cd "C:\path\to\SC-StockDay-Ordering\apps\adapos-sync\installer"
```

5. Run:

```powershell
.\install.ps1
```

6. Answer the prompts:

- `ADAPOS_SYNC_BRANCH_CODE` = branch code like `000`, `001`, `003`, `004`, `005`
- `ADAPOS_SQLSERVER_HOST` = usually `localhost` unless SQL Server is elsewhere
- `ADAPOS_SQLSERVER_PORT` = usually `1433`
- `ADAPOS_SQLSERVER_USER`
- `ADAPOS_SQLSERVER_PASSWORD`
- `ADAPOS_SQLSERVER_DATABASE` = usually `AdaAcc`
- `ADAPOS_SYNC_API_BASE_URL` = usually `https://paasrtsm-project.onrender.com`
- `ADAPOS_SYNC_SHARED_TOKEN` = the shared API token

## Find the AdaPOS SQL host and port

If you do not know `ADAPOS_SQLSERVER_HOST` or `ADAPOS_SQLSERVER_PORT`, open the main AdaPOS app first and wait until it has connected to its database. Then run this in PowerShell on the same computer:

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

Look for the row where `Process` is AdaPOS or AdaSoft. Use that row like this:

```env
ADAPOS_SQLSERVER_HOST=<RemoteAddress>
ADAPOS_SQLSERVER_PORT=<RemotePort>
ADAPOS_SQLSERVER_DATABASE=AdaAcc
```

For example, if the command shows:

```text
RemoteAddress RemotePort Process
------------- ---------- -------
192.168.1.106      49976 AdaPosBack
```

Use:

```env
ADAPOS_SQLSERVER_HOST=192.168.1.106
ADAPOS_SQLSERVER_PORT=49976
ADAPOS_SQLSERVER_DATABASE=AdaAcc
```

After that the script will:

- install dependencies
- create `apps/adapos-sync/.env`
- run a dry-run sync test
- test the heartbeat API
- register the nightly scheduled task for `22:00`

## To check it worked

- Look for the final summary in the script output.
- Open Task Scheduler and confirm `AdaPOS Nightly Sync (Branch XXX)` exists.
- Run:

```powershell
.\diagnose.bat
```

That creates and opens `diagnose-output.txt`.

## If something fails

- Run `diagnose.bat`.
- Send `diagnose-output.txt` back to the engineer.
- If needed, rerun `.\install.ps1` to repair or update settings.

Before using this on other branches, commit and push these installer files so the other laptops can clone the version that includes them.
