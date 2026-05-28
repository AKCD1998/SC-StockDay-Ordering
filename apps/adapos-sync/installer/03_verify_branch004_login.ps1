Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AgentDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$EnvPath = Join-Path $AgentDir ".env"
$Server = "192.168.1.102"
$Port = 49976
$Database = "AdaAcc"
$Branch = "004"
$User = "readonly_pilot"

function Convert-SecureStringToPlainText {
  param([Security.SecureString]$SecureString)
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Set-EnvValue {
  param(
    [string[]]$Lines,
    [string]$Key,
    [string]$Value
  )

  $line = "$Key=$Value"
  $found = $false
  $updated = foreach ($item in $Lines) {
    if ($item -match "^$([regex]::Escape($Key))=") {
      $found = $true
      $line
    } else {
      $item
    }
  }
  if (-not $found) {
    $updated += $line
  }
  return $updated
}

Write-Host "Testing SQL login for branch $Branch against $Server,$Port / $Database"
$passwordSecure = Read-Host "Enter SQL password for $User" -AsSecureString
$password = Convert-SecureStringToPlainText -SecureString $passwordSecure

$env:ADAPOS_SQLSERVER_HOST = $Server
$env:ADAPOS_SQLSERVER_PORT = [string]$Port
$env:ADAPOS_SQLSERVER_DATABASE = $Database
$env:ADAPOS_SQLSERVER_USER = $User
$env:ADAPOS_SQLSERVER_PASSWORD = $password

Push-Location $AgentDir
try {
  $probe = @'
import sql from "mssql";

const config = {
  server: process.env.ADAPOS_SQLSERVER_HOST,
  port: Number(process.env.ADAPOS_SQLSERVER_PORT),
  user: process.env.ADAPOS_SQLSERVER_USER,
  password: process.env.ADAPOS_SQLSERVER_PASSWORD,
  database: process.env.ADAPOS_SQLSERVER_DATABASE,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 8000,
  requestTimeout: 8000,
};

try {
  const pool = await sql.connect(config);
  const result = await pool.request().query("select SYSTEM_USER as systemUser, DB_NAME() as dbName, GETDATE() as serverTime");
  console.log("SQL_LOGIN_OK");
  console.log(JSON.stringify(result.recordset[0]));
  await pool.close();
} catch (err) {
  console.log("SQL_LOGIN_FAILED");
  console.log("code=" + (err.code ?? ""));
  console.log("message=" + err.message);
  process.exit(1);
}
'@
  $probe | node --input-type=module
  if ($LASTEXITCODE -ne 0) {
    throw "SQL login test failed."
  }

  Write-Host ""
  Write-Host "Updating .env with verified branch connection values..."
  $lines = if (Test-Path -LiteralPath $EnvPath) { Get-Content -LiteralPath $EnvPath } else { @() }
  $lines = Set-EnvValue -Lines $lines -Key "ADAPOS_SYNC_BRANCH_CODE" -Value $Branch
  $lines = Set-EnvValue -Lines $lines -Key "ADAPOS_SQLSERVER_HOST" -Value $Server
  $lines = Set-EnvValue -Lines $lines -Key "ADAPOS_SQLSERVER_PORT" -Value ([string]$Port)
  $lines = Set-EnvValue -Lines $lines -Key "ADAPOS_SQLSERVER_DATABASE" -Value $Database
  $lines = Set-EnvValue -Lines $lines -Key "ADAPOS_SQLSERVER_USER" -Value $User
  $lines = Set-EnvValue -Lines $lines -Key "ADAPOS_SQLSERVER_PASSWORD" -Value $password
  $lines = Set-EnvValue -Lines $lines -Key "ADAPOS_SYNC_DRY_RUN" -Value "true"
  $content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($EnvPath, $content, $utf8NoBom)

  Write-Host ""
  Write-Host "Running the app dry-run..."
  node "src/index.js" "--dry-run" "--branch=$Branch"
  if ($LASTEXITCODE -ne 0) {
    throw "App dry-run failed."
  }

  Write-Host ""
  Write-Host "Verification passed. Now run installer\\install.ps1 and choose K to keep the verified .env."
} finally {
  Pop-Location
}

