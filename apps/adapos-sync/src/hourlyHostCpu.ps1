# A single host-wide provider, no CIM fallback/cache/retry. First cumulative
# point is warm-up only. Every call requires a new interval and a live deadline.
function Get-HourlyMonotonicMs {
  if(-not [Diagnostics.Stopwatch]::IsHighResolution){Stop-HourlyCpu 'CPU_CLOCK_UNVERIFIED'}
  return [Diagnostics.Stopwatch]::GetTimestamp()*(1000.0/[Diagnostics.Stopwatch]::Frequency)
}
function Stop-HourlyCpu([string]$Code) {
  $exception=[InvalidOperationException]::new('Host CPU measurement unavailable; details withheld.')
  $exception.Data['HourlyCpuValidation']=$Code;throw $exception
}
function Initialize-HourlyHostCpuNative {
  if('HourlyHostCpuNative' -as [type]){return}
  Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.Runtime.InteropServices;
public static class HourlyHostCpuNative {
  [StructLayout(LayoutKind.Sequential)] public struct FT {public uint Low,High;public ulong Value {get{return ((ulong)High<<32)|Low;}}}
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetSystemTimes(out FT idle,out FT kernel,out FT user);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern ushort GetActiveProcessorGroupCount();
  [DllImport("kernel32.dll",SetLastError=true)] public static extern uint GetActiveProcessorCount(ushort group);
  public static ulong[] Read(){FT i,k,u;if(!GetSystemTimes(out i,out k,out u))throw new Win32Exception(Marshal.GetLastWin32Error());return new[]{i.Value,k.Value,u.Value};}
}
'@
}
function Get-HourlyCpuPoint {
  $groups=[HourlyHostCpuNative]::GetActiveProcessorGroupCount()
  if($groups -eq 0){throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())}
  $processors=[HourlyHostCpuNative]::GetActiveProcessorCount(65535)
  if($processors -eq 0){throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())}
  # GetSystemTimes covers only one processor group on larger machines. Never
  # label that partial group as host CPU or choose a different lower provider.
  if($groups -ne 1 -or $processors -gt 64){Stop-HourlyCpu 'CPU_SCOPE_UNSUPPORTED'}
  $times=[HourlyHostCpuNative]::Read()
  return [pscustomobject]@{Idle=[decimal]$times[0];Kernel=[decimal]$times[1];User=[decimal]$times[2];Groups=[int]$groups;Processors=[int]$processors;AtMs=(Get-HourlyMonotonicMs)}
}
function Test-HourlyCpuPoint($Point) {
  if($null -eq $Point -or $Point -is [array]){return $false}
  foreach($key in @('Idle','Kernel','User')){
    $v=$Point.$key
    if($null -eq $v -or $v -isnot [ValueType] -or $v -is [bool]){return $false}
    try{$n=[decimal]$v;if($n -lt 0 -or $n -gt [decimal][uint64]::MaxValue -or [decimal]::Truncate($n) -ne $n){return $false}}catch{return $false}
  }
  return ($Point.Groups -eq 1 -and $Point.Processors -is [int] -and $Point.Processors -ge 1 -and $Point.Processors -le 64 -and $Point.AtMs -is [double] -and -not [double]::IsNaN($Point.AtMs) -and -not [double]::IsInfinity($Point.AtMs) -and $Point.AtMs -ge 0)
}
function Get-HourlyHostCpu([double]$DeadlineMs,[scriptblock]$Now={Get-HourlyMonotonicMs},[scriptblock]$ReadPoint={Get-HourlyCpuPoint},[scriptblock]$Wait={param($Milliseconds);Start-Sleep -Milliseconds $Milliseconds},[scriptblock]$Initialize={Initialize-HourlyHostCpuNative}) {
  $started=& $Now
  if([double]::IsNaN($DeadlineMs) -or [double]::IsInfinity($DeadlineMs) -or $DeadlineMs-$started -lt 1250 -or $DeadlineMs-$started -gt 12000){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  & $Initialize
  if($DeadlineMs-(& $Now) -lt 1250){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  $first=& $ReadPoint
  if(-not(Test-HourlyCpuPoint $first)){Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
  $at=& $Now
  if($first.AtMs -gt $at -or $at-$first.AtMs -gt 1000){Stop-HourlyCpu 'CPU_SAMPLE_STALE'}
  if($DeadlineMs-$at -lt 1250){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  & $Wait 1000
  if($DeadlineMs-(& $Now) -lt 250){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  $last=& $ReadPoint
  if(-not(Test-HourlyCpuPoint $last)){Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
  $finished=& $Now
  if($finished -ge $DeadlineMs){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  if($last.AtMs -gt $finished -or $finished-$last.AtMs -gt 1000){Stop-HourlyCpu 'CPU_SAMPLE_STALE'}
  $window=$last.AtMs-$first.AtMs
  if($window -lt 1000 -or $window -gt 1500){Stop-HourlyCpu 'CPU_WINDOW_INVALID'}
  if($last.Groups -ne $first.Groups -or $last.Processors -ne $first.Processors){Stop-HourlyCpu 'CPU_SCOPE_UNSUPPORTED'}
  $idle=[decimal]$last.Idle-[decimal]$first.Idle;$kernel=[decimal]$last.Kernel-[decimal]$first.Kernel;$user=[decimal]$last.User-[decimal]$first.User;$total=$kernel+$user
  if($idle -lt 0 -or $kernel -lt 0 -or $user -lt 0 -or $total -le 0 -or $idle -gt $total){Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
  $expectedTicks=[decimal]$window*$first.Processors*10000
  if($total -lt $expectedTicks*0.5 -or $total -gt $expectedTicks*1.5){Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
  $percent=[double](100*($total-$idle)/$total)
  if([double]::IsNaN($percent) -or [double]::IsInfinity($percent) -or $percent -lt 0 -or $percent -gt 100){Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
  return [pscustomobject]@{PercentProcessorTime=$percent;provider='windows-system-times-v1';hostWide=$true;rawSamples=2;windowMs=$window;startedMs=$first.AtMs;endedMs=$last.AtMs;ageMs=$finished-$last.AtMs;groups=$first.Groups;processors=$first.Processors}
}
function Test-HourlyCpuMeasurement($Value,[double]$NowMs) {
  if($null -eq $Value -or $Value -is [array] -or $Value.provider -cne 'windows-system-times-v1' -or $Value.hostWide -ne $true -or $Value.rawSamples -ne 2 -or $Value.groups -ne 1 -or $Value.processors -lt 1 -or $Value.processors -gt 64){return $false}
  foreach($key in @('PercentProcessorTime','windowMs','startedMs','endedMs','ageMs')){if($null -eq $Value.$key -or $Value.$key -isnot [ValueType] -or $Value.$key -is [bool]){return $false};$v=[double]$Value.$key;if([double]::IsNaN($v) -or [double]::IsInfinity($v)){return $false}}
  return ($Value.PercentProcessorTime -ge 0 -and $Value.PercentProcessorTime -le 100 -and $Value.windowMs -ge 1000 -and $Value.windowMs -le 1500 -and $Value.startedMs -ge 0 -and [math]::Abs(($Value.endedMs-$Value.startedMs)-$Value.windowMs) -lt 0.001 -and $Value.ageMs -ge 0 -and $Value.ageMs -le 1000 -and $Value.endedMs -le $NowMs -and $NowMs-$Value.endedMs -le 1000)
}
function Get-HourlySafeProviderError($Record) {
  $types=@('System.Exception','System.InvalidOperationException','System.TimeoutException','System.UnauthorizedAccessException','System.IO.IOException','System.ComponentModel.Win32Exception','System.Management.ManagementException','System.Management.Automation.RuntimeException','System.Management.Automation.ActionPreferenceStopException','System.Management.Automation.CmdletInvocationException','System.Management.Automation.PipelineStoppedException','Microsoft.Management.Infrastructure.CimException')
  $chain=@();$exception=$Record.Exception;$validation=$null
  for($depth=0;$null -ne $exception -and $depth -lt 4;$depth++){
    $entry=@{type=$(if($exception.GetType().FullName -in $types){$exception.GetType().FullName}else{'OtherException'});hresult=[long]$exception.HResult}
    foreach($pair in @(@('NativeErrorCode','nativeErrorCode'),@('StatusCode','cimStatusCode'))){if($null -ne $exception.PSObject.Properties[$pair[0]]){try{$entry[$pair[1]]=[long]$exception.($pair[0])}catch{}}}
    if($exception.Data['HourlyCpuValidation'] -in @('CPU_CLOCK_UNVERIFIED','CPU_BUDGET_EXHAUSTED','CPU_SCOPE_UNSUPPORTED','CPU_SAMPLE_INVALID','CPU_SAMPLE_STALE','CPU_WINDOW_INVALID')){$validation=[string]$exception.Data['HourlyCpuValidation']}
    $chain+=,$entry;$exception=$exception.InnerException
  }
  $allowedIds=@('Microsoft.Management.Infrastructure.CimCmdlets.GetCimInstanceCommand','CimJob_BrokenCimSession','CimJob_UnhandledException','GetCimInstanceCommand','CimJob_InvalidOperation')
  $ids=@();foreach($part in ([string]$Record.FullyQualifiedErrorId -split ',')){if($part -in $allowedIds -or $part -cmatch '^HRESULT 0x[0-9A-Fa-f]{8}$'){$ids+=,$part}}
  return @{exceptions=$chain;category=[string]$Record.CategoryInfo.Category;qualifiedErrorIdParts=$ids;additionalInnerException=$null -ne $exception;validation=$validation;detailsWithheld=$true}
}
