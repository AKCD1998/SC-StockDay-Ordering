$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\src\hourlyHostCpu.ps1')
$file=Join-Path $PSScriptRoot '..\src\hourlyCompleteCohortGuard.ps1'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'fixture parse failed'}
foreach($function in $ast.EndBlock.Statements | Where-Object {$_ -is [Management.Automation.Language.FunctionDefinitionAst]}) {
  . ([scriptblock]::Create($function.Extent.Text))
}
$cases=@('ready','wrong-host','wrong-zone','wrong-identity','missing-task','disabled-task','running-task','within-15','boundary-15','busy-process','unreadable-process','own-process','missing-cpu','cpu-70','cpu-69','cpu-nan','access-denied','provider-timeout','cpu-71','cpu-many','cpu-null','cpu-stale','cpu-warmup','cpu-invalid-range','expired-before-provider','ready-late','clock-advanced','cpu-native-denied')
$passed=0
foreach($case in $cases) {
  $script:FixtureNow=100000.0;$script:FixtureCpuReads=0
  function Get-HourlyMonotonicMs {return $script:FixtureNow}
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
  function Get-HourlyGuardCpu([double]$DeadlineMs) {
    $script:FixtureCpuReads++
    if($case -eq 'provider-timeout'){throw [TimeoutException]::new('DO-NOT-OUTPUT')}
    if($case -eq 'cpu-native-denied'){throw [ComponentModel.Win32Exception]::new(5)}
    if($case -eq 'missing-cpu'){return @()}
    $script:FixtureNow+=1000
    $value=[pscustomobject]@{PercentProcessorTime=$(if($case -eq 'cpu-70'){70}elseif($case -eq 'cpu-69'){69}elseif($case -eq 'cpu-71'){71}elseif($case -eq 'cpu-nan'){[double]::NaN}elseif($case -eq 'cpu-null'){$null}elseif($case -eq 'cpu-invalid-range'){101}else{5});provider='windows-system-times-v1';hostWide=$true;rawSamples=2;groups=1;processors=4;windowMs=1000.0;startedMs=$script:FixtureNow-1000;endedMs=$script:FixtureNow;ageMs=0.0}
    if($case -eq 'cpu-stale'){$script:FixtureNow+=1001}
    if($case -eq 'cpu-warmup'){$value.rawSamples=1;$value.PercentProcessorTime=0}
    if($case -eq 'ready-late'){$script:FixtureNow=$DeadlineMs+1}
    if($case -eq 'clock-advanced'){$value.endedMs+=10000}
    if($case -eq 'cpu-many'){$value;$value}else{$value}
  }
  $deadline=$script:FixtureNow+12000
  if($case -eq 'expired-before-provider'){$deadline=$script:FixtureNow}
  $records=@(Invoke-HourlyCompleteGuard -ObserverProcessId 123 -DeadlineMs $deadline)
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
  if($case -eq 'cpu-native-denied' -and $events[-1].reason -ne 'ACCESS_DENIED'){throw 'fixture native access classification'}
  if($script:FixtureCpuReads -gt 1){throw 'fixture provider retried'}
  if($case -eq 'expired-before-provider' -and $script:FixtureCpuReads -ne 0){throw 'fixture provider called after deadline'}
  $passed++
}
[pscustomobject]@{simulation=$true;nativePowerShellVersion=$PSVersionTable.PSVersion.ToString();passed=$passed;failed=0;productionQueries=0;taskRuns=0;changes=0}|ConvertTo-Json -Compress
