param([Parameter(Mandatory=$true)][string]$Probe)
$ErrorActionPreference='Stop'
$source=[IO.File]::ReadAllText($Probe)
$start=$source.IndexOf('$stage=''memory-only-interop''')
$end=$source.IndexOf('$stage=''open-token-query-duplicate''')
if($start -lt 0 -or $end -le $start){throw 'FIXTURE_SOURCE_UNVERIFIED'}
$interop=$source.Substring($start,$end-$start)
# Extract only in-memory interop declarations. No target-host gate is forged;
# this fixture never invokes the SERVER004 audit or reads a system directory.
$native=&([scriptblock]::Create($interop+"`nreturn `$native"))
$expected=@{OpenProcessToken=3;DuplicateToken=3;IsTokenRestricted=1;AccessCheck=8;MapGenericMask=2}
foreach($name in $expected.Keys){if($native.GetMethod($name).GetParameters().Count -ne $expected[$name]){throw 'SIGNATURE_FIXTURE_FAILED'}}
$assertStart=$interop.IndexOf('foreach($signature')
if($assertStart -lt 0){throw 'SIGNATURE_GATE_MISSING'}
$legacy=$interop.Substring(0,$assertStart).Replace('$parameterTypes','$args')
$old=&([scriptblock]::Create($legacy+"`nreturn `$native"))
$oldCount=$old.GetMethod('OpenProcessToken').GetParameters().Count
if($oldCount -ne 0){throw 'LEGACY_FAILURE_NOT_REPRODUCED'}
$orig=[IntPtr]::Zero;$dup=[IntPtr]::Zero;$map=[IntPtr]::Zero;$priv=[IntPtr]::Zero;$sdptr=[IntPtr]::Zero
$checks=@()
try{
if(-not $native::OpenProcessToken([IntPtr](-1),[uint32]10,[ref]$orig)){throw 'FIXTURE_OWN_TOKEN_UNAVAILABLE'}
$isRestricted=$native::IsTokenRestricted($orig)
if(-not $native::DuplicateToken($orig,1,[ref]$dup)){throw 'FIXTURE_QUERY_DUPLICATE_UNAVAILABLE'}
$map=[Runtime.InteropServices.Marshal]::AllocHGlobal(16);$vals=@(0x120089,0x120116,0x1200A0,0x1F01FF)
for($i=0;$i-lt 4;$i++){[Runtime.InteropServices.Marshal]::WriteInt32($map,$i*4,$vals[$i])}
$priv=[Runtime.InteropServices.Marshal]::AllocHGlobal(1024)
$me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
foreach($case in @(@{name='read-control-only';mask='RC';read=$false},@{name='generic-read';mask='FR';read=$true})){
# Synthetic descriptors in memory only, no ACL writes or source file reads.
$d=[Security.AccessControl.RawSecurityDescriptor]::new(('O:'+$me+'G:S-1-5-32-545D:P(A;;'+$case.mask+';;;'+$me+')'))
[byte[]]$sd=New-Object byte[] $d.BinaryLength;$d.GetBinaryForm($sd,0)
$sdptr=[Runtime.InteropServices.Marshal]::AllocHGlobal($sd.Length);[Runtime.InteropServices.Marshal]::Copy($sd,0,$sdptr,$sd.Length)
foreach($q in @(@{label='READ_CONTROL';mask=[uint32]131072;expected=$true},@{label='directoryList';mask=[uint32]1;expected=$case.read},@{label='readAttributes';mask=[uint32]128;expected=$case.read},@{label='genericRead';mask=[uint32]2147483648;expected=$case.read})){
[uint32]$desired=$q.mask;$native::MapGenericMask([ref]$desired,$map);[uint32]$len=1024;[uint32]$granted=0;[bool]$allowed=$false
if(-not $native::AccessCheck($sdptr,$dup,$desired,$map,$priv,[ref]$len,[ref]$granted,[ref]$allowed)){throw 'FIXTURE_ACCESSCHECK_API_FAILED'}
if($allowed -ne $q.expected){throw 'FIXTURE_ACCESSCHECK_RESULT_DIFFER'}
$checks+=@{descriptor=$case.name;right=$q.label;allowed=$allowed}
}
[Runtime.InteropServices.Marshal]::FreeHGlobal($sdptr);$sdptr=[IntPtr]::Zero
}
[pscustomobject]@{simulation=$true;nativePowerShell=$PSVersionTable.PSVersion.ToString();passed=$true;signatureCount=$expected.Count;legacyOpenProcessTokenParameterCount=$oldCount;fixedOpenProcessTokenParameterCount=$native.GetMethod('OpenProcessToken').GetParameters().Count;ownTokenQuerySucceeded=$true;isTokenRestricted=$isRestricted;syntheticChecks=$checks;impersonationPerformed=$false;permissionChanges=0;sourceReads=0;taskRuns=0;compilerUsed=$false;sourceFileWrites=0}|ConvertTo-Json -Depth 5 -Compress
}finally{
foreach($p in @($sdptr,$map,$priv)){if($p -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::FreeHGlobal($p)}}
if($dup -ne [IntPtr]::Zero){$h=[Microsoft.Win32.SafeHandles.SafeAccessTokenHandle]::new($dup);$h.Dispose()}
if($orig -ne [IntPtr]::Zero){$h=[Microsoft.Win32.SafeHandles.SafeAccessTokenHandle]::new($orig);$h.Dispose()}
}

