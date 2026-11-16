param([Parameter(Mandatory=$true)][string]$Probe)
$ErrorActionPreference='Stop';. $Probe
$native=New-H004ReadLayerBindings
$serviceNative=New-H004ServiceAccessBindings
$primary=[IntPtr]::Zero;$duplicate=[IntPtr]::Zero
if($native.GetMethod('CreateFileW').GetParameters().Count -ne 7 -or $native.GetMethod('CloseHandle').GetParameters().Count -ne 1){throw 'SIGNATURE_FAILED'}
$dir=Join-Path ([IO.Path]::GetTempPath()) ('h004-layer-fixture-'+[Guid]::NewGuid().ToString('N'));$checks=@()
try{
 if(-not$serviceNative::OpenProcessToken([IntPtr](-1),[uint32]10,[ref]$primary) -or -not$serviceNative::DuplicateToken($primary,1,[ref]$duplicate)){throw 'FIXTURE_TOKEN_UNAVAILABLE'}
 $caller=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $serviceChecks=0
 foreach($scenario in @(@{allow=0;deny=0},@{allow=2;deny=0},@{allow=131072;deny=0},@{allow=0;deny=1})){
  $text='O:SYG:SYD:'
  if($scenario.deny){$text+='(D;;0x1;;;'+$caller.Value+')'}
  $text+='(A;;GA;;;SY)'
  if($scenario.allow){$text+='(A;;0x'+$scenario.allow.ToString('x')+';;;'+$caller.Value+')'}
  $raw=[Security.AccessControl.RawSecurityDescriptor]::new($text);[byte[]]$before=New-Object byte[] $raw.BinaryLength;$raw.GetBinaryForm($before,0)
  [byte[]]$candidate=New-H004ServiceRootCandidate $before $caller
  $after=[Security.AccessControl.RawSecurityDescriptor]::new($candidate,0)
  if($after.Owner -ne $raw.Owner -or $after.Group -ne $raw.Group -or $after.ControlFlags -ne $raw.ControlFlags -or $after.DiscretionaryAcl.Count -ne $raw.DiscretionaryAcl.Count+1){throw 'FIXTURE_CANDIDATE_PRESERVATION_FAILED'}
  $ace=$after.DiscretionaryAcl[$after.DiscretionaryAcl.Count-1]
  if($ace.AccessMask -ne 1 -or [int]$ace.AceFlags -ne 0 -or $ace.SecurityIdentifier -ne $caller){throw 'FIXTURE_CANDIDATE_SCOPE_FAILED'}
  for($i=0;$i -lt $raw.DiscretionaryAcl.Count;$i++){
   $ab=New-Object byte[] $raw.DiscretionaryAcl[$i].BinaryLength;$bb=New-Object byte[] $after.DiscretionaryAcl[$i].BinaryLength
   $raw.DiscretionaryAcl[$i].GetBinaryForm($ab,0);$after.DiscretionaryAcl[$i].GetBinaryForm($bb,0)
   if(-not[Linq.Enumerable]::SequenceEqual([byte[]]$ab,[byte[]]$bb)){throw 'FIXTURE_ORIGINAL_ACE_CHANGED'}
  }
  foreach($mask in @(1,2,32,131072,262144,524288)){
   $current=Test-H004ServiceDescriptorAccess $serviceNative $before $duplicate $mask
   $proposed=Test-H004ServiceDescriptorAccess $serviceNative $candidate $duplicate $mask
   if($mask -eq 1){if($current -or $proposed -ne (-not[bool]$scenario.deny)){throw 'FIXTURE_READ_DECISION_FAILED'}}
   elseif($current -ne $proposed){throw 'FIXTURE_UNRELATED_ACCESS_CHANGED'}
   $serviceChecks++
  }
 }
 [void][IO.Directory]::CreateDirectory($dir)
 foreach($mask in @([uint32]129,[uint32]8,[uint32]2147483648)){$v=Invoke-H004ReadLayerOpen $native $dir $mask;if(-not$v.opened -or -not$v.handleClosed -or $null -ne $v.nativeError){throw 'FIXTURE_OPEN_FAILED'};$checks+=@{mask=$mask;opened=$true;closed=$true}}
 $missing=Invoke-H004ReadLayerOpen $native (Join-Path $dir 'not-created') 129
 if($missing.opened -or $missing.nativeError -notin @(2,3) -or $null -ne $missing.handleClosed){throw 'FIXTURE_NOT_FOUND_FAILED'}
 [pscustomobject]@{simulation=$true;nativePs=$PSVersionTable.PSVersion.ToString();signaturesVerified=5;checks=$checks;serviceRamDecisions=$serviceChecks;registryQueries=0;missingErrorRetained=$true;productionSourceReads=0;permissionChanges=0;taskRuns=0;compilerUsed=$false}|ConvertTo-Json -Depth 5 -Compress
}finally{foreach($h in @($duplicate,$primary)){if($h -ne [IntPtr]::Zero){[void]$native::CloseHandle($h)}};$full=[IO.Path]::GetFullPath($dir);if(-not$full.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $full -Leaf) -notlike 'h004-layer-fixture-*'){throw 'FIXTURE_CLEANUP_SCOPE'};if([IO.Directory]::Exists($full)){Remove-Item -LiteralPath $full -Force}}
