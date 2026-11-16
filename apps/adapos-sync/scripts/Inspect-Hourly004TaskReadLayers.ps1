$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
function New-H004ReadLayerBindings {
 $a=[AppDomain]::CurrentDomain.DefineDynamicAssembly([Reflection.AssemblyName]::new('H004ReadLayers'),[Reflection.Emit.AssemblyBuilderAccess]::Run)
 $m=$a.DefineDynamicModule('Memory');$t=$m.DefineType('H004ReadLayerNative',[Reflection.TypeAttributes]'Public,Sealed,Abstract');$bindings=@{}
 foreach($spec in @(@{name='CreateFileW';dll='kernel32.dll';ret=[IntPtr];parameters=[Type[]]@([string],[uint32],[uint32],[IntPtr],[uint32],[uint32],[IntPtr])},@{name='CloseHandle';dll='kernel32.dll';ret=[bool];parameters=[Type[]]@([IntPtr])})){
  $f=$t.DefineMethod($spec.name,[Reflection.MethodAttributes]'Public,Static,PinvokeImpl',$spec.ret,$spec.parameters)
  $f.SetImplementationFlags($f.GetMethodImplementationFlags() -bor [Reflection.MethodImplAttributes]::PreserveSig)
  $ctor=[Runtime.InteropServices.DllImportAttribute].GetConstructor([Type[]]@([string]));$fields=[Reflection.FieldInfo[]]@([Runtime.InteropServices.DllImportAttribute].GetField('SetLastError'),[Runtime.InteropServices.DllImportAttribute].GetField('CharSet'),[Runtime.InteropServices.DllImportAttribute].GetField('CallingConvention'),[Runtime.InteropServices.DllImportAttribute].GetField('EntryPoint'),[Runtime.InteropServices.DllImportAttribute].GetField('ExactSpelling'))
  $f.SetCustomAttribute([Reflection.Emit.CustomAttributeBuilder]::new($ctor,[object[]]@($spec.dll),$fields,[object[]]@($true,[Runtime.InteropServices.CharSet]::Unicode,[Runtime.InteropServices.CallingConvention]::Winapi,$spec.name,$true)))
  $bindings[$spec.name]=$f
 }
 # Capture the API's cached last error on the same managed stack, before any
 # PowerShell binder/formatting operation can perform another native call.
 $open=$t.DefineMethod('OpenReadOnly',[Reflection.MethodAttributes]'Public,Static',[IntPtr],[Type[]]@([string],[uint32],[int].MakeByRefType()))
 $il=$open.GetILGenerator();$handle=$il.DeclareLocal([IntPtr]);$zero=[IntPtr].GetField('Zero')
 $il.Emit([Reflection.Emit.OpCodes]::Ldarg_0);$il.Emit([Reflection.Emit.OpCodes]::Ldarg_1);$il.Emit([Reflection.Emit.OpCodes]::Ldc_I4_7);$il.Emit([Reflection.Emit.OpCodes]::Ldsfld,$zero);$il.Emit([Reflection.Emit.OpCodes]::Ldc_I4_3);$il.Emit([Reflection.Emit.OpCodes]::Ldc_I4,[int]0x02200000);$il.Emit([Reflection.Emit.OpCodes]::Ldsfld,$zero);$il.Emit([Reflection.Emit.OpCodes]::Call,$bindings.CreateFileW);$il.Emit([Reflection.Emit.OpCodes]::Stloc,$handle)
 $il.Emit([Reflection.Emit.OpCodes]::Ldarg_2);$il.Emit([Reflection.Emit.OpCodes]::Call,[Runtime.InteropServices.Marshal].GetMethod('GetLastWin32Error'));$il.Emit([Reflection.Emit.OpCodes]::Stind_I4);$il.Emit([Reflection.Emit.OpCodes]::Ldloc,$handle);$il.Emit([Reflection.Emit.OpCodes]::Ret)
 $native=$t.CreateType()
 if($native.GetMethod('CreateFileW').GetParameters().Count -ne 7 -or $native.GetMethod('CloseHandle').GetParameters().Count -ne 1 -or $native.GetMethod('OpenReadOnly').GetParameters().Count -ne 3){throw 'SIGNATURE_UNVERIFIED'}
 if(-not$native.GetMethod('CreateFileW').GetCustomAttributes([Runtime.InteropServices.DllImportAttribute],$false)[0].SetLastError){throw 'LAST_ERROR_BINDING_UNVERIFIED'}
 return $native
}
function Invoke-H004ReadLayerOpen([Type]$Native,[string]$Path,[uint32]$Mask){
 $handle=[IntPtr]::Zero
 $r=[ordered]@{requestedMask=$Mask;opened=$false;nativeError=$null;handleClosed=$null}
 try{
  # OPEN_EXISTING directory, backup semantics and open-reparse-point. No write,
  # execute, creation, read-content or enumeration call exists in this probe.
  [int]$errorCode=0;$handle=$Native::OpenReadOnly($Path,$Mask,[ref]$errorCode)
  if($handle -eq [IntPtr](-1) -or $handle -eq [IntPtr]::Zero){$r.nativeError=$errorCode;$handle=[IntPtr]::Zero}else{$r.opened=$true}
 }finally{if($handle -ne [IntPtr]::Zero){$r.handleClosed=$Native::CloseHandle($handle)}}
 return [pscustomobject]$r
}
function Invoke-H004TaskReadLayers {
 $r=[ordered]@{schemaVersion='h004-task-read-layers-v1';checkedAt=[DateTimeOffset]::UtcNow.ToString('o');status='PARTIAL';hostMatched=$false;identityMatched=$false;nonAdmin=$false;threadImpersonation=$null;timeZone=[TimeZoneInfo]::Local.Id;ps64Bit=[Environment]::Is64BitProcess;os64Bit=[Environment]::Is64BitOperatingSystem;rootMetadataRead=$false;rootIsDirectory=$null;rootIsReparsePoint=$null;directoryOpens=@();comCreated=$false;connected=$false;targetServerMatched=$null;rootOpened=$false;rootArgumentLength=1;rootArgumentCodepoint=92;exactTaskAttempts=0;exactTaskPassed=0;failedStage=$null;errorType=$null;hresult=$null;permissionChanges=0;profileChanges=0;sourceFileWrites=0;taskRuns=0;sqlQueries=0;taskAdmissionEstablished=$false}
 $stage='context';$service=$null;$folder=$null;$id=$null
 try{
  $id=[Security.Principal.WindowsIdentity]::GetCurrent();$r.identityMatched=($id.Name -ieq 'SERVER004\CodexSandboxOffline');$r.hostMatched=([Environment]::MachineName -ieq 'SERVER004')
  $r.nonAdmin=-not([Security.Principal.WindowsPrincipal]::new($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  $r.threadImpersonation=($id.ImpersonationLevel -ne [Security.Principal.TokenImpersonationLevel]::None)
  if(-not$r.hostMatched -or -not$r.identityMatched -or -not$r.nonAdmin -or $r.threadImpersonation -or -not$r.ps64Bit -or $r.timeZone -cne 'SE Asia Standard Time' -or $PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5){throw 'CONTEXT_UNVERIFIED'}
  $stage='root-metadata';$root='C:\Windows\System32\Tasks';$attributes=[IO.File]::GetAttributes($root);$r.rootMetadataRead=$true
  $r.rootIsDirectory=([int]$attributes -band 16) -ne 0;$r.rootIsReparsePoint=([int]$attributes -band 1024) -ne 0
  if(-not$r.rootIsDirectory -or $r.rootIsReparsePoint){throw 'ROOT_KIND_UNVERIFIED'}
  $stage='directory-read-only-opens';$native=New-H004ReadLayerBindings
  foreach($spec in @(@{label='list-and-attributes';mask=[uint32]129},@{label='read-extended-attributes';mask=[uint32]8},@{label='generic-read';mask=[uint32]2147483648})){
   $open=Invoke-H004ReadLayerOpen $native $root $spec.mask;$open|Add-Member -NotePropertyName right -NotePropertyValue $spec.label;$r.directoryOpens+=,$open
  }
  $stage='COM-create';$service=New-Object -ComObject Schedule.Service;$r.comCreated=$true
  $stage='Connect';$service.Connect();$r.connected=$true
  $stage='TargetServer';$r.targetServerMatched=([string]$service.TargetServer).TrimStart([char]92) -ieq 'SERVER004'
  if(-not$r.targetServerMatched){throw 'TARGET_UNVERIFIED'}
  $stage='GetFolder-root';$folder=$service.GetFolder([string][char]92);$r.rootOpened=$true
  $stage='exactGetTask'
  foreach($hour in 9..19){$task=$null;try{$r.exactTaskAttempts++;$task=$folder.GetTask(('Hourly Stock Evidence (Branch 004) - {0:00}00' -f $hour));$r.exactTaskPassed++}finally{if($null -ne $task){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($task)}}}
  $r.status='STAGED_READ_COMPLETED_NOT_ADMISSION'
 }catch{
  $r.failedStage=$stage;$e=$_.Exception
  for($i=0;$null -ne $e.InnerException -and $i -lt 5;$i++){$e=$e.InnerException}
  $r.errorType=$e.GetType().FullName;$r.hresult=[int64]$e.HResult
 }finally{foreach($object in @($folder,$service)){if($null -ne $object){try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($object)}catch{}}};if($null -ne $id){$id.Dispose()}}
 return [pscustomobject]$r
}
if($MyInvocation.InvocationName -ne '.'){
 Invoke-H004TaskReadLayers|ConvertTo-Json -Depth 6 -Compress
}
