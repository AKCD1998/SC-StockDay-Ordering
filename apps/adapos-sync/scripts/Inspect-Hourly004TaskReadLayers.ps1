param([switch]$EvaluateServiceRootRead)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
function New-H004ServiceRootCandidate([byte[]]$Descriptor,[Security.Principal.SecurityIdentifier]$Caller){
 # The exact service build checks mask1 in TaskCache Tree's SD VALUE. This is
 # a descriptor COPY, never the registry key ACL or filesystem DACL.
 $copy=[Security.AccessControl.RawSecurityDescriptor]::new($Descriptor,0)
 if($null -eq $copy.DiscretionaryAcl -or $copy.DiscretionaryAcl.Count -eq 0){throw 'SERVICE_DACL_UNVERIFIED'}
 $at=$copy.DiscretionaryAcl.Count
 for($i=0;$i -lt $copy.DiscretionaryAcl.Count;$i++){if(([int]$copy.DiscretionaryAcl[$i].AceFlags -band 16) -ne 0){$at=$i;break}}
 $copy.DiscretionaryAcl.InsertAce($at,[Security.AccessControl.CommonAce]::new([Security.AccessControl.AceFlags]::None,[Security.AccessControl.AceQualifier]::AccessAllowed,1,$Caller,$false,$null))
 [byte[]]$result=New-Object byte[] $copy.BinaryLength;$copy.GetBinaryForm($result,0);return ,$result
}
function New-H004ServiceAccessBindings {
 $a=[AppDomain]::CurrentDomain.DefineDynamicAssembly([Reflection.AssemblyName]::new('H004ServiceAccess'),[Reflection.Emit.AssemblyBuilderAccess]::Run)
 $t=$a.DefineDynamicModule('Memory').DefineType('H004ServiceAccessNative',[Reflection.TypeAttributes]'Public,Sealed,Abstract')
 foreach($spec in @(@{name='OpenProcessToken';ret=[bool];parameters=[Type[]]@([IntPtr],[uint32],[IntPtr].MakeByRefType())},@{name='DuplicateToken';ret=[bool];parameters=[Type[]]@([IntPtr],[int],[IntPtr].MakeByRefType())},@{name='AccessCheck';ret=[bool];parameters=[Type[]]@([IntPtr],[IntPtr],[uint32],[IntPtr],[IntPtr],[uint32].MakeByRefType(),[uint32].MakeByRefType(),[bool].MakeByRefType())})){
  $m=$t.DefineMethod($spec.name,[Reflection.MethodAttributes]'Public,Static,PinvokeImpl',$spec.ret,$spec.parameters)
  $m.SetImplementationFlags($m.GetMethodImplementationFlags() -bor [Reflection.MethodImplAttributes]::PreserveSig)
  $ctor=[Runtime.InteropServices.DllImportAttribute].GetConstructor([Type[]]@([string]))
  $fields=[Reflection.FieldInfo[]]@([Runtime.InteropServices.DllImportAttribute].GetField('SetLastError'),[Runtime.InteropServices.DllImportAttribute].GetField('EntryPoint'),[Runtime.InteropServices.DllImportAttribute].GetField('ExactSpelling'))
  $m.SetCustomAttribute([Reflection.Emit.CustomAttributeBuilder]::new($ctor,[object[]]@('advapi32.dll'),$fields,[object[]]@($true,$spec.name,$true)))
 }
 $native=$t.CreateType()
 foreach($signature in @(@{name='OpenProcessToken';count=3},@{name='DuplicateToken';count=3},@{name='AccessCheck';count=8})){
  $m=$native.GetMethod($signature.name)
  if($m.GetParameters().Count -ne $signature.count -or -not$m.GetCustomAttributes([Runtime.InteropServices.DllImportAttribute],$false)[0].SetLastError){throw 'SERVICE_BINDING_UNVERIFIED'}
 }
 return $native
}
function Test-H004ServiceDescriptorAccess([Type]$Native,[byte[]]$Descriptor,[IntPtr]$Token,[uint32]$Desired){
 $sd=[IntPtr]::Zero;$map=[IntPtr]::Zero;$priv=[IntPtr]::Zero
 try{
  $sd=[Runtime.InteropServices.Marshal]::AllocHGlobal($Descriptor.Length);[Runtime.InteropServices.Marshal]::Copy($Descriptor,0,$sd,$Descriptor.Length)
  $map=[Runtime.InteropServices.Marshal]::AllocHGlobal(16);$values=@(0x120089,0x120116,0x1200a0,0x1f01ff)
  for($i=0;$i -lt 4;$i++){[Runtime.InteropServices.Marshal]::WriteInt32($map,$i*4,$values[$i])}
  $priv=[Runtime.InteropServices.Marshal]::AllocHGlobal(4096);[uint32]$length=4096;[uint32]$granted=0;[bool]$allowed=$false
  # Exact concrete masks only, matching the service's AccessCheck invocation.
  if(-not$Native::AccessCheck($sd,$Token,$Desired,$map,$priv,[ref]$length,[ref]$granted,[ref]$allowed)){throw 'SERVICE_ACCESSCHECK_UNAVAILABLE'}
  return ($allowed -and ($granted -band $Desired) -eq $Desired)
 }finally{foreach($p in @($sd,$map,$priv)){if($p -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::FreeHGlobal($p)}}}
}
function Invoke-H004ServiceRootEvaluation([Security.Principal.WindowsIdentity]$Identity,[Type]$HandleBindings){
 $key=$null;$base=$null;$token=[IntPtr]::Zero;$duplicate=[IntPtr]::Zero
 $r=[ordered]@{requested=$true;descriptorSource='fixed-TaskCache-Tree-SD-value';descriptorRead=$false;candidateMask=1;candidateSelfOnly=$true;candidateApplied=$false;tokenBasis='identification-copy-of-process-primary-not-RPC-server-token';exactBuildMappingVerified=$false;checks=@();status='UNKNOWN';failedStage=$null;errorType=$null;hresult=$null;permissionChanges=0}
 $stage='exact-build-mapping-check'
 try{
  $client=[Diagnostics.FileVersionInfo]::GetVersionInfo('C:\Windows\System32\taskschd.dll').FileVersion.Split(' ')[0]
  $server=[Diagnostics.FileVersionInfo]::GetVersionInfo('C:\Windows\System32\schedsvc.dll').FileVersion.Split(' ')[0]
  if($client -cne '10.0.19041.3636' -or $server -cne '10.0.19041.5965'){throw 'SERVICE_BUILD_UNVERIFIED'}
  # JobAccessCheck in this exact service build has the same four mapping values
  # as Test-H004ServiceDescriptorAccess (static function0x180015ae0).
  $r.exactBuildMappingVerified=$true
  $stage='fixed-registry-value-query'
  $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryView]::Registry64)
  $key=$base.OpenSubKey('SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tree',[Microsoft.Win32.RegistryKeyPermissionCheck]::ReadSubTree,[Security.AccessControl.RegistryRights]::QueryValues)
  if($null -eq $key){throw 'SERVICE_STORE_KEY_NOT_VISIBLE'}
  if($key.GetValueKind('SD') -ne [Microsoft.Win32.RegistryValueKind]::Binary){throw 'SERVICE_SD_KIND_UNVERIFIED'}
  [byte[]]$descriptor=$key.GetValue('SD',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  if($null -eq $descriptor -or $descriptor.Length -lt 20 -or $descriptor.Length -gt 65536){throw 'SERVICE_SD_SIZE_UNVERIFIED'}
  $raw=[Security.AccessControl.RawSecurityDescriptor]::new($descriptor,0)
  if($null -eq $raw.Owner -or $null -eq $raw.Group -or $null -eq $raw.DiscretionaryAcl){throw 'SERVICE_SD_UNVERIFIED'}
  $r.descriptorRead=$true
  $stage='service-descriptor-ram-accesscheck';$native=New-H004ServiceAccessBindings
  if(-not$native::OpenProcessToken([IntPtr](-1),[uint32]10,[ref]$token)){throw 'SERVICE_TOKEN_QUERY_UNAVAILABLE'}
  if(-not$native::DuplicateToken($token,1,[ref]$duplicate)){throw 'SERVICE_TOKEN_COPY_UNAVAILABLE'}
  [byte[]]$candidate=New-H004ServiceRootCandidate $descriptor $Identity.User
  foreach($q in @(@{name='serviceRead';mask=1},@{name='serviceWrite';mask=2},@{name='execute';mask=32},@{name='readControl';mask=131072},@{name='writeDacl';mask=262144},@{name='writeOwner';mask=524288})){
   $before=Test-H004ServiceDescriptorAccess $native $descriptor $duplicate $q.mask
   $after=Test-H004ServiceDescriptorAccess $native $candidate $duplicate $q.mask
   $r.checks+=,[ordered]@{right=$q.name;mask=$q.mask;currentAllowed=$before;ramCandidateAllowed=$after}
  }
  $r.status='RAM_EVALUATED_NOT_RPC_ADMISSION'
 }catch{
  $r.failedStage=$stage;$e=$_.Exception;for($i=0;$null -ne $e.InnerException -and $i -lt 5;$i++){$e=$e.InnerException}
  $r.errorType=$e.GetType().FullName;$r.hresult=[int64]$e.HResult
 }finally{
  foreach($h in @($duplicate,$token)){if($h -ne [IntPtr]::Zero){[void]$HandleBindings::CloseHandle($h)}}
  if($null -ne $key){$key.Dispose()};if($null -ne $base){$base.Dispose()}
 }
 return [pscustomobject]$r
}
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
  if($EvaluateServiceRootRead){$r.serviceRootEvaluation=Invoke-H004ServiceRootEvaluation $id $native}
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
