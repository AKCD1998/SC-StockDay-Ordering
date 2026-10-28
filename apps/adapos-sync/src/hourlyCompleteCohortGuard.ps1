param([Parameter(Mandatory=$true)][int]$ObserverProcessId,[Parameter(Mandatory=$true)][double]$MonotonicDeadlineMs)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'hourlyHostCpu.ps1')

function Get-HourlyGuardHost { [pscustomobject]@{name=[Environment]::MachineName;offset=[TimeZoneInfo]::Local.BaseUtcOffset.TotalMinutes;isSystem=[Security.Principal.WindowsIdentity]::GetCurrent().IsSystem} }
function Get-HourlyGuardTasks {
  $service=New-Object -ComObject Schedule.Service
  try {
    $service.Connect();$folder=$service.GetFolder('\');$now=Get-Date
    foreach($period in @('Morning','Evening')) {
      $task=$folder.GetTask('AdaPOS Sync (Branch 004) - '+$period)
      [pscustomobject]@{enabled=[bool]$task.Enabled;running=([int]$task.State -eq 4);nextRunMinutes=($task.NextRunTime-$now).TotalMinutes}
    }
  } finally { if($null -ne $service){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($service)} }
}
function Get-HourlyGuardProcesses { Get-CimInstance Win32_Process -Filter "Name='node.exe'" -OperationTimeoutSec 8 }
function Get-HourlyGuardCpu([double]$DeadlineMs) { Get-HourlyHostCpu -DeadlineMs $DeadlineMs }
function Invoke-HourlyCompleteGuard([int]$ObserverProcessId,[double]$DeadlineMs) {
  $watch=[Diagnostics.Stopwatch]::StartNew();$stage='host';$reason='HOST_UNVERIFIED';$inProvider=$false
  function Assert-GuardDeadline {
    $left=$DeadlineMs-(Get-HourlyMonotonicMs)
    if([double]::IsNaN($left) -or [double]::IsInfinity($left)){Stop-HourlyCpu 'CPU_CLOCK_UNVERIFIED'}
    if($left -le 0 -or $left -gt 12000){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  }
  function Write-GuardEvent([string]$Kind,[hashtable]$Fields) {
    $record=[ordered]@{schemaVersion='hourly-source-guard-v2';kind=$Kind;stage=$stage;elapsedMs=[long]$watch.ElapsedMilliseconds}
    foreach($key in $Fields.Keys){$record[$key]=$Fields[$key]}
    [pscustomobject]$record | ConvertTo-Json -Compress
  }
  try {
    Assert-GuardDeadline
    Write-GuardEvent 'progress' @{}
    $inProvider=$true;$hostInfo=Get-HourlyGuardHost;$inProvider=$false
    if($hostInfo.name -ine 'SERVER004' -or $hostInfo.offset -ne 420){throw 'stop'}
    if($hostInfo.isSystem -ne $true){$reason='IDENTITY_UNVERIFIED';throw 'stop'}
    $stage='tasks';$reason='TASKS_UNAVAILABLE';Write-GuardEvent 'progress' @{}
    Assert-GuardDeadline
    $inProvider=$true;$tasks=@(Get-HourlyGuardTasks);$inProvider=$false
    if($tasks.Count -ne 2){throw 'stop'}
    foreach($task in $tasks) {
      if(-not $task.enabled -or $task.running -or $task.nextRunMinutes -le 15){$reason='FULL_SYNC_BUSY';throw 'stop'}
    }
    $stage='processes';$reason='PROCESSES_UNAVAILABLE';Write-GuardEvent 'progress' @{}
    Assert-GuardDeadline
    $inProvider=$true;$processes=@(Get-HourlyGuardProcesses);$inProvider=$false
    foreach($candidate in $processes) {
      if([int]$candidate.ProcessId -eq $ObserverProcessId){continue}
      if([string]::IsNullOrWhiteSpace($candidate.CommandLine)){$reason='PROCESS_UNREADABLE';throw 'stop'}
      if($candidate.CommandLine -match 'adapos-sync[\\/]+src[\\/]+(index|hourlyStockRunner|deltaShadowRunner)\.js'){$reason='FULL_SYNC_BUSY';throw 'stop'}
    }
    $stage='cpu';$reason='CPU_UNAVAILABLE';Write-GuardEvent 'progress' @{}
    Assert-GuardDeadline
    $inProvider=$true;$cpu=@(Get-HourlyGuardCpu -DeadlineMs $DeadlineMs);$inProvider=$false
    Assert-GuardDeadline
    if($cpu.Count -ne 1 -or -not(Test-HourlyCpuMeasurement $cpu[0] (Get-HourlyMonotonicMs))){$reason='CPU_UNREADABLE';Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
    $percent=[double]$cpu[0].PercentProcessorTime
    if([double]::IsNaN($percent) -or [double]::IsInfinity($percent) -or $percent -lt 0 -or $percent -gt 100){$reason='CPU_UNREADABLE';Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
    if($percent -ge 70){$reason='CPU_LIMIT';throw 'stop'}
    Assert-GuardDeadline
    if(-not(Test-HourlyCpuMeasurement $cpu[0] (Get-HourlyMonotonicMs))){$reason='CPU_UNREADABLE';Stop-HourlyCpu 'CPU_SAMPLE_STALE'}
    $stage='complete';Write-GuardEvent 'result' @{status='ready';hostVerified=$true;existingWorkQuiet=$true;cpuBelowThreshold=$true;systemCpuPercent=$percent;cpuMeasurement=$cpu[0]}
    return $true
  } catch {
    $providerFailure=Get-HourlySafeProviderError $_
    if($providerFailure.validation -eq 'CPU_BUDGET_EXHAUSTED'){$reason=if((Get-HourlyMonotonicMs) -ge $DeadlineMs){'DEADLINE'}else{'BUDGET_EXHAUSTED'}}
    elseif($providerFailure.validation){$reason='CPU_UNREADABLE'}
    $denied=@($providerFailure.exceptions|Where-Object {$_.type -eq 'System.UnauthorizedAccessException' -or $_.hresult -eq -2147024891 -or ($_.type -eq 'System.ComponentModel.Win32Exception' -and $_.nativeErrorCode -eq 5)}).Count -gt 0
    if($denied){$reason='ACCESS_DENIED'}
    elseif(@($providerFailure.exceptions|Where-Object {$_.type -eq 'System.TimeoutException'}).Count -gt 0){$reason='PROVIDER_TIMEOUT'}
    $fields=@{status='guard-stopped';reason=$reason;detailsWithheld=$true}
    if($inProvider -or $providerFailure.validation){$fields.providerFailure=$providerFailure}
    if($reason -eq 'CPU_LIMIT' -and [double]::IsNaN($percent) -eq $false -and [double]::IsInfinity($percent) -eq $false -and $percent -ge 0 -and $percent -le 100){$fields.systemCpuPercent=$percent;$fields.cpuMeasurement=$cpu[0]}
    Write-GuardEvent 'result' $fields
    return $false
  }
}

$guardSucceeded=$false
Invoke-HourlyCompleteGuard -ObserverProcessId $ObserverProcessId -DeadlineMs $MonotonicDeadlineMs | ForEach-Object {
  if($_ -is [bool]){$script:guardSucceeded=$_}else{[Console]::Out.WriteLine($_)}
}
if(-not $guardSucceeded){exit 1}
