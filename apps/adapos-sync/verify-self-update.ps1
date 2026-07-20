# Immediate end-to-end acceptance test for the branch fleet self-updater.
#
# Run from an elevated Windows PowerShell prompt after a one-time bootstrap:
#   .\verify-self-update.ps1 -Branch 005 -ExpectedCommit <canary-sha> -ExpectedMode Advance
#   .\verify-self-update.ps1 -Branch 005 -ExpectedCommit <canary-sha> -ExpectedMode Current
#
# The first command proves an already-installed updater can fetch and pull a
# NEW commit under the production SYSTEM account. The second proves the stable
# already-current path. Do not declare self-update healthy until both pass.

param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d{3}$')]
  [string]$Branch,

  [string]$ExpectedCommit = "",

  [ValidateSet("Advance", "Current", "Either")]
  [string]$ExpectedMode = "Either",

  [ValidateRange(30, 600)]
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

function Find-GitRepositoryRoot([string]$StartPath) {
  $current = [System.IO.DirectoryInfo](Get-Item -LiteralPath $StartPath)
  while ($null -ne $current) {
    if (Test-Path -LiteralPath (Join-Path $current.FullName ".git")) {
      return $current.FullName
    }
    $current = $current.Parent
  }
  return ""
}

function Invoke-GitRead([string[]]$Arguments) {
  $local:ErrorActionPreference = "Continue"
  $raw = & git @GitPrefix @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = (($raw | ForEach-Object { "$_" }) -join " ").Trim()
  if ($exitCode -ne 0) {
    throw "git $($Arguments -join ' ') failed (exit $exitCode): $text"
  }
  return $text
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$administratorRole = [Security.Principal.WindowsBuiltInRole]::Administrator
if (-not $principal.IsInRole($administratorRole)) {
  throw "Run this script from Windows PowerShell opened with 'Run as administrator'."
}

$ScriptDir = $PSScriptRoot
$Launcher = Join-Path $ScriptDir "open-adapos-and-sync.ps1"
$LogDir = Join-Path $ScriptDir "logs"
$RepoRoot = Find-GitRepositoryRoot -StartPath $ScriptDir

if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
  throw "Launcher not found: $Launcher"
}
if (-not $RepoRoot) {
  throw "No .git directory found in the launcher path or its parents."
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git is not available on PATH for the Administrator account."
}

$GitPrefix = @("-c", "safe.directory=$RepoRoot", "-C", $RepoRoot)
$BeforeHead = Invoke-GitRead -Arguments @("rev-parse", "HEAD")
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$TaskName = "ADAPOS-SelfUpdate-Verify-$Branch-$Timestamp"
$StartedAt = Get-Date

$PowerShellExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$LauncherArgument = $Launcher.Replace('"', '\"')
$TaskArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$LauncherArgument`" -Branch $Branch -SelfUpdateOnly"
$Action = New-ScheduledTaskAction `
  -Execute $PowerShellExe `
  -Argument $TaskArguments `
  -WorkingDirectory $ScriptDir
$TaskPrincipal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Seconds $TimeoutSeconds)

try {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Principal $TaskPrincipal `
    -Settings $Settings `
    -Force | Out-Null

  Start-ScheduledTask -TaskName $TaskName
  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds + 15)

  do {
    Start-Sleep -Seconds 1
    $State = (Get-ScheduledTask -TaskName $TaskName).State
    if ((Get-Date) -gt $Deadline) {
      throw "Self-update verification timed out; task state: $State"
    }
  } while ($State -in @("Running", "Queued"))

  $TaskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
  $AfterHead = Invoke-GitRead -Arguments @("rev-parse", "HEAD")
  $OriginHead = Invoke-GitRead -Arguments @("rev-parse", "origin/main")

  $RunLog = Get-ChildItem -LiteralPath $LogDir -Filter "sync-*.log" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $StartedAt.AddSeconds(-2) } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  $RunLogText = if ($RunLog) { Get-Content -LiteralPath $RunLog.FullName -Raw } else { "" }

  Write-Host "===== SELF-UPDATE ACCEPTANCE =====" -ForegroundColor Cyan
  Write-Host "Task account:   SYSTEM"
  Write-Host "Task result:    $($TaskInfo.LastTaskResult)"
  Write-Host "Expected mode:  $ExpectedMode"
  Write-Host "HEAD before:    $BeforeHead"
  Write-Host "HEAD after:     $AfterHead"
  Write-Host "origin/main:    $OriginHead"
  if ($RunLog) {
    Write-Host "Run log:        $($RunLog.FullName)"
    Write-Host ""
    Get-Content -LiteralPath $RunLog.FullName
  } else {
    Write-Host "Run log:        NOT FOUND"
  }

  $Failures = @()
  if ($TaskInfo.LastTaskResult -ne 0) {
    $Failures += "Scheduled Task returned $($TaskInfo.LastTaskResult)."
  }
  if ($AfterHead -ne $OriginHead) {
    $Failures += "Local HEAD does not match origin/main."
  }
  if ($ExpectedCommit -and -not $AfterHead.StartsWith($ExpectedCommit, [StringComparison]::OrdinalIgnoreCase)) {
    $Failures += "HEAD '$AfterHead' does not match expected commit '$ExpectedCommit'."
  }
  if (-not $RunLog) {
    $Failures += "No self-update run log was created."
  }

  $TerminalResults = [regex]::Matches($RunLogText, 'SELF-UPDATE: RESULT=(UPDATED|CURRENT|FAILED)(?:\s|$)')
  if ($TerminalResults.Count -ne 1) {
    $Failures += "Expected exactly one terminal RESULT log, found $($TerminalResults.Count)."
  } elseif ($TerminalResults[0].Groups[1].Value -eq "FAILED") {
    $Failures += "Self-update reported RESULT=FAILED."
  }

  if ($ExpectedMode -eq "Advance") {
    if ($BeforeHead -eq $AfterHead) {
      $Failures += "Expected HEAD to advance, but it did not change."
    }
    if ($RunLogText -notmatch "SELF-UPDATE: RESULT=UPDATED(?:\s|$)") {
      $Failures += "RESULT=UPDATED terminal log was not found."
    }
  } elseif ($ExpectedMode -eq "Current") {
    if ($BeforeHead -ne $AfterHead) {
      $Failures += "Expected HEAD to remain current, but it changed."
    }
    if ($RunLogText -notmatch "SELF-UPDATE: RESULT=CURRENT(?:\s|$)") {
      $Failures += "RESULT=CURRENT terminal log was not found."
    }
  }

  if ($Failures.Count -gt 0) {
    throw "SELF-UPDATE ACCEPTANCE FAILED: $($Failures -join ' ')"
  }

  Write-Host "SELF-UPDATE ACCEPTANCE PASSED" -ForegroundColor Green
}
finally {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
}
