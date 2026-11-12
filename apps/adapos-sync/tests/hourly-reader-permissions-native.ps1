param([Parameter(Mandatory=$true)][string]$Setup)
$ErrorActionPreference='Stop'
. $Setup
$passed=@();$failed=@()
function Check([bool]$Value){if(-not $Value){throw 'FIXTURE_ASSERTION'}}
function Case([string]$Name,[scriptblock]$Body){try{&$Body;$script:passed+=,$Name}catch{$script:failed+=@{case=$Name;line=$_.InvocationInfo.ScriptLineNumber;type=$_.Exception.GetType().Name}}}
$sid='S-1-5-21-111-222-333-1001';$base='D:P(A;;FA;;;SY)(A;;FA;;;BA)'
function Fixture([string]$Fault='none'){
 $spec=Get-H004PermissionSpec
 $state=@{fault=$Fault;saved=$null;gets=0;sets=0;saves=0;preflights=0;preserves=0;entries=@{}}
 foreach($s in $spec){$state.entries[$s.key]=@{identity=('fixture-'+$s.key);sddl=$base}}
 $read={param($s);$state.gets++;return @{identity=$state.entries[$s.key].identity;sddl=$state.entries[$s.key].sddl}}.GetNewClosure()
 $write={param($s,$d);$state.sets++;if($state.fault -eq 'set-failure' -and $state.sets -eq 3){throw [UnauthorizedAccessException]::new('MUST_NEVER_ESCAPE')};$state.entries[$s.key].sddl=$d;if($state.fault -eq 'set-then-throw'){throw [IO.IOException]::new('MUST_NEVER_ESCAPE')}}.GetNewClosure()
 $quiet={if($state.fault -eq 'foreign-during-quiet'){$state.entries['object-00'].sddl='D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;BU)'};if($state.fault -eq 'identity-during-quiet'){$state.entries['object-00'].identity='foreign-identity'}}.GetNewClosure()
 $provider=@{
  Preflight={$state.preflights++;if($state.fault -eq 'busy'){Stop-H004Permission 'HOURLY_OR_FULLSYNC_BUSY'}}.GetNewClosure()
  Load={return $state.saved}.GetNewClosure()
  Save={param($v);$state.saves++;if($state.fault -eq 'save-failure'){Stop-H004Permission 'BACKUP_WRITE_UNVERIFIED'};$state.saved=($v|ConvertTo-Json -Depth 12 -Compress)|ConvertFrom-Json}.GetNewClosure()
  Get=$read
  Set={param($s,$d,$identity,$expected);Invoke-H004CheckedPermissionWrite $s $d $identity $expected $quiet $read $write}.GetNewClosure()
  Preserve={$state.preserves++;if($state.fault -eq 'preserve-failure'){Stop-H004Permission 'PRESERVATION_UNVERIFIED'}}.GetNewClosure()
 }
 return @{spec=$spec;state=$state;provider=$provider}
}
function Run($f,[string]$Mode='Apply',[bool]$Approved=$true){Invoke-H004PermissionEngine -Mode $Mode -Approved $Approved -Sid $sid -Spec $f.spec -Provider $f.provider}
Case 'fixed-spec-is-19-objects-and-only-eleven-hourly-tasks' {$s=Get-H004PermissionSpec;Check ($s.Count -eq 19);Check (@($s|Where-Object {$_.kind -eq 'task'}).Count -eq 11);Check (@($s|Where-Object {$_.kind -eq 'file'}).Count -eq 3)}
Case 'executable-scope-exactly-matches-reviewed-permission-manifest' {
  $m=[IO.File]::ReadAllText((Join-Path (Split-Path $Setup -Parent) '..\docs\hourly004-direct-read-permissions-20261112.json'))|ConvertFrom-Json;$s=Get-H004PermissionSpec
  for($i=0;$i -lt 3;$i++){Check ($s[$i].path -ceq $m.readFiles[$i]);Check ($s[$i].rules[0].mask -eq $m.fileReadMask -and $s[$i].rules[0].flags -eq 0)}
  for($i=0;$i -lt 4;$i++){Check ($s[$i+3].path -ceq $m.metadataDirectories[$i]);Check ($s[$i+3].rules[0].mask -eq $m.ancestorMetadataMask -and $s[$i+3].rules[0].flags -eq 0)}
  Check ($s[7].path -ceq $m.queue.path -and $s[7].rules[0].mask -eq $m.queue.directoryMask -and $s[7].rules[1].mask -eq $m.queue.childMetadataMask -and $s[7].rules[1].flags -eq 11)
  for($i=0;$i -lt 11;$i++){Check ($s[$i+8].path -ceq $m.taskNames[$i] -and $s[$i+8].rules[0].mask -eq $m.taskReadMask -and $s[$i+8].rules[0].flags -eq 0)}
}
Case 'plan-does-not-save-or-write' {$f=Fixture;$r=Run $f 'Plan';Check ($r.status -eq 'READ_PERMISSION_PLAN_READY');Check ($f.state.sets -eq 0 -and $f.state.saves -eq 0)}
Case 'apply-needs-explicit-scope-approval-before-provider' {$f=Fixture;$r=Run $f 'Apply' $false;Check ($r.errorCode -eq 'EXPLICIT_READ_SCOPE_APPROVAL_REQUIRED');Check ($f.state.preflights -eq 0 -and $f.state.sets -eq 0)}
Case 'rollback-needs-explicit-scope-approval' {$f=Fixture;$r=Run $f 'Rollback' $false;Check ($r.errorCode -eq 'EXPLICIT_READ_SCOPE_APPROVAL_REQUIRED');Check ($f.state.sets -eq 0)}
Case 'busy-work-is-not-stopped-or-retried' {$f=Fixture 'busy';$r=Run $f;Check ($r.errorCode -eq 'HOURLY_OR_FULLSYNC_BUSY');Check ($f.state.preflights -eq 1 -and $f.state.sets -eq 0 -and $f.state.saves -eq 0)}
Case 'durable-before-image-precedes-all-permission-writes' {$f=Fixture 'save-failure';$r=Run $f;Check ($r.errorCode -eq 'BACKUP_WRITE_UNVERIFIED');Check ($f.state.sets -eq 0)}
Case 'apply-verifies-each-object-and-preservation' {$f=Fixture;$r=Run $f;Check ($r.status -eq 'READ_PERMISSIONS_APPLIED_NATIVE_ACCEPTANCE_PENDING');Check ($r.objectsChanged -eq 19 -and $r.objectsAttempted -eq 19);Check ($f.state.saves -eq 1 -and $f.state.preserves -eq 1);Check $r.fullSyncDefinitionsUnchanged;Check $r.deltaConfigurationBytesUnchanged;Check ($r.nativeReadAcceptance -eq 'NOT_PERFORMED')}
Case 'status-does-not-change-permissions' {$f=Fixture;$null=Run $f;$before=$f.state.sets;$r=Run $f 'Status';Check ($r.status -eq 'READ_PERMISSIONS_PRESENT_NATIVE_ACCEPTANCE_PENDING');Check ($f.state.sets -eq $before)}
Case 'successful-apply-is-idempotent' {$f=Fixture;$null=Run $f;$before=$f.state.sets;$r=Run $f;Check ($r.status -eq 'READ_PERMISSIONS_ALREADY_PRESENT_NATIVE_ACCEPTANCE_PENDING');Check ($f.state.sets -eq $before -and $f.state.saves -eq 1)}
Case 'partial-apply-never-blindly-retries-or-auto-rolls-back' {$f=Fixture 'set-failure';$r=Run $f;Check ($r.status -eq 'STOPPED_REVIEW_REQUIRED');Check ($r.objectsAttempted -eq 3 -and $r.objectsChanged -eq 2);$before=$f.state.sets;$f.state.fault='none';$r=Run $f;Check ($r.errorCode -eq 'EXISTING_SETUP_REVIEW_REQUIRED');Check ($f.state.sets -eq $before)}
Case 'write-then-error-remains-uncertain-and-can-be-reviewed' {$f=Fixture 'set-then-throw';$r=Run $f;Check ($r.objectsAttempted -eq 1 -and $r.objectsChanged -eq 0);Check ($r.status -eq 'STOPPED_REVIEW_REQUIRED');$f.state.fault='none';$r=Run $f 'Status';Check ($r.status -eq 'PARTIAL_SETUP_REVIEW_REQUIRED')}
Case 'rollback-restores-only-matching-owned-after-images' {$f=Fixture;$null=Run $f;$r=Run $f 'Rollback';Check ($r.status -eq 'READER_PERMISSION_ROLLBACK_COMPLETED');Check ($r.objectsChanged -eq 19);foreach($v in $f.state.entries.Values){Check ($v.sddl -ceq (Normalize-H004PermissionDacl $base))}}
Case 'rollback-of-partial-setup-needs-no-completion-retry' {$f=Fixture 'set-failure';$null=Run $f;$f.state.fault='none';$r=Run $f 'Rollback';Check ($r.status -eq 'READER_PERMISSION_ROLLBACK_COMPLETED');Check ($r.objectsChanged -eq 2)}
Case 'second-rollback-is-idempotent' {$f=Fixture;$null=Run $f;$null=Run $f 'Rollback';$before=$f.state.sets;$r=Run $f 'Rollback';Check ($r.objectsChanged -eq 0 -and $f.state.sets -eq $before)}
Case 'foreign-dacl-stops-rollback-before-any-write' {$f=Fixture;$null=Run $f;$f.state.entries['object-18'].sddl='D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;BU)';$before=$f.state.sets;$r=Run $f 'Rollback';Check ($r.errorCode -eq 'FOREIGN_PERMISSION_CHANGE');Check ($f.state.sets -eq $before);Check ($f.state.entries['object-18'].sddl -like '*BU*')}
Case 'foreign-object-identity-stops-before-write' {$f=Fixture;$null=Run $f;$f.state.entries['object-00'].identity='foreign-object';$before=$f.state.sets;$r=Run $f 'Rollback';Check ($r.errorCode -eq 'OBJECT_IDENTITY_CHANGED');Check ($f.state.sets -eq $before)}
Case 'foreign-acl-edit-during-quiet-is-preserved-before-apply-write' {$f=Fixture 'foreign-during-quiet';$r=Run $f;Check ($r.errorCode -eq 'FOREIGN_PERMISSION_CHANGE');Check ($f.state.sets -eq 0);Check ($f.state.entries['object-00'].sddl -like '*BU*')}
Case 'foreign-task-or-file-replacement-during-quiet-stops-before-write' {$f=Fixture 'identity-during-quiet';$r=Run $f;Check ($r.errorCode -eq 'OBJECT_IDENTITY_CHANGED');Check ($f.state.sets -eq 0)}
Case 'tampered-backup-cannot-add-unreviewed-rights-or-targets' {$f=Fixture;$null=Run $f;$f.state.saved.objects[0].after='D:P(A;;FA;;;WD)';$before=$f.state.sets;$r=Run $f 'Rollback';Check ($r.errorCode -eq 'BACKUP_UNVERIFIED');Check ($f.state.sets -eq $before)}
Case 'existing-reader-deny-is-never-overridden' {$f=Fixture;$f.state.entries['object-00'].sddl='D:P(D;;FR;;;'+$sid+')(A;;FA;;;SY)(A;;FA;;;BA)';$r=Run $f;Check ($r.errorCode -eq 'EXISTING_READER_DENY_REVIEW_REQUIRED');Check ($f.state.sets -eq 0 -and $f.state.saves -eq 0)}
Case 'existing-reader-write-rights-require-review-not-revocation' {$f=Fixture;$f.state.entries['object-00'].sddl='D:P(A;;FA;;;'+$sid+')(A;;FA;;;SY)(A;;FA;;;BA)';$r=Run $f;Check ($r.errorCode -eq 'EXISTING_READER_RIGHTS_REVIEW_REQUIRED');Check ($f.state.sets -eq 0)}
Case 'already-existing-identical-read-ace-is-not-removed-on-rollback' {$f=Fixture;$s=$f.spec[0];$v=Add-H004PermissionRules $base $sid $s.rules;$f.state.entries[$s.key].sddl=$v;$null=Run $f;$r=Run $f 'Rollback';Check ($r.objectsChanged -eq 18);Check ($f.state.entries[$s.key].sddl -ceq $v);$r=Run $f 'Status';Check ($r.status -eq 'READ_PERMISSIONS_NOT_APPLIED')}
Case 'native-access-code-and-failing-object-are-retained-without-message' {$f=Fixture 'set-failure';$r=Run $f;Check ($r.errorCode -eq 'READ_SCOPE_ACCESS_DENIED');Check ($r.nativeErrorCode -eq 5 -and $r.failedObjectNumber -eq 3 -and $r.failedStage -eq 'permission-write');Check (($r|ConvertTo-Json -Depth 8) -notmatch 'MUST_NEVER_ESCAPE')}
Case 'preservation-failure-does-not-claim-final-pass' {$f=Fixture 'preserve-failure';$r=Run $f;Check ($r.errorCode -eq 'PRESERVATION_UNVERIFIED');Check ($r.status -eq 'STOPPED_REVIEW_REQUIRED');Check ($null -eq $r.fullSyncDefinitionsUnchanged -and $null -eq $r.deltaConfigurationBytesUnchanged)}
Case 'safe-results-never-include-acls-sids-identities-or-business-data' {$f=Fixture;$r=Run $f;$text=$r|ConvertTo-Json -Depth 8 -Compress;Check ($text -notmatch 'MUST_NEVER_ESCAPE|S-1-5|D:P|fixture-object|object-0|identity|before|after');Check ($r.sourceSqlQueries -eq 0 -and $r.taskRuns -eq 0 -and -not $r.cloudScheduleChanged)}
Case 'file-directory-and-task-types-are-checked-before-granting-rights' {
  Assert-H004PermissionObjectKind @{IsDirectory=$true} 'directory';Assert-H004PermissionObjectKind @{IsDirectory=$false} 'file';Assert-H004PermissionObjectKind @{IsDirectory=$false} 'task'
  foreach($kind in @('file','task')){$blocked=$false;try{Assert-H004PermissionObjectKind @{IsDirectory=$true} $kind}catch{$blocked=$_.Exception.Message -eq 'OBJECT_KIND_UNVERIFIED'};Check $blocked}
  $blocked=$false;try{Assert-H004PermissionObjectKind @{IsDirectory=$false} 'directory'}catch{$blocked=$_.Exception.Message -eq 'OBJECT_KIND_UNVERIFIED'};Check $blocked
}
Case 'native-handle-dacl-and-child-metadata-inheritance-use-only-temporary-fixtures' {
  Initialize-H004PermissionHandles
  $root=Join-Path ([IO.Path]::GetTempPath()) ('h004-permission-'+[guid]::NewGuid().ToString('N'));$h=$null;$child=$null
  try{
    [void][IO.Directory]::CreateDirectory($root);$h=[Hourly004PermissionHandleV1]::new($root,$true);Check $h.IsDirectory;$before=$h.Read();$identity=$h.Identity
    $expected=Add-H004PermissionRules $before $sid @(@{mask=1048737;flags=0},@{mask=1048704;flags=11});$h.Write($expected)
    Check ((Normalize-H004PermissionDacl $h.Read()) -ceq (Normalize-H004PermissionDacl $expected));Check ($h.Identity -ceq $identity)
    $file=Join-Path $root 'synthetic.json';[IO.File]::WriteAllText($file,'SYNTHETIC');$child=[Hourly004PermissionHandleV1]::new($file,$false);Check (-not $child.IsDirectory)
    $d=[Security.AccessControl.RawSecurityDescriptor]::new($child.Read());$aces=@($d.DiscretionaryAcl|Where-Object {$_.SecurityIdentifier.Value -ceq $sid});Check ($aces.Count -eq 1);Check (($aces[0].AccessMask -band 1) -eq 0);Check (($aces[0].AccessMask -band 128) -eq 128)
    $h.Write($before);Check ((Normalize-H004PermissionDacl $h.Read()) -ceq (Normalize-H004PermissionDacl $before))
  }finally{
    if($null -ne $child){$child.Dispose()};if($null -ne $h){$h.Dispose()}
    $resolved=[IO.Path]::GetFullPath($root);$bound=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if($resolved.StartsWith($bound,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -like 'h004-permission-*'){Remove-Item -LiteralPath $resolved -Recurse -Force}
  }
}
[pscustomobject]@{simulation=$true;nativePowerShell=$PSVersionTable.PSVersion.ToString();passed=$passed.Count;failed=$failed.Count;failures=$failed;productionPermissionWrites=0;taskRuns=0;sqlQueries=0;runtimePolicyChanges=0}|ConvertTo-Json -Depth 5 -Compress
if($failed.Count){exit 1}
