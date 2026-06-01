# open-adapos-and-sync.ps1
# Opens AdaPosBack, signs in, waits for AdaPOS to settle, then runs one live sync.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\open-adapos-and-sync.ps1 -Branch 005
#
# Test without typing login:
#   powershell -ExecutionPolicy Bypass -File .\open-adapos-and-sync.ps1 -Branch 005 -SkipLogin

param(
  [string]$Branch = "",
  [string]$AdaPosExe = "D:\AdaSoft\AdaPos4.0HpmFhn\AdaPos\AdaPosBack.exe",
  [string]$AdaUsername = "dao1",
  [string]$AdaPassword = "dao1",
  [string]$NodeExe = "C:\Program Files\nodejs\node.exe",
  [int]$LaunchWaitSeconds = 20,
  [int]$AfterLoginWaitSeconds = 60,
  [int]$MaxRetries = 3,
  [int]$RetryWaitSeconds = 120,
  [switch]$SkipLogin
)

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

$LogDir = Join-Path $ScriptDir "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogPath = Join-Path $LogDir ("open-adapos-and-sync-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Output $line
  Add-Content -Path $LogPath -Value $line
}

function Protect-SendKeysText([string]$Text) {
  # WScript.SendKeys treats these characters as syntax, so wrap them in braces.
  return ($Text -replace "([+^%~(){}\[\]])", '{$1}')
}

function Get-EnvValue([string]$Key) {
  $line = Get-Content ".env" -ErrorAction SilentlyContinue |
          Where-Object { $_ -match "^$Key=" } |
          Select-Object -First 1
  if ($line) { return ($line -replace "^$Key=", "").Trim() }
  return ""
}

function Wait-ForMainWindow([System.Diagnostics.Process]$Process, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $Process.Refresh()
    if ($Process.MainWindowHandle -ne 0) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

if (-not (Test-Path -LiteralPath $AdaPosExe)) {
  throw "AdaPOS executable not found: $AdaPosExe"
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

Write-Log "Opening AdaPOS: $AdaPosExe"
$adaProcess = Start-Process -FilePath $AdaPosExe -PassThru

if (-not (Wait-ForMainWindow -Process $adaProcess -TimeoutSeconds $LaunchWaitSeconds)) {
  Write-Log "WARNING: AdaPOS window was not detected within $LaunchWaitSeconds seconds. Continuing anyway."
} else {
  Write-Log "AdaPOS window detected."
}

if (-not $SkipLogin) {
  Write-Log "Attempting AdaPOS login as $AdaUsername."
  $shell = New-Object -ComObject WScript.Shell
  $activated = $false

  for ($i = 1; $i -le 10; $i++) {
    if ($shell.AppActivate($adaProcess.Id)) {
      $activated = $true
      break
    }
    Start-Sleep -Seconds 1
  }

  if ($activated) {
    Start-Sleep -Milliseconds 700
    $safeUsername = Protect-SendKeysText $AdaUsername
    $safePassword = Protect-SendKeysText $AdaPassword
    $shell.SendKeys("$safeUsername{TAB}$safePassword{ENTER}")
    Write-Log "Login keys sent. If AdaPOS used a different field order, sign in manually and rerun with -SkipLogin."
  } else {
    Write-Log "WARNING: Could not focus AdaPOS. Please sign in manually if needed."
  }
} else {
  Write-Log "Skipping login automation."
}

Write-Log "Waiting $AfterLoginWaitSeconds seconds before syncing."
Start-Sleep -Seconds $AfterLoginWaitSeconds

$success = $false
for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
  Write-Log "Starting sync attempt $attempt of $MaxRetries for branch $Branch."
  & $NodeExe "src/index.js" "--execute" "--branch=$Branch" 2>&1 | Tee-Object -FilePath $LogPath -Append

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
