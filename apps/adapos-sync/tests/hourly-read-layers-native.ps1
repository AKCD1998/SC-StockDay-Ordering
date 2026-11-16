param([Parameter(Mandatory=$true)][string]$Probe)
$ErrorActionPreference='Stop';. $Probe
$native=New-H004ReadLayerBindings
if($native.GetMethod('CreateFileW').GetParameters().Count -ne 7 -or $native.GetMethod('CloseHandle').GetParameters().Count -ne 1){throw 'SIGNATURE_FAILED'}
$dir=Join-Path ([IO.Path]::GetTempPath()) ('h004-layer-fixture-'+[Guid]::NewGuid().ToString('N'));$checks=@()
try{
 [void][IO.Directory]::CreateDirectory($dir)
 foreach($mask in @([uint32]129,[uint32]8,[uint32]2147483648)){$v=Invoke-H004ReadLayerOpen $native $dir $mask;if(-not$v.opened -or -not$v.handleClosed -or $null -ne $v.nativeError){throw 'FIXTURE_OPEN_FAILED'};$checks+=@{mask=$mask;opened=$true;closed=$true}}
 $missing=Invoke-H004ReadLayerOpen $native (Join-Path $dir 'not-created') 129
 if($missing.opened -or $missing.nativeError -notin @(2,3) -or $null -ne $missing.handleClosed){throw 'FIXTURE_NOT_FOUND_FAILED'}
 [pscustomobject]@{simulation=$true;nativePs=$PSVersionTable.PSVersion.ToString();signaturesVerified=2;checks=$checks;missingErrorRetained=$true;productionSourceReads=0;permissionChanges=0;taskRuns=0;compilerUsed=$false}|ConvertTo-Json -Depth 5 -Compress
}finally{$full=[IO.Path]::GetFullPath($dir);if(-not$full.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $full -Leaf) -notlike 'h004-layer-fixture-*'){throw 'FIXTURE_CLEANUP_SCOPE'};if([IO.Directory]::Exists($full)){Remove-Item -LiteralPath $full -Force}}
