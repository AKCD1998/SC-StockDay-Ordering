param([Parameter(Mandatory=$true)][string]$Probe)
$ErrorActionPreference='Stop'
$source=[IO.File]::ReadAllText($Probe)
$fnStart=$source.IndexOf('function New-H004RootReadCandidate(')
$fnEnd=$source.IndexOf('$r=[ordered]@')
if($fnStart -lt 0 -or $fnEnd -le $fnStart){throw 'CANDIDATE_FUNCTION_UNVERIFIED'}
. ([scriptblock]::Create($source.Substring($fnStart,$fnEnd-$fnStart)))
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
$mixed=[Security.AccessControl.RawSecurityDescriptor]::new(('O:'+$me+'G:S-1-5-32-545D:AI(A;;RC;;;SY)(A;ID;FR;;;BA)'))
[byte[]]$mixedBytes=New-Object byte[] $mixed.BinaryLength;$mixed.GetBinaryForm($mixedBytes,0)
$mixedCandidate=[Security.AccessControl.RawSecurityDescriptor]::new((New-H004RootReadCandidate $mixedBytes ([Security.Principal.SecurityIdentifier]::new($me))),0)
if($mixedCandidate.DiscretionaryAcl.Count -ne 3 -or $mixedCandidate.DiscretionaryAcl[1].AccessMask -ne 129 -or $mixedCandidate.DiscretionaryAcl[1].AceFlags -ne 0 -or $mixedCandidate.ControlFlags -ne $mixed.ControlFlags){throw 'CANDIDATE_INHERITANCE_DIFFER'}
for($i=0;$i -lt 2;$i++){
 [byte[]]$before=New-Object byte[] $mixed.DiscretionaryAcl[$i].BinaryLength;$mixed.DiscretionaryAcl[$i].GetBinaryForm($before,0)
 $newIndex=$(if($i -eq 0){0}else{2})
 [byte[]]$after=New-Object byte[] $mixedCandidate.DiscretionaryAcl[$newIndex].BinaryLength;$mixedCandidate.DiscretionaryAcl[$newIndex].GetBinaryForm($after,0)
 if([Convert]::ToBase64String($before) -cne [Convert]::ToBase64String($after)){throw 'CANDIDATE_FOREIGN_ACE_DIFFER'}
}
$nullDacl=[Security.AccessControl.RawSecurityDescriptor]::new(('O:'+$me+'G:S-1-5-32-545'))
[byte[]]$nullBytes=New-Object byte[] $nullDacl.BinaryLength;$nullDacl.GetBinaryForm($nullBytes,0)
$nullRejected=$false;try{$null=New-H004RootReadCandidate $nullBytes ([Security.Principal.SecurityIdentifier]::new($me))}catch{if($_.Exception.Message -eq 'CANDIDATE_NULL_DACL'){$nullRejected=$true}else{throw}}
if(-not $nullRejected){throw 'CANDIDATE_NULL_DACL_ACCEPTED'}
foreach($case in @(@{name='read-control-only';mask='RC';read=$false},@{name='generic-read';mask='FR';read=$true})){
# Synthetic descriptors in memory only, no ACL writes or source file reads.
$d=[Security.AccessControl.RawSecurityDescriptor]::new(('O:'+$me+'G:S-1-5-32-545D:P(A;;'+$case.mask+';;;'+$me+')'))
[byte[]]$sd=New-Object byte[] $d.BinaryLength;$d.GetBinaryForm($sd,0)
if($case.name -eq 'read-control-only'){
 $candidate=New-H004RootReadCandidate $sd ([Security.Principal.SecurityIdentifier]::new($me))
 $planned=[Security.AccessControl.RawSecurityDescriptor]::new($candidate,0)
 if($planned.DiscretionaryAcl.Count -ne 2 -or $planned.DiscretionaryAcl[1].AccessMask -ne 129 -or $planned.DiscretionaryAcl[1].AceFlags -ne 0 -or $planned.Owner.Value -ne $d.Owner.Value -or $planned.Group.Value -ne $d.Group.Value -or $planned.ControlFlags -ne $d.ControlFlags){throw 'CANDIDATE_SCOPE_DIFFER'}
 [byte[]]$old=New-Object byte[] $d.DiscretionaryAcl[0].BinaryLength;$d.DiscretionaryAcl[0].GetBinaryForm($old,0)
 [byte[]]$kept=New-Object byte[] $planned.DiscretionaryAcl[0].BinaryLength;$planned.DiscretionaryAcl[0].GetBinaryForm($kept,0)
 if([Convert]::ToBase64String($old) -cne [Convert]::ToBase64String($kept)){throw 'CANDIDATE_EXISTING_ACE_CHANGED'}
 # Exact production helper against synthetic descriptor, no system ACL read/write.
 $casesWithCandidate=@(@{name=$case.name;sd=$sd;list=$false;attributes=$false;generic=$false},@{name='candidate-self-read-129';sd=$candidate;list=$true;attributes=$true;generic=$false})
}else{$casesWithCandidate=@(@{name=$case.name;sd=$sd;list=$true;attributes=$true;generic=$true})}
foreach($fixture in $casesWithCandidate){
[byte[]]$sd=$fixture.sd
$sdptr=[Runtime.InteropServices.Marshal]::AllocHGlobal($sd.Length);[Runtime.InteropServices.Marshal]::Copy($sd,0,$sdptr,$sd.Length)
foreach($q in @(@{label='READ_CONTROL';mask=[uint32]131072;expected=$true},@{label='directoryList';mask=[uint32]1;expected=$fixture.list},@{label='readAttributes';mask=[uint32]128;expected=$fixture.attributes},@{label='genericRead';mask=[uint32]2147483648;expected=$fixture.generic})){
[uint32]$desired=$q.mask;$native::MapGenericMask([ref]$desired,$map);[uint32]$len=1024;[uint32]$granted=0;[bool]$allowed=$false
if(-not $native::AccessCheck($sdptr,$dup,$desired,$map,$priv,[ref]$len,[ref]$granted,[ref]$allowed)){throw 'FIXTURE_ACCESSCHECK_API_FAILED'}
if($allowed -ne $q.expected){throw 'FIXTURE_ACCESSCHECK_RESULT_DIFFER'}
$checks+=@{descriptor=$fixture.name;right=$q.label;allowed=$allowed}
}
[Runtime.InteropServices.Marshal]::FreeHGlobal($sdptr);$sdptr=[IntPtr]::Zero
}
}
[pscustomobject]@{simulation=$true;nativePowerShell=$PSVersionTable.PSVersion.ToString();passed=$true;signatureCount=$expected.Count;legacyOpenProcessTokenParameterCount=$oldCount;fixedOpenProcessTokenParameterCount=$native.GetMethod('OpenProcessToken').GetParameters().Count;ownTokenQuerySucceeded=$true;isTokenRestricted=$isRestricted;syntheticChecks=$checks;impersonationPerformed=$false;permissionChanges=0;sourceReads=0;taskRuns=0;compilerUsed=$false;sourceFileWrites=0}|ConvertTo-Json -Depth 5 -Compress
}finally{
foreach($p in @($sdptr,$map,$priv)){if($p -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::FreeHGlobal($p)}}
if($dup -ne [IntPtr]::Zero){$h=[Microsoft.Win32.SafeHandles.SafeAccessTokenHandle]::new($dup);$h.Dispose()}
if($orig -ne [IntPtr]::Zero){$h=[Microsoft.Win32.SafeHandles.SafeAccessTokenHandle]::new($orig);$h.Dispose()}
}

