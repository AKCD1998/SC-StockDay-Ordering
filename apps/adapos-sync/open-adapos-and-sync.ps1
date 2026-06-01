# open-adapos-and-sync.ps1
# Runs the branch sync. AdaPOS Back Office must already be open and logged in.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\open-adapos-and-sync.ps1 -Branch 005

param(
  [string]$Branch = "",
  [string]$NodeExe = "C:\Program Files\nodejs\node.exe",
  [int]$MaxRetries = 3,
  [int]$RetryWaitSeconds = 120
)

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

$LogDir = Join-Path $ScriptDir "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogPath = Join-Path $LogDir ("sync-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Output $line
  Add-Content -Path $LogPath -Value $line
}

function Get-EnvValue([string]$Key) {
  $line = Get-Content ".env" -ErrorAction SilentlyContinue |
          Where-Object { $_ -match "^$Key=" } |
          Select-Object -First 1
  if ($line) { return ($line -replace "^$Key=", "").Trim() }
  return ""
}

function Invoke-LoggedProcess {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList
  )

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
  $stdoutPath = Join-Path $LogDir "stdout-$stamp.log"
  $stderrPath = Join-Path $LogDir "stderr-$stamp.log"

  $process = Start-Process `
    -FilePath $FilePath `
    -ArgumentList $ArgumentList `
    -WorkingDirectory $ScriptDir `
    -NoNewWindow `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath

  foreach ($path in @($stdoutPath, $stderrPath)) {
    if (Test-Path -LiteralPath $path) {
      Get-Content -LiteralPath $path | ForEach-Object {
        Write-Host $_
        Add-Content -Path $LogPath -Value $_
      }
      Remove-Item -LiteralPath $path -Force
    }
  }

  return $process.ExitCode
}

if (-not (Test-Path -LiteralPath $NodeExe)) {
  throw "Node.js executable not found: $NodeExe"
}

if (-not (Test-Path -LiteralPath ".env")) {
  Write-Log "WARNING: .env not found in $ScriptDir. The sync may fail unless environment variables are set elsewhere."
}

if (-not $Branch) {
  $Branch = Get-EnvValue "ADAPOS_SYNC_BRANCH_CODE"
}

if (-not $Branch) {
  throw "Branch is required. Pass -Branch 005 or set ADAPOS_SYNC_BRANCH_CODE in apps\adapos-sync\.env."
}

$success = $false
for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
  Write-Log "Starting sync attempt $attempt of $MaxRetries for branch $Branch."
  $exitCode = Invoke-LoggedProcess -FilePath $NodeExe -ArgumentList @(
    "src/index.js",
    "--execute",
    "--branch=$Branch"
  )
  $global:LASTEXITCODE = $exitCode

  if ($LASTEXITCODE -eq 0) {
    $success = $true
    Write-Log "Sync succeeded."
    break
  }

  Write-Log "Sync attempt $attempt failed with exit code $LASTEXITCODE."
  if ($attempt -lt $MaxRetries) {
    Write-Log "Waiting $RetryWaitSeconds seconds before retry."
    Start-Sleep -Seconds $RetryWaitSeconds
  }
}

if (-not $success) {
  throw "Sync failed after $MaxRetries attempts. See log: $LogPath"
}

Write-Log "Done. Log saved to $LogPath"
