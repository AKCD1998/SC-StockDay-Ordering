# register-task.ps1
# Registers a Windows Scheduled Task that fires RUN-ADAPOS-SYNC.bat at 08:20
# and 19:20 daily for this machine.
#
# Run this ONCE per machine, as Administrator:
#   powershell -ExecutionPolicy Bypass -File register-task.ps1 -Branch 000
#
# To remove the task later:
#   Unregister-ScheduledTask -TaskName "AdaPOS Sync (Branch 000)" -Confirm:$false

param(
  [string]$Branch   = "000",
  [string]$TaskName = ""
)

# --- Sanity checks ----------------------------------------------------------
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "This script must be run as Administrator. Right-click PowerShell -> Run as administrator, then re-run."
  exit 1
}

if (-not $TaskName) {
  $TaskName = "AdaPOS Sync (Branch $Branch)"
}

$ScriptDir  = $PSScriptRoot
$BatScript  = Join-Path $ScriptDir "RUN-ADAPOS-SYNC.bat"

if (-not (Test-Path $BatScript)) {
  Write-Error "Could not find RUN-ADAPOS-SYNC.bat at: $BatScript"
  exit 1
}

# --- Remove existing task with the same name (idempotent) -------------------
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Output "Existing task '$TaskName' found - replacing it."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# --- Build the task ---------------------------------------------------------
# Action: cmd.exe calls the .bat with "nopause" so the window doesn't hang
# waiting for a keypress when run unattended by Task Scheduler.
$Action = New-ScheduledTaskAction `
  -Execute   "cmd.exe" `
  -Argument  "/c `"$BatScript`" nopause" `
  -WorkingDirectory $ScriptDir

# Triggers: daily at 08:20 and 19:20.
$Triggers = @(
  (New-ScheduledTaskTrigger -Daily -At "08:20"),
  (New-ScheduledTaskTrigger -Daily -At "19:20")
)

# Settings:
#   - StartWhenAvailable: if the trigger was missed (PC was off), run as soon as PC comes back on
#   - ExecutionTimeLimit: kill the task if it hangs past 1h (sync should finish in ~5 min)
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# Principal: run as SYSTEM with highest privileges.
#   - No password to manage / expire
#   - Works whether anyone is logged in or not
$Principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

# --- Register ---------------------------------------------------------------
Register-ScheduledTask `
  -TaskName    $TaskName `
  -Action      $Action `
  -Trigger     $Triggers `
  -Settings    $Settings `
  -Principal   $Principal `
  -Description "Runs RUN-ADAPOS-SYNC.bat at 08:20 and 19:20 daily for branch $Branch." | Out-Null

Write-Output ""
Write-Output "Task registered:"
Get-ScheduledTask -TaskName $TaskName |
  Format-List TaskName, State,
    @{N='NextRun';   E={(Get-ScheduledTaskInfo $_).NextRunTime}},
    @{N='Command';   E={ $_.Actions[0].Execute + ' ' + $_.Actions[0].Arguments }}

Write-Output ""
Write-Output "Done. The task will fire at 08:20 and 19:20 every day."
Write-Output "To remove it later:  Unregister-ScheduledTask -TaskName `"$TaskName`" -Confirm:`$false"
