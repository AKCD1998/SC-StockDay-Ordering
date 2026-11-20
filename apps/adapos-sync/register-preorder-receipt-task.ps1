param(
  [string]$Branch = "000",
  [string]$TaskName = "AdaPOS Preorder Receipt Sync",
  [switch]$Enable,
  [switch]$Replace
)

if ($Branch -ne "000") {
  throw "Preorder receipt polling is currently limited to HQ branch 000."
}
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this script from an elevated PowerShell session."
}

$script = Join-Path $PSScriptRoot "RUN-ADAPOS-PREORDER-RECEIPTS.bat"
if (-not (Test-Path $script)) { throw "Receipt sync runner not found: $script" }

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  if (-not $Replace) {
    throw "Task '$TaskName' already exists. Inspect it first; pass -Replace only when replacement is intentional."
  }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$script`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At "00:00"
$trigger.RepetitionInterval = New-TimeSpan -Minutes 15
$trigger.RepetitionDuration = New-TimeSpan -Days 1
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 12)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Read-only pending and approved AdaPOS receipt poll for the preorder HQ queue (branch 000, every 15 minutes)." | Out-Null

if ($Enable) { Enable-ScheduledTask -TaskName $TaskName | Out-Null }
else { Disable-ScheduledTask -TaskName $TaskName | Out-Null }

Get-ScheduledTask -TaskName $TaskName | Format-List TaskName, State, @{N='Enabled';E={$_.Settings.Enabled}}, @{N='NextRun';E={(Get-ScheduledTaskInfo $_).NextRunTime}}
if (-not $Enable) { Write-Output "Task created disabled. Run Enable-ScheduledTask -TaskName `"$TaskName`" after HQ validates the read-only SQL login and sync credentials." }
