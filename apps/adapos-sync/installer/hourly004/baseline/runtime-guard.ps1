param([Parameter(Mandatory=$true)][int]$ObserverProcessId)
$ErrorActionPreference='Stop'
try {
  if([Environment]::MachineName -ine 'SERVER004' -or [TimeZoneInfo]::Local.BaseUtcOffset.TotalMinutes -ne 420){throw 'host'}
  $service=New-Object -ComObject Schedule.Service;$service.Connect();$folder=$service.GetFolder('\')
  $now=Get-Date
  foreach($period in @('Morning','Evening')){
    $task=$folder.GetTask('AdaPOS Sync (Branch 004) - '+$period)
    if(-not $task.Enabled -or [int]$task.State -eq 4 -or ($task.NextRunTime-$now).TotalMinutes -le 15){throw 'existing-work'}
  }
  foreach($process in @(Get-CimInstance Win32_Process -Filter "Name='node.exe'")){
    if([int]$process.ProcessId -ne $ObserverProcessId -and [string]::IsNullOrWhiteSpace($process.CommandLine)){throw 'process-unreadable'}
    if([int]$process.ProcessId -ne $ObserverProcessId -and $process.CommandLine -match 'adapos-sync[\\/]+src[\\/]+(index|hourlyStockRunner|deltaShadowRunner)\.js'){throw 'existing-work'}
  }
  $cpu=@(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'")
  if($cpu.Count -ne 1 -or $null -eq $cpu[0].PercentProcessorTime){throw 'cpu-unreadable'}
  $cpuPercent=[double]$cpu[0].PercentProcessorTime
  if([double]::IsNaN($cpuPercent) -or [double]::IsInfinity($cpuPercent) -or $cpuPercent -lt 0 -or $cpuPercent -ge 70){throw 'cpu'}
  [pscustomobject]@{status='ready';cpuBelowThreshold=$true;existingWorkQuiet=$true;hostVerified=$true;systemCpuPercent=$cpuPercent}|ConvertTo-Json -Compress
}catch{
  $reason=switch([string]$_.Exception.Message){'cpu'{'HOST_CPU_AT_OR_ABOVE_70_PERCENT'};'existing-work'{'EXISTING_AGENT_OR_FULL_SYNC_WORK'};'process-unreadable'{'GUARD_PROCESS_IDENTITY_UNREADABLE'};default{'HOURLY_SOURCE_GUARD_UNAVAILABLE'}}
  [pscustomobject]@{status='guard-stopped';errorCode=$reason;detailsWithheld=$true}|ConvertTo-Json -Compress
  exit 1
}
