# open-adapos-and-sync.ps1
# Runs the branch sync directly against the local SQL Server.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\open-adapos-and-sync.ps1 -Branch 005

param(
  [string]$Branch = "",
  [string]$NodeExe = "C:\Program Files\nodejs\node.exe"
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

  # "Continue" lets node's stderr flow through the 2>&1 pipe as ErrorRecords
  # rather than terminating the pipeline (which "Stop" would do, silencing the error).
  $local:ErrorActionPreference = "Continue"
  & $FilePath @ArgumentList 2>&1 | ForEach-Object {
    $line = if ($_ -is [System.Management.Automation.ErrorRecord]) {
      if ($null -ne $_.TargetObject) { "$($_.TargetObject)" } else { $_.Exception.Message }
    } else { "$_" }
    Write-Host $line
    Add-Content -Path $LogPath -Value $line
  }

  return $LASTEXITCODE
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

Write-Log "Starting sync for branch $Branch."
$exitCode = Invoke-LoggedProcess -FilePath $NodeExe -ArgumentList @(
  "src/index.js",
  "--execute",
  "--branch=$Branch"
)
$global:LASTEXITCODE = $exitCode

if ($LASTEXITCODE -ne 0) {
  throw "Sync failed with exit code $LASTEXITCODE. See log: $LogPath"
}

Write-Log "Sync succeeded."

Write-Log "Done. Log saved to $LogPath"
