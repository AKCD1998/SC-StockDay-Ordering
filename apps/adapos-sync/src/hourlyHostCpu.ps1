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
  # Emit only the three fixed P/Invoke declarations in memory. Starting the C#
  # compiler for each fresh guard child spent the same twelve-second budget as
  # Task/process checks and sampling. This changes binding setup, not the CPU
  # provider, interval, freshness checks, topology checks, or deadline.
  $name=[Reflection.AssemblyName]::new('HourlyHostCpuBindings')
  $assembly=[AppDomain]::CurrentDomain.DefineDynamicAssembly($name,[Reflection.Emit.AssemblyBuilderAccess]::Run)
  $module=$assembly.DefineDynamicModule('HourlyHostCpuBindings')
  $fileTime=$module.DefineType('HourlyHostCpuFileTime',([Reflection.TypeAttributes]::Public -bor [Reflection.TypeAttributes]::SequentialLayout -bor [Reflection.TypeAttributes]::Sealed),[ValueType])
  [void]$fileTime.DefineField('Low',[uint32],[Reflection.FieldAttributes]::Public)
  [void]$fileTime.DefineField('High',[uint32],[Reflection.FieldAttributes]::Public)
  $ft=$fileTime.CreateType()
  $native=$module.DefineType('HourlyHostCpuNative',([Reflection.TypeAttributes]::Public -bor [Reflection.TypeAttributes]::Abstract -bor [Reflection.TypeAttributes]::Sealed))
  $definitions=@(
    @{name='GetSystemTimes';result=[bool];parameters=[type[]]@($ft.MakeByRefType(),$ft.MakeByRefType(),$ft.MakeByRefType())},
    @{name='GetActiveProcessorGroupCount';result=[uint16];parameters=[type[]]@()},
    @{name='GetActiveProcessorCount';result=[uint32];parameters=[type[]]@([uint16])}
  )
  foreach($definition in $definitions){
    $method=$native.DefineMethod($definition.name,([Reflection.MethodAttributes]::Public -bor [Reflection.MethodAttributes]::Static -bor [Reflection.MethodAttributes]::PinvokeImpl),[Reflection.CallingConventions]::Standard,$definition.result,$definition.parameters)
    $method.SetImplementationFlags([Reflection.MethodImplAttributes]::PreserveSig)
    $constructor=[Runtime.InteropServices.DllImportAttribute].GetConstructor([type[]]@([string]))
    $attribute=[Reflection.Emit.CustomAttributeBuilder]::new($constructor,[object[]]@('kernel32.dll'),[Reflection.FieldInfo[]]@([Runtime.InteropServices.DllImportAttribute].GetField('SetLastError')),[object[]]@($true))
    $method.SetCustomAttribute($attribute)
  }
  [void]$native.CreateType()
}
function Get-HourlyCpuPoint {
  $groups=[HourlyHostCpuNative]::GetActiveProcessorGroupCount()
  if($groups -eq 0){throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())}
  $processors=[HourlyHostCpuNative]::GetActiveProcessorCount(65535)
  if($processors -eq 0){throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())}
  # GetSystemTimes covers only one processor group on larger machines. Never
  # label that partial group as host CPU or choose a different lower provider.
  if($groups -ne 1 -or $processors -gt 64){Stop-HourlyCpu 'CPU_SCOPE_UNSUPPORTED'}
  $ft='HourlyHostCpuFileTime' -as [type]
  $idle=[Activator]::CreateInstance($ft);$kernel=[Activator]::CreateInstance($ft);$user=[Activator]::CreateInstance($ft)
  if(-not [HourlyHostCpuNative]::GetSystemTimes([ref]$idle,[ref]$kernel,[ref]$user)){throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())}
  return [pscustomobject]@{Idle=([decimal]$idle.High*4294967296+[decimal]$idle.Low);Kernel=([decimal]$kernel.High*4294967296+[decimal]$kernel.Low);User=([decimal]$user.High*4294967296+[decimal]$user.Low);Groups=[int]$groups;Processors=[int]$processors;AtMs=(Get-HourlyMonotonicMs)}
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
  $phase='entry';$initializationMs=$null
  try {
  if([double]::IsNaN($DeadlineMs) -or [double]::IsInfinity($DeadlineMs) -or $DeadlineMs-$started -lt 1250 -or $DeadlineMs-$started -gt 12000){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  $phase='initialization';$initializationStarted=& $Now
  & $Initialize
  $initializationMs=(& $Now)-$initializationStarted
  if($DeadlineMs-(& $Now) -lt 1250){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  $phase='first-point'
  $first=& $ReadPoint
  if(-not(Test-HourlyCpuPoint $first)){Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
  $at=& $Now
  if($first.AtMs -gt $at -or $at-$first.AtMs -gt 1000){Stop-HourlyCpu 'CPU_SAMPLE_STALE'}
  if($DeadlineMs-$at -lt 1250){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  $phase='interval'; & $Wait 1000
  if($DeadlineMs-(& $Now) -lt 250){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  $phase='second-point'
  $last=& $ReadPoint
  if(-not(Test-HourlyCpuPoint $last)){Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
  $finished=& $Now
  if($finished -ge $DeadlineMs){Stop-HourlyCpu 'CPU_BUDGET_EXHAUSTED'}
  if($last.AtMs -gt $finished -or $finished-$last.AtMs -gt 1000){Stop-HourlyCpu 'CPU_SAMPLE_STALE'}
  $phase='validation';$window=$last.AtMs-$first.AtMs
  if($window -lt 1000 -or $window -gt 1500){Stop-HourlyCpu 'CPU_WINDOW_INVALID'}
  if($last.Groups -ne $first.Groups -or $last.Processors -ne $first.Processors){Stop-HourlyCpu 'CPU_SCOPE_UNSUPPORTED'}
  $idle=[decimal]$last.Idle-[decimal]$first.Idle;$kernel=[decimal]$last.Kernel-[decimal]$first.Kernel;$user=[decimal]$last.User-[decimal]$first.User;$total=$kernel+$user
  if($idle -lt 0 -or $kernel -lt 0 -or $user -lt 0 -or $total -le 0 -or $idle -gt $total){Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
  $expectedTicks=[decimal]$window*$first.Processors*10000
  if($total -lt $expectedTicks*0.5 -or $total -gt $expectedTicks*1.5){Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
  $percent=[double](100*($total-$idle)/$total)
  if([double]::IsNaN($percent) -or [double]::IsInfinity($percent) -or $percent -lt 0 -or $percent -gt 100){Stop-HourlyCpu 'CPU_SAMPLE_INVALID'}
  return [pscustomobject]@{PercentProcessorTime=$percent;provider='windows-system-times-v1';hostWide=$true;rawSamples=2;windowMs=$window;startedMs=$first.AtMs;endedMs=$last.AtMs;ageMs=$finished-$last.AtMs;groups=$first.Groups;processors=$first.Processors}
  } catch {
    $_.Exception.Data['HourlyCpuPhase']=$phase
    $left=$DeadlineMs-(& $Now)
    if(-not [double]::IsNaN($left) -and -not [double]::IsInfinity($left)){$_.Exception.Data['HourlyCpuRemainingMs']=[math]::Max(0,[math]::Min(12000,[math]::Floor($left)))}
    if($null -ne $initializationMs -and $initializationMs -ge 0 -and $initializationMs -le 12000){$_.Exception.Data['HourlyCpuInitializationMs']=[math]::Ceiling($initializationMs)}
    throw
  }
}
function Test-HourlyCpuMeasurement($Value,[double]$NowMs) {
  if($null -eq $Value -or $Value -is [array] -or $Value.provider -cne 'windows-system-times-v1' -or $Value.hostWide -ne $true -or $Value.rawSamples -ne 2 -or $Value.groups -ne 1 -or $Value.processors -lt 1 -or $Value.processors -gt 64){return $false}
  foreach($key in @('PercentProcessorTime','windowMs','startedMs','endedMs','ageMs')){if($null -eq $Value.$key -or $Value.$key -isnot [ValueType] -or $Value.$key -is [bool]){return $false};$v=[double]$Value.$key;if([double]::IsNaN($v) -or [double]::IsInfinity($v)){return $false}}
  return ($Value.PercentProcessorTime -ge 0 -and $Value.PercentProcessorTime -le 100 -and $Value.windowMs -ge 1000 -and $Value.windowMs -le 1500 -and $Value.startedMs -ge 0 -and [math]::Abs(($Value.endedMs-$Value.startedMs)-$Value.windowMs) -lt 0.001 -and $Value.ageMs -ge 0 -and $Value.ageMs -le 1000 -and $Value.endedMs -le $NowMs -and $NowMs-$Value.endedMs -le 1000)
}
function Get-HourlySafeProviderError($Record) {
  $types=@('System.Exception','System.InvalidOperationException','System.TimeoutException','System.UnauthorizedAccessException','System.IO.IOException','System.ComponentModel.Win32Exception','System.Management.ManagementException','System.Management.Automation.RuntimeException','System.Management.Automation.ActionPreferenceStopException','System.Management.Automation.CmdletInvocationException','System.Management.Automation.PipelineStoppedException','Microsoft.Management.Infrastructure.CimException')
  $chain=@();$exception=$Record.Exception;$validation=$null;$cpuFields=@{}
  for($depth=0;$null -ne $exception -and $depth -lt 4;$depth++){
    $entry=@{type=$(if($exception.GetType().FullName -in $types){$exception.GetType().FullName}else{'OtherException'});hresult=[long]$exception.HResult}
    foreach($pair in @(@('NativeErrorCode','nativeErrorCode'),@('StatusCode','cimStatusCode'))){if($null -ne $exception.PSObject.Properties[$pair[0]]){try{$entry[$pair[1]]=[long]$exception.($pair[0])}catch{}}}
    if($exception.Data['HourlyCpuValidation'] -in @('CPU_CLOCK_UNVERIFIED','CPU_BUDGET_EXHAUSTED','CPU_SCOPE_UNSUPPORTED','CPU_SAMPLE_INVALID','CPU_SAMPLE_STALE','CPU_WINDOW_INVALID')){$validation=[string]$exception.Data['HourlyCpuValidation']}
    if($exception.Data['HourlyCpuPhase'] -cin @('entry','initialization','first-point','interval','second-point','validation')){$cpuFields.cpuPhase=[string]$exception.Data['HourlyCpuPhase']}
    foreach($pair in @(@('HourlyCpuRemainingMs','cpuRemainingMs'),@('HourlyCpuInitializationMs','cpuInitializationMs'))){$v=$exception.Data[$pair[0]];if($v -is [ValueType] -and $v -isnot [bool] -and $v -ge 0 -and $v -le 12000){$cpuFields[$pair[1]]=[long]$v}}
    $chain+=,$entry;$exception=$exception.InnerException
  }
  $allowedIds=@('Microsoft.Management.Infrastructure.CimCmdlets.GetCimInstanceCommand','CimJob_BrokenCimSession','CimJob_UnhandledException','GetCimInstanceCommand','CimJob_InvalidOperation')
  $ids=@();foreach($part in ([string]$Record.FullyQualifiedErrorId -split ',')){if($part -in $allowedIds -or $part -cmatch '^HRESULT 0x[0-9A-Fa-f]{8}$'){$ids+=,$part}}
  $result=@{exceptions=$chain;category=[string]$Record.CategoryInfo.Category;qualifiedErrorIdParts=$ids;additionalInnerException=$null -ne $exception;validation=$validation;detailsWithheld=$true}
  foreach($key in $cpuFields.Keys){$result[$key]=$cpuFields[$key]};return $result
}
