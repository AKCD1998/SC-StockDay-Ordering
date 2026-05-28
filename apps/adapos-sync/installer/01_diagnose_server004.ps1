Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$Database = "AdaAcc"
$Login = "readonly_pilot"
$RequiredTables = @(
  "products",
  "sales",
  "branch_stock",
  "transfers",
  "transfer_lines",
  "pending_receipts",
  "approved_receipts"
)

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

Write-Section "Machine"
Write-Host "Computer: $env:COMPUTERNAME"
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "169.254.*" } |
  Format-Table IPAddress, InterfaceAlias -AutoSize

Write-Section "Listening ports"
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    [pscustomobject]@{
      LocalAddress  = $_.LocalAddress
      LocalPort     = $_.LocalPort
      OwningProcess = $_.OwningProcess
      Process       = $p.ProcessName
    }
  }
$listeners | Sort-Object LocalPort | Format-Table -AutoSize

Write-Host ""
Write-Host "Likely SQL Server listeners:"
$listeners |
  Where-Object { $_.Process -eq "sqlservr" -or $_.LocalPort -in 1433,1434,49976 } |
  Sort-Object LocalPort |
  Format-Table -AutoSize

Write-Section "SQL services"
Get-Service -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "MSSQL*" -or $_.DisplayName -like "*SQL Server*" } |
  Sort-Object Name |
  Format-Table Status, Name, DisplayName -AutoSize

Write-Section "sqlcmd"
$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmd) {
  Write-Host "sqlcmd was not found. Install SSMS/sqlcmd or run the queries below in SSMS."
  Write-Host ""
  Write-Host "SSMS fallback queries:"
  Write-Host "SELECT SERVERPROPERTY('IsIntegratedSecurityOnly') AS WindowsOnlyAuth;"
  Write-Host "SELECT name, state_desc FROM sys.databases WHERE name = N'$Database';"
  Write-Host "SELECT name, is_disabled FROM sys.sql_logins WHERE name = N'$Login';"
  exit 0
}
Write-Host "sqlcmd: $($sqlcmd.Source)"

$Server = "localhost"
Write-Section "SQL instance checks using Windows Authentication"
$query = @"
SET NOCOUNT ON;
SELECT
  @@SERVERNAME AS server_name,
  SERVERPROPERTY('ProductVersion') AS product_version,
  SERVERPROPERTY('Edition') AS edition,
  SERVERPROPERTY('IsIntegratedSecurityOnly') AS windows_only_auth;

SELECT name, state_desc
FROM sys.databases
WHERE name = N'$Database';

SELECT name, is_disabled, is_policy_checked, is_expiration_checked
FROM sys.sql_logins
WHERE name = N'$Login';
"@
sqlcmd -S $Server -E -Q $query

Write-Section "AdaAcc user, roles, and table SELECT checks"
$tableList = ($RequiredTables | ForEach-Object { "N'$_'" }) -join ","
$dbQuery = @"
SET NOCOUNT ON;
USE [$Database];

SELECT dp.name AS database_user, dp.type_desc
FROM sys.database_principals dp
WHERE dp.name = N'$Login';

SELECT rp.name AS database_role, mp.name AS member_name
FROM sys.database_role_members drm
JOIN sys.database_principals rp ON rp.principal_id = drm.role_principal_id
JOIN sys.database_principals mp ON mp.principal_id = drm.member_principal_id
WHERE mp.name = N'$Login';

SELECT s.name AS schema_name, t.name AS table_name
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE t.name IN ($tableList)
ORDER BY t.name, s.name;

EXECUTE AS USER = N'$Login';
SELECT s.name AS schema_name,
       t.name AS table_name,
       HAS_PERMS_BY_NAME(QUOTENAME(s.name) + N'.' + QUOTENAME(t.name), 'OBJECT', 'SELECT') AS can_select
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE t.name IN ($tableList)
ORDER BY t.name, s.name;
REVERT;
"@
sqlcmd -S $Server -E -d $Database -Q $dbQuery

