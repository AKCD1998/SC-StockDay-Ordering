# register-task.ps1
# Registers a Windows Scheduled Task that fires sync-and-shutdown.ps1 every
# night at 22:00 for this branch laptop.
#
# Run this ONCE per laptop, as Administrator:
#   powershell -ExecutionPolicy Bypass -File register-task.ps1 -Branch 005
#
# To remove the task later:
#   Unregister-ScheduledTask -TaskName "AdaPOS Nightly Sync (Branch 005)" -Confirm:$false

param(
  [string]$Branch   = "005",
  [string]$RunTime  = "22:00",
  [string]$TaskName = ""
)

# --- Sanity checks ----------------------------------------------------------
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "This script must be run as Administrator. Right-click PowerShell -> Run as administrator, then re-run."
  exit 1
}

if (-not $TaskName) {
  $TaskName = "AdaPOS Nightly Sync (Branch $Branch)"
}

$ScriptDir  = $PSScriptRoot
$SyncScript = Join-Path $ScriptDir "sync-and-shutdown.ps1"

if (-not (Test-Path $SyncScript)) {
  Write-Error "Could not find sync-and-shutdown.ps1 at: $SyncScript"
  exit 1
}

# --- Remove existing task with the same name (idempotent) -------------------
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Output "Existing task '$TaskName' found - replacing it."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# --- Build the task ---------------------------------------------------------
# Action: launch powershell.exe with the wrapper script.
# Quoting the path with backticked double-quotes so spaces / Thai chars are preserved.
$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$SyncScript`" -Branch $Branch"

# Trigger: daily at $RunTime.
$Trigger = New-ScheduledTaskTrigger -Daily -At $RunTime

# Settings:
#   - AllowStartIfOnBatteries / DontStopIfGoingOnBatteries: laptop on battery still runs
#   - StartWhenAvailable: if 22:00 was missed (PC was off), run as soon as PC comes back on
#   - ExecutionTimeLimit: kill the task if it hangs past 1h (sync should finish in ~5 min)
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# Principal: run as SYSTEM with highest privileges.
#   - No password to manage / expire
#   - Works whether anyone is logged in or not
#   - SYSTEM has rights to shutdown.exe /s /f
$Principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

# --- Register ---------------------------------------------------------------
Register-ScheduledTask `
  -TaskName    $TaskName `
  -Action      $Action `
  -Trigger     $Trigger `
  -Settings    $Settings `
  -Principal   $Principal `
  -Description "Runs sync-and-shutdown.ps1 at $RunTime nightly for branch $Branch, then shuts the PC down." | Out-Null

Write-Output ""
Write-Output "Task registered:"
Get-ScheduledTask -TaskName $TaskName |
  Format-List TaskName, State,
    @{N='NextRun';   E={(Get-ScheduledTaskInfo $_).NextRunTime}},
    @{N='Command';   E={ $_.Actions[0].Execute + ' ' + $_.Actions[0].Arguments }}

Write-Output ""
Write-Output "Done. The task will fire at $RunTime every day."
Write-Output "To remove it later:  Unregister-ScheduledTask -TaskName `"$TaskName`" -Confirm:`$false"
