$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\src\hourlyHostCpu.ps1')
$cases=@('cpu-0','cpu-5','cpu-69.999','cpu-70','cpu-71','cpu-100','budget-zero','budget-short','init-exhausted','first-slow','wait-expired','provider-timeout','provider-throw','native-access-denied','first-null','first-many','second-null','second-many','negative','fractional','nonfinite','counter-reset','idle-over-total','zero-delta','scope-many-groups','scope-no-processors','scope-change','first-stale','second-stale','future','window-short','window-long','accounting-invalid')
$passed=0;$report=[ordered]@{simulation=$true;nativePowerShell=$PSVersionTable.PSVersion.ToString();productionCpuReads=0;productionQueries=0;taskRuns=0;cases=@();passed=0;failed=0}
try{
 Initialize-HourlyHostCpuNative
 if([Runtime.InteropServices.Marshal]::SizeOf([Activator]::CreateInstance(('HourlyHostCpuNative+FT' -as [type]))) -ne 8){throw 'FIXTURE_NATIVE_FILETIME_LAYOUT'}
 $report.nativeBindingCompiledWithoutCpuRead=$true
 foreach($case in $cases){
  $script:CpuFixtureNow=100000.0;$script:CpuFixtureReads=0;$script:CpuFixtureWaits=0;$script:CpuFixtureInitializes=0
  $deadline=$script:CpuFixtureNow+12000
  if($case -eq 'budget-zero'){$deadline=$script:CpuFixtureNow};if($case -eq 'budget-short'){$deadline=$script:CpuFixtureNow+1000}
  $result=$null;$failure=$null
  try{
   $result=Get-HourlyHostCpu -DeadlineMs $deadline -Now {$script:CpuFixtureNow} -Initialize {$script:CpuFixtureInitializes++;if($case -eq 'init-exhausted'){$script:CpuFixtureNow+=12000}} -Wait {param($ms);$script:CpuFixtureWaits++;$script:CpuFixtureNow+=$(if($case -eq 'window-short'){999}elseif($case -eq 'window-long'){1501}elseif($case -eq 'wait-expired'){12000}else{$ms})} -ReadPoint {
    $script:CpuFixtureReads++
    if($case -eq 'provider-timeout'){throw [TimeoutException]::new('DO-NOT-OUTPUT')}
    if($case -eq 'provider-throw'){throw [IO.IOException]::new('DO-NOT-OUTPUT')}
    if($case -eq 'native-access-denied'){throw [ComponentModel.Win32Exception]::new(5)}
    if($case -eq 'first-null' -or ($case -eq 'second-null' -and $script:CpuFixtureReads -eq 2)){return $null}
    if($case -eq 'first-slow' -and $script:CpuFixtureReads -eq 1){$script:CpuFixtureNow+=11000}
    $percent=if($case -like 'cpu-*'){[decimal]$case.Substring(4)}else{[decimal]5}
    $point=[pscustomobject]@{Idle=[decimal]300000000;Kernel=[decimal]1000000000;User=[decimal]500000000;Groups=1;Processors=4;AtMs=[double]$script:CpuFixtureNow}
    if($script:CpuFixtureReads -eq 2){$point.Kernel+=40000000;$point.Idle+=[decimal](40000000*(1-$percent/100))}
    if($case -eq 'negative'){$point.Idle=-1}
    if($case -eq 'fractional'){$point.Kernel=1.5}
    if($case -eq 'nonfinite'){$point.User=[double]::NaN}
    if($case -eq 'counter-reset' -and $script:CpuFixtureReads -eq 2){$point.Kernel=1}
    if($case -eq 'idle-over-total' -and $script:CpuFixtureReads -eq 2){$point.Idle+=50000000}
    if($case -eq 'zero-delta' -and $script:CpuFixtureReads -eq 2){$point.Kernel=1000000000;$point.Idle=300000000}
    if($case -eq 'accounting-invalid' -and $script:CpuFixtureReads -eq 2){$point.Kernel=1000000001;$point.Idle=300000000}
    if($case -eq 'scope-many-groups'){$point.Groups=2}
    if($case -eq 'scope-no-processors'){$point.Processors=0}
    if($case -eq 'scope-change' -and $script:CpuFixtureReads -eq 2){$point.Processors=8}
    if($case -eq 'first-stale' -and $script:CpuFixtureReads -eq 1){$point.AtMs-=1001}
    if($case -eq 'second-stale' -and $script:CpuFixtureReads -eq 2){$point.AtMs-=1001}
    if($case -eq 'future'){$point.AtMs+=1}
    if($case -eq 'first-many' -or ($case -eq 'second-many' -and $script:CpuFixtureReads -eq 2)){$point;$point}else{$point}
   }
  }catch{$failure=Get-HourlySafeProviderError $_}
  $success=$case -like 'cpu-*'
  if($success){if($null -eq $result -or [math]::Abs($result.PercentProcessorTime-[double]$case.Substring(4)) -gt 0.000001 -or -not(Test-HourlyCpuMeasurement $result $script:CpuFixtureNow)){throw 'FIXTURE_VALID_SAMPLE_REJECTED'}}elseif($null -eq $failure -or $null -ne $result){throw 'FIXTURE_INVALID_SAMPLE_APPROVED'}
  if($script:CpuFixtureReads -gt 2 -or $script:CpuFixtureWaits -gt 1 -or $script:CpuFixtureInitializes -gt 1){throw 'FIXTURE_CPU_RETRIED'}
  if($case -in @('budget-zero','budget-short','init-exhausted') -and $script:CpuFixtureReads -ne 0){throw 'FIXTURE_EXPIRED_READ'}
  if($case -in @('first-slow','wait-expired') -and $script:CpuFixtureReads -ne 1){throw 'FIXTURE_EXPIRED_SECOND_READ'}
  if($null -ne $failure -and ($failure|ConvertTo-Json -Depth 8 -Compress).Contains('DO-NOT-OUTPUT')){throw 'FIXTURE_PRIVATE_ERROR_LEAK'}
  if($case -eq 'native-access-denied' -and @($failure.exceptions|Where-Object {$_.type -eq 'System.ComponentModel.Win32Exception' -and $_.nativeErrorCode -eq 5}).Count -ne 1){throw 'FIXTURE_NATIVE_CODE_LOST'}
  $passed++;$report.cases+=$case
 }
 $report.passed=$passed;$report.status='passed'
}catch{$report.failed=1;$report.passed=$passed;$report.status='failed';$report.case=$case;$report.reason=if($_.Exception.Message -cmatch '^FIXTURE_[A-Z_]+$'){$_.Exception.Message}else{'FIXTURE_UNAVAILABLE_DETAILS_WITHHELD'};$report.line=$_.InvocationInfo.ScriptLineNumber;$report.providerFailure=$failure;$report.fixtureCounts=@{reads=$script:CpuFixtureReads;waits=$script:CpuFixtureWaits;initializes=$script:CpuFixtureInitializes};$report.resultPresent=$null -ne $result}
$report|ConvertTo-Json -Depth 6 -Compress
if($report.failed){exit 1}
