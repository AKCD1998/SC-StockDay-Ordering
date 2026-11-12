$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$r=[ordered]@{schema='h004-root-kernel-accesscheck-v2';checkedAt=[DateTimeOffset]::UtcNow.ToString('o');status='UNKNOWN';identityVerified=$false;hostVerified=([Environment]::MachineName -ieq 'SERVER004');adminToken=$null;threadImpersonationDetected=$null;tokenBasis='process-primary';isTokenRestricted=$null;checks=@();impersonationPerformed=$false;permissionChanges=0;sourceReads=0;rootSecurityMetadataReads=0;namesEnumerated=0;sourceFileWrites=0;nativeReadAdmissionEstablished=$false}
$orig=[IntPtr]::Zero;$dup=[IntPtr]::Zero;$sdptr=[IntPtr]::Zero;$map=[IntPtr]::Zero;$priv=[IntPtr]::Zero;$stage='context'
try{
$id=[Security.Principal.WindowsIdentity]::GetCurrent();$r.identityVerified=($id.Name -ieq 'SERVER004\CodexSandboxOffline');$r.adminToken=([Security.Principal.WindowsPrincipal]::new($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$r.threadImpersonationDetected=($id.ImpersonationLevel -ne [Security.Principal.TokenImpersonationLevel]::None)
if(-not $r.identityVerified -or -not $r.hostVerified -or $r.adminToken -or $r.threadImpersonationDetected){throw 'CONTEXT_GATE'}
$stage='memory-only-interop'
$an=[Reflection.AssemblyName]::new('H004AccessCheckMemory')
$ab=[AppDomain]::CurrentDomain.DefineDynamicAssembly($an,[Reflection.Emit.AssemblyBuilderAccess]::Run)
$mb=$ab.DefineDynamicModule('Memory')
$tb=$mb.DefineType('H004Native',[Reflection.TypeAttributes]'Public,Sealed,Abstract')
function AddNative([string]$name,[Type]$ret,[Type[]]$parameterTypes){
 $meth=$tb.DefinePInvokeMethod($name,'advapi32.dll',[Reflection.MethodAttributes]'Public,Static,PinvokeImpl',[Reflection.CallingConventions]::Standard,$ret,$parameterTypes,[Runtime.InteropServices.CallingConvention]::Winapi,[Runtime.InteropServices.CharSet]::Auto)
 $meth.SetImplementationFlags($meth.GetMethodImplementationFlags() -bor [Reflection.MethodImplAttributes]::PreserveSig)
 $ctor=[Runtime.InteropServices.DllImportAttribute].GetConstructor([Type[]]@([string]))
 $fields=[Reflection.FieldInfo[]]@([Runtime.InteropServices.DllImportAttribute].GetField('SetLastError'))
 $attr=[Reflection.Emit.CustomAttributeBuilder]::new($ctor,[object[]]@('advapi32.dll'),$fields,[object[]]@($true))
 $meth.SetCustomAttribute($attr)
}
AddNative 'OpenProcessToken' ([bool]) ([Type[]]@([IntPtr],[uint32],[IntPtr].MakeByRefType()))
AddNative 'DuplicateToken' ([bool]) ([Type[]]@([IntPtr],[int],[IntPtr].MakeByRefType()))
AddNative 'IsTokenRestricted' ([bool]) ([Type[]]@([IntPtr]))
AddNative 'AccessCheck' ([bool]) ([Type[]]@([IntPtr],[IntPtr],[uint32],[IntPtr],[IntPtr],[uint32].MakeByRefType(),[uint32].MakeByRefType(),[bool].MakeByRefType()))
AddNative 'MapGenericMask' ([void]) ([Type[]]@([uint32].MakeByRefType(),[IntPtr]))
$native=$tb.CreateType()
foreach($signature in @(@{name='OpenProcessToken';count=3},@{name='DuplicateToken';count=3},@{name='IsTokenRestricted';count=1},@{name='AccessCheck';count=8},@{name='MapGenericMask';count=2})){
 if($native.GetMethod($signature.name).GetParameters().Count -ne $signature.count){throw 'INTEROP_SIGNATURE_UNVERIFIED'}
}
$stage='open-token-query-duplicate'
if(-not $native::OpenProcessToken([IntPtr](-1),[uint32]10,[ref]$orig)){$r.nativeError=[Runtime.InteropServices.Marshal]::GetLastWin32Error();throw 'API_FAILED'}
$r.isTokenRestricted=$native::IsTokenRestricted($orig)
$stage='duplicate-for-accesscheck'
if(-not $native::DuplicateToken($orig,1,[ref]$dup)){$r.nativeError=[Runtime.InteropServices.Marshal]::GetLastWin32Error();throw 'API_FAILED'}
$stage='root-read-control'
$acl=[IO.Directory]::GetAccessControl('C:\Windows\System32\Tasks',([Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group))
$r.rootSecurityMetadataReads=1
[byte[]]$sd=$acl.GetSecurityDescriptorBinaryForm();$sdptr=[Runtime.InteropServices.Marshal]::AllocHGlobal($sd.Length);[Runtime.InteropServices.Marshal]::Copy($sd,0,$sdptr,$sd.Length)
$map=[Runtime.InteropServices.Marshal]::AllocHGlobal(16);$vals=@(0x120089,0x120116,0x1200A0,0x1F01FF);for($i=0;$i-lt 4;$i++){[Runtime.InteropServices.Marshal]::WriteInt32($map,$i*4,$vals[$i])}
$priv=[Runtime.InteropServices.Marshal]::AllocHGlobal(1024)
$stage='kernel-accesscheck'
foreach($q in @(@{label='READ_CONTROL';mask=[uint32]131072},@{label='directoryList';mask=[uint32]1},@{label='readAttributes';mask=[uint32]128},@{label='genericRead';mask=[uint32]2147483648})){
 [uint32]$desired=$q.mask;$native::MapGenericMask([ref]$desired,$map);[uint32]$len=1024;[uint32]$granted=0;[bool]$allowed=$false
 $ok=$native::AccessCheck($sdptr,$dup,$desired,$map,$priv,[ref]$len,[ref]$granted,[ref]$allowed)
 $err=$null;if(-not $ok){$err=[Runtime.InteropServices.Marshal]::GetLastWin32Error()}
 $r.checks+=,[ordered]@{right=$q.label;apiSucceeded=$ok;allowed=$(if($ok){$allowed}else{$null});nativeError=$err}
 if(-not $ok){throw 'API_FAILED'}
}
$r.status='KERNEL_ACCESSCHECK_COMPLETED';$r.limitation='Kernel AccessCheck on root security descriptor and an identification-only duplicate of the process primary token; pre-existing thread impersonation is rejected. Not proof of COM namespace visibility or actual directory open.'
}catch{$r.status='BLOCKED';$r.failedStage=$stage;$r.exceptionType=$_.Exception.GetType().FullName;$r.hresult=[int64]$_.Exception.HResult}
finally{
 foreach($p in @($sdptr,$map,$priv)){if($p -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::FreeHGlobal($p)}}
 if($dup -ne [IntPtr]::Zero){$h=[Microsoft.Win32.SafeHandles.SafeAccessTokenHandle]::new($dup);$h.Dispose()}
 if($orig -ne [IntPtr]::Zero){$h=[Microsoft.Win32.SafeHandles.SafeAccessTokenHandle]::new($orig);$h.Dispose()}
}
$r|ConvertTo-Json -Depth 7 -Compress
