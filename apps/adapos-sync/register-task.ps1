# register-task.ps1
# Registers TWO Windows Scheduled Tasks for this machine:
#   - 08:20 daily: normal full sync
#   - 19:20 daily: same sync, but passes "eveningcheck" to RUN-ADAPOS-SYNC.bat,
#     which adds --skip-if-synced-today so it only re-sends stock if the
#     morning run didn't already succeed (AdaPOS itself only recomputes
#     current stock once a day, so an unconditional evening resend would
#     just repost identical numbers).
#
# Run this ONCE per machine, as Administrator:
#   powershell -ExecutionPolicy Bypass -File register-task.ps1 -Branch 000
#
# To remove the tasks later:
#   Unregister-ScheduledTask -TaskName "AdaPOS Sync (Branch 000) - Morning" -Confirm:$false
#   Unregister-ScheduledTask -TaskName "AdaPOS Sync (Branch 000) - Evening" -Confirm:$false

param(
  [string]$Branch   = "000",
  [string]$TaskName = "",
  # Register both tasks disabled and leave them disabled. Intended for
  # reversible cutover: create the new tasks first, verify them, and only
  # then flip the old task off and these on as separate, deliberate steps.
  # Does not change any other behavior when omitted.
  [switch]$InitiallyDisabled
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

$MorningTaskName = "$TaskName - Morning"
$EveningTaskName = "$TaskName - Evening"

# --- Remove existing tasks with the same names (idempotent) ------------------
foreach ($name in @($MorningTaskName, $EveningTaskName)) {
  $existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Output "Existing task '$name' found - replacing it."
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
  }
}

# --- Build the actions --------------------------------------------------------
# "nopause" so the window doesn't hang waiting for a keypress when run
# unattended. "eveningcheck" (evening only) makes the .bat add
# -SkipIfSyncedToday when it calls open-adapos-and-sync.ps1.
$MorningAction = New-ScheduledTaskAction `
  -Execute   "cmd.exe" `
  -Argument  "/c `"$BatScript`" nopause" `
  -WorkingDirectory $ScriptDir

$EveningAction = New-ScheduledTaskAction `
  -Execute   "cmd.exe" `
  -Argument  "/c `"$BatScript`" nopause eveningcheck" `
  -WorkingDirectory $ScriptDir

# Settings:
#   - StartWhenAvailable: if the trigger was missed (PC was off), run as soon as PC comes back on
#     (kept on even for -InitiallyDisabled tasks: it only affects a *future*
#     missed run after they are deliberately enabled, not registration).
#   - ExecutionTimeLimit: kill the task if it hangs past 1h (sync should finish in ~5 min)
#   - Disable: when -InitiallyDisabled is passed, the task is created already
#     disabled by Register-ScheduledTask itself. There is no window where it
#     exists enabled -- a prior version registered enabled and then called
#     Disable-ScheduledTask as a second step, which left a brief race where a
#     freshly-registered task could fire before being disabled.
$SettingsParams = @{
  AllowStartIfOnBatteries    = $true
  DontStopIfGoingOnBatteries = $true
  StartWhenAvailable         = $true
  ExecutionTimeLimit         = (New-TimeSpan -Hours 1)
}
if ($InitiallyDisabled) { $SettingsParams["Disable"] = $true }
$Settings = New-ScheduledTaskSettingsSet @SettingsParams

# Principal: run as SYSTEM with highest privileges.
#   - No password to manage / expire
#   - Works whether anyone is logged in or not
$Principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

# First occurrence must be in the future: a StartBoundary already in the past
# still works (Windows computes the next daily NextRunTime correctly either
# way), but an already-past StartBoundary on a freshly-registered task is
# needless ambiguity for anyone reading the task later, and this fixes it for
# free while addressing the -InitiallyDisabled registration race above.
$now = Get-Date
$morningTime = Get-Date -Hour 8 -Minute 20 -Second 0 -Millisecond 0
if ($now -ge $morningTime) { $morningTime = $morningTime.AddDays(1) }
$eveningTime = Get-Date -Hour 19 -Minute 20 -Second 0 -Millisecond 0
if ($now -ge $eveningTime) { $eveningTime = $eveningTime.AddDays(1) }

# --- Register both tasks ------------------------------------------------------
Register-ScheduledTask `
  -TaskName    $MorningTaskName `
  -Action      $MorningAction `
  -Trigger     (New-ScheduledTaskTrigger -Daily -At $morningTime) `
  -Settings    $Settings `
  -Principal   $Principal `
  -Description "Runs RUN-ADAPOS-SYNC.bat at 08:20 daily for branch $Branch (normal full sync)." | Out-Null

Register-ScheduledTask `
  -TaskName    $EveningTaskName `
  -Action      $EveningAction `
  -Trigger     (New-ScheduledTaskTrigger -Daily -At $eveningTime) `
  -Settings    $Settings `
  -Principal   $Principal `
  -Description "Runs RUN-ADAPOS-SYNC.bat at 19:20 daily for branch $Branch (skips resync if 08:20 already succeeded)." | Out-Null

Write-Output ""
Write-Output "Tasks registered:"
Get-ScheduledTask -TaskName $MorningTaskName, $EveningTaskName |
  Format-List TaskName, State, @{N='Enabled'; E={$_.Settings.Enabled}},
    @{N='NextRun';   E={(Get-ScheduledTaskInfo $_).NextRunTime}},
    @{N='Command';   E={ $_.Actions[0].Execute + ' ' + $_.Actions[0].Arguments }}

Write-Output ""
Write-Output "Done. Morning task fires at 08:20 (full sync); evening task fires at 19:20 (skips if morning already succeeded)."
Write-Output "To remove them later:"
Write-Output "  Unregister-ScheduledTask -TaskName `"$MorningTaskName`" -Confirm:`$false"
Write-Output "  Unregister-ScheduledTask -TaskName `"$EveningTaskName`" -Confirm:`$false"
