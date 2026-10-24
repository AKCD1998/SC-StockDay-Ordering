param([Parameter(Mandatory=$true)][int]$ObserverProcessId)
$ErrorActionPreference='Stop'

function Get-HourlyGuardHost { [pscustomobject]@{name=[Environment]::MachineName;offset=[TimeZoneInfo]::Local.BaseUtcOffset.TotalMinutes} }
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
function Get-HourlyGuardCpu { Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -OperationTimeoutSec 8 }
function Invoke-HourlyCompleteGuard([int]$ObserverProcessId) {
  $watch=[Diagnostics.Stopwatch]::StartNew();$stage='host';$reason='HOST_UNVERIFIED'
  function Write-GuardEvent([string]$Kind,[hashtable]$Fields) {
    $record=[ordered]@{schemaVersion='hourly-source-guard-v2';kind=$Kind;stage=$stage;elapsedMs=[long]$watch.ElapsedMilliseconds}
    foreach($key in $Fields.Keys){$record[$key]=$Fields[$key]}
    [pscustomobject]$record | ConvertTo-Json -Compress
  }
  try {
    Write-GuardEvent 'progress' @{}
    $hostInfo=Get-HourlyGuardHost
    if($hostInfo.name -ine 'SERVER004' -or $hostInfo.offset -ne 420){throw 'stop'}
    $stage='tasks';$reason='TASKS_UNAVAILABLE';Write-GuardEvent 'progress' @{}
    $tasks=@(Get-HourlyGuardTasks)
    if($tasks.Count -ne 2){throw 'stop'}
    foreach($task in $tasks) {
      if(-not $task.enabled -or $task.running -or $task.nextRunMinutes -le 15){$reason='FULL_SYNC_BUSY';throw 'stop'}
    }
    $stage='processes';$reason='PROCESSES_UNAVAILABLE';Write-GuardEvent 'progress' @{}
    foreach($candidate in @(Get-HourlyGuardProcesses)) {
      if([int]$candidate.ProcessId -eq $ObserverProcessId){continue}
      if([string]::IsNullOrWhiteSpace($candidate.CommandLine)){$reason='PROCESS_UNREADABLE';throw 'stop'}
      if($candidate.CommandLine -match 'adapos-sync[\\/]+src[\\/]+(index|hourlyStockRunner|deltaShadowRunner)\.js'){$reason='FULL_SYNC_BUSY';throw 'stop'}
    }
    $stage='cpu';$reason='CPU_UNAVAILABLE';Write-GuardEvent 'progress' @{}
    $cpu=@(Get-HourlyGuardCpu)
    if($cpu.Count -ne 1 -or $null -eq $cpu[0].PercentProcessorTime){$reason='CPU_UNREADABLE';throw 'stop'}
    $percent=[double]$cpu[0].PercentProcessorTime
    if([double]::IsNaN($percent) -or [double]::IsInfinity($percent) -or $percent -lt 0){$reason='CPU_UNREADABLE';throw 'stop'}
    if($percent -ge 70){$reason='CPU_LIMIT';throw 'stop'}
    $stage='complete';Write-GuardEvent 'result' @{status='ready';hostVerified=$true;existingWorkQuiet=$true;cpuBelowThreshold=$true;systemCpuPercent=$percent}
    return $true
  } catch {
    if($_.Exception -is [UnauthorizedAccessException] -or $_.Exception.HResult -eq -2147024891){$reason='ACCESS_DENIED'}
    elseif($_.Exception -is [TimeoutException]){$reason='PROVIDER_TIMEOUT'}
    Write-GuardEvent 'result' @{status='guard-stopped';reason=$reason;detailsWithheld=$true}
    return $false
  }
}

$guardSucceeded=$false
Invoke-HourlyCompleteGuard -ObserverProcessId $ObserverProcessId | ForEach-Object {
  if($_ -is [bool]){$script:guardSucceeded=$_}else{[Console]::Out.WriteLine($_)}
}
if(-not $guardSucceeded){exit 1}
