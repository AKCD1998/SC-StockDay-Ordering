$ErrorActionPreference='Stop'
$file=Join-Path $PSScriptRoot '..\src\hourlyCompleteCohortGuard.ps1'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'fixture parse failed'}
foreach($function in $ast.EndBlock.Statements | Where-Object {$_ -is [Management.Automation.Language.FunctionDefinitionAst]}) {
  . ([scriptblock]::Create($function.Extent.Text))
}
$cases=@('ready','wrong-host','wrong-zone','wrong-identity','missing-task','disabled-task','running-task','within-15','boundary-15','busy-process','unreadable-process','own-process','missing-cpu','cpu-70','cpu-69','cpu-nan','access-denied','provider-timeout')
$passed=0
foreach($case in $cases) {
  function Get-HourlyGuardHost { [pscustomobject]@{name=$(if($case -eq 'wrong-host'){'OTHER'}else{'SERVER004'});offset=$(if($case -eq 'wrong-zone'){0}else{420});isSystem=($case -ne 'wrong-identity')} }
  function Get-HourlyGuardTasks {
    if($case -eq 'missing-task'){return @()}
    @([pscustomobject]@{enabled=($case -ne 'disabled-task');running=($case -eq 'running-task');nextRunMinutes=$(if($case -eq 'within-15'){14}elseif($case -eq 'boundary-15'){15}else{500})},[pscustomobject]@{enabled=$true;running=$false;nextRunMinutes=1000})
  }
  function Get-HourlyGuardProcesses {
    if($case -eq 'access-denied'){throw [UnauthorizedAccessException]::new('DO-NOT-OUTPUT')}
    if($case -eq 'busy-process'){[pscustomobject]@{ProcessId=456;CommandLine='node X:\fixture\adapos-sync\src\index.js'}}
    elseif($case -eq 'unreadable-process'){[pscustomobject]@{ProcessId=456;CommandLine=$null}}
    elseif($case -eq 'own-process'){[pscustomobject]@{ProcessId=123;CommandLine=$null}}
  }
  function Get-HourlyGuardCpu {
    if($case -eq 'provider-timeout'){throw [TimeoutException]::new('DO-NOT-OUTPUT')}
    if($case -eq 'missing-cpu'){return @()}
    [pscustomobject]@{PercentProcessorTime=$(if($case -eq 'cpu-70'){70}elseif($case -eq 'cpu-69'){69}elseif($case -eq 'cpu-nan'){[double]::NaN}else{5})}
  }
  $records=@(Invoke-HourlyCompleteGuard -ObserverProcessId 123)
  $expected=$case -in @('ready','own-process','cpu-69')
  if($records[-1] -isnot [bool] -or $records[-1] -ne $expected){throw ('fixture boundary failed: '+$case)}
  $safe=($records | Where-Object {$_ -is [string]}) -join "`n"
  if($safe.Contains('DO-NOT-OUTPUT') -or $safe.Contains('CommandLine')){throw 'fixture disclosure'}
  $events=@($records | Where-Object {$_ -is [string]} | ForEach-Object {$_ | ConvertFrom-Json})
  if($events[-1].kind -ne 'result' -or $events[0].stage -ne 'host'){throw 'fixture progress missing'}
  if($case -eq 'cpu-70' -and $events[-1].reason -ne 'CPU_LIMIT'){throw 'fixture reason missing'}
  if($case -eq 'cpu-70' -and $events[-1].systemCpuPercent -ne 70){throw 'fixture stopped CPU sample missing'}
  if($case -eq 'access-denied' -and $events[-1].reason -ne 'ACCESS_DENIED'){throw 'fixture access classification'}
  if($case -eq 'provider-timeout' -and $events[-1].reason -ne 'PROVIDER_TIMEOUT'){throw 'fixture timeout classification'}
  $passed++
}
[pscustomobject]@{simulation=$true;nativePowerShellVersion=$PSVersionTable.PSVersion.ToString();passed=$passed;failed=0;productionQueries=0;taskRuns=0;changes=0}|ConvertTo-Json -Compress
