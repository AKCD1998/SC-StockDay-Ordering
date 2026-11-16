param([Parameter(Mandatory=$true)][string]$Setup)
$ErrorActionPreference='Stop'
. $Setup
$passed=@();$failed=@()
function Check([bool]$Value){$script:checkIndex++;if(-not $Value){throw 'FIXTURE_ASSERTION'}}
function Case([string]$Name,[scriptblock]$Body){$script:checkIndex=0;try{&$Body;$script:passed+=,$Name}catch{$script:failed+=@{case=$Name;check=$script:checkIndex;line=$_.InvocationInfo.ScriptLineNumber;type=$_.Exception.GetType().Name}}}
$sid='S-1-5-21-111-222-333-1001';$base='D:P(A;;FA;;;SY)(A;;FA;;;BA)'
function Fixture([string]$Fault='none'){
 $spec=Get-H004PermissionSpec
 $state=@{fault=$Fault;taskService=$false;saved=$null;gets=0;sets=0;saves=0;preflights=0;preserves=0;entries=@{}}
 foreach($s in $spec){$state.entries[$s.key]=@{identity=('fixture-'+$s.key);sddl=$base}}
 $read={param($s);$state.gets++;return @{identity=$state.entries[$s.key].identity;sddl=$state.entries[$s.key].sddl}}.GetNewClosure()
 $write={param($s,$d);$state.sets++;if($state.fault -eq 'set-failure' -and $state.sets -eq 3){throw [UnauthorizedAccessException]::new('MUST_NEVER_ESCAPE')};$state.entries[$s.key].sddl=$d;if($state.taskService -and $s.kind -ceq 'task'){$state.entries[$s.key].sddl=TaskServiceFixtureReadback $d};if($state.fault -eq 'ai-on-write'){$state.entries[$s.key].sddl=WithControlFlag $d 1024};if($state.fault -eq 'extra-on-write'){$state.entries[$s.key].sddl=$d+'(A;;FR;;;BU)'};if($state.fault -eq 'set-then-throw' -or ($state.fault -eq 'task-then-throw' -and $s.kind -ceq 'task')){throw [IO.IOException]::new('MUST_NEVER_ESCAPE')}}.GetNewClosure()
 $quiet={if($state.fault -eq 'foreign-during-quiet'){$state.entries['object-00'].sddl='D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;BU)'};if($state.fault -eq 'foreign-during-resume-quiet'){$state.entries['object-01'].sddl='D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;BU)'};if($state.fault -eq 'foreign-during-task-quiet'){$state.entries['object-09'].sddl+='(A;;FR;;;BU)'};if($state.fault -eq 'identity-during-quiet'){$state.entries['object-00'].identity='foreign-identity'}}.GetNewClosure()
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
Case 'resume-needs-explicit-scope-approval-before-provider' {$f=Fixture;$r=Run $f 'Resume' $false;Check ($r.errorCode -eq 'EXPLICIT_READ_SCOPE_APPROVAL_REQUIRED');Check ($f.state.preflights -eq 0 -and $f.state.sets -eq 0)}
Case 'resume-requires-existing-snapshot-without-creating-one' {$f=Fixture;$r=Run $f 'Resume';Check ($r.errorCode -eq 'NO_SETUP_BACKUP');Check ($f.state.sets -eq 0 -and $f.state.saves -eq 0)}
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
function WithControlFlag([string]$Text,[int]$Flag){$d=[Security.AccessControl.RawSecurityDescriptor]::new($Text);$d.SetFlags([Security.AccessControl.ControlFlags]([int]$d.ControlFlags -bor $Flag));return $d.GetSddlForm([Security.AccessControl.AccessControlSections]::Access)}
function PartialWithAi {
  $f=Fixture 'set-then-throw';foreach($v in $f.state.entries.Values){$v.sddl='D:(A;;FA;;;SY)(A;;FA;;;BA)'}
  $r=Run $f;Check ($r.objectsAttempted -eq 1 -and $r.objectsChanged -eq 0)
  $f.state.entries['object-00'].sddl=WithControlFlag $f.state.entries['object-00'].sddl 1024;$f.state.fault='none';return $f
}
Case 'comparison-tolerates-only-ai-while-snapshot-canonicalization-stays-unchanged' {
  $v='D:(A;;FA;;;SY)(A;;FA;;;BA)';$ai=WithControlFlag $v 1024
  Check (Test-H004PermissionDaclEqual $ai $v);Check (Test-H004PermissionDaclEqual $v $ai)
  Check ((Normalize-H004PermissionDacl $v) -cne (Normalize-H004PermissionDacl $ai))
}
Case 'comparison-preserves-all-other-sddl-control-flags' {
  $v='D:(A;;FA;;;SY)(A;;FA;;;BA)'
  foreach($flag in @(256,4096)){Check (-not (Test-H004PermissionDaclEqual (WithControlFlag (WithControlFlag $v 1024) $flag) $v))}
}
Case 'comparison-rejects-ace-mask-order-inherited-flag-deny-and-extra-entries' {
  $v='D:(A;;FA;;;SY)(A;;FA;;;BA)'
  foreach($other in @('D:AI(A;;FR;;;SY)(A;;FA;;;BA)','D:AI(A;;FA;;;BA)(A;;FA;;;SY)','D:AI(A;ID;FA;;;SY)(A;;FA;;;BA)','D:AI(D;;FA;;;SY)(A;;FA;;;BA)','D:AI(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;BU)')){Check (-not (Test-H004PermissionDaclEqual $other $v))}
}
Case 'ai-only-kernel-readback-passes-all-apply-status-and-rollback-stages' {$f=Fixture 'ai-on-write';foreach($v in $f.state.entries.Values){$v.sddl='D:(A;;FA;;;SY)(A;;FA;;;BA)'};$r=Run $f;Check ($r.status -eq 'READ_PERMISSIONS_APPLIED_NATIVE_ACCEPTANCE_PENDING' -and $r.objectsChanged -eq 19);$r=Run $f 'Status';Check ($r.status -eq 'READ_PERMISSIONS_PRESENT_NATIVE_ACCEPTANCE_PENDING');$r=Run $f 'Rollback';Check ($r.status -eq 'READER_PERMISSION_ROLLBACK_COMPLETED' -and $r.objectsChanged -eq 19)}
Case 'extra-ace-on-write-still-fails-readback-without-auto-rollback' {$f=Fixture 'extra-on-write';$r=Run $f;Check ($r.errorCode -eq 'PERMISSION_READBACK_DIFFER' -and $r.objectsAttempted -eq 1 -and $r.objectsChanged -eq 0 -and $f.state.sets -eq 1)}
Case 'observed-one-after-eighteen-before-status-is-partial-not-foreign' {$f=PartialWithAi;$before=$f.state.sets;$r=Run $f 'Status';Check ($r.status -eq 'PARTIAL_SETUP_REVIEW_REQUIRED');Check ($f.state.sets -eq $before)}
Case 'old-apply-cannot-blindly-continue-ai-partial-state' {$f=PartialWithAi;$before=$f.state.sets;$r=Run $f;Check ($r.errorCode -eq 'EXISTING_SETUP_REVIEW_REQUIRED');Check ($f.state.sets -eq $before)}
Case 'explicit-resume-skips-completed-object-and-preserves-original-snapshot' {
  $f=PartialWithAi;$saved=$f.state.saved|ConvertTo-Json -Depth 12 -Compress;$before=$f.state.sets;$r=Run $f 'Resume'
  Check ($r.status -eq 'READ_PERMISSIONS_RESUMED_NATIVE_ACCEPTANCE_PENDING');Check ($r.objectsChanged -eq 18 -and $r.objectsAttempted -eq 18 -and $f.state.sets -eq ($before+18))
  Check ($f.state.saves -eq 1 -and $f.state.preserves -eq 1);Check (($f.state.saved|ConvertTo-Json -Depth 12 -Compress) -ceq $saved)
  $before=$f.state.sets;$r=Run $f 'Resume';Check ($r.objectsAttempted -eq 0 -and $r.objectsChanged -eq 0 -and $f.state.sets -eq $before)
}
Case 'resume-rejects-foreign-on-last-object-before-first-write' {$f=PartialWithAi;$f.state.entries['object-18'].sddl='D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;BU)';$before=$f.state.sets;$r=Run $f 'Resume';Check ($r.errorCode -eq 'FOREIGN_PERMISSION_CHANGE' -and $f.state.sets -eq $before)}
Case 'resume-rejects-identity-change-before-first-write' {$f=PartialWithAi;$f.state.entries['object-18'].identity='replacement';$before=$f.state.sets;$r=Run $f 'Resume';Check ($r.errorCode -eq 'OBJECT_IDENTITY_CHANGED' -and $f.state.sets -eq $before)}
Case 'resume-rejects-tampered-snapshot-without-replacing-it' {$f=PartialWithAi;$f.state.saved.objects[0].after='D:(A;;FA;;;WD)';$before=$f.state.sets;$r=Run $f 'Resume';Check ($r.errorCode -eq 'BACKUP_UNVERIFIED' -and $f.state.sets -eq $before -and $f.state.saves -eq 1)}
Case 'resume-rejects-edits-during-quiet-before-remaining-write' {$f=PartialWithAi;$f.state.fault='foreign-during-resume-quiet';$before=$f.state.sets;$r=Run $f 'Resume';Check ($r.errorCode -eq 'FOREIGN_PERMISSION_CHANGE' -and $f.state.sets -eq $before)}
Case 'rollback-accepts-ai-only-readback-and-preserves-original-rights' {$f=PartialWithAi;$before=$f.state.sets;$r=Run $f 'Rollback';Check ($r.status -eq 'READER_PERMISSION_ROLLBACK_COMPLETED' -and $r.objectsChanged -eq 1 -and $f.state.sets -eq ($before+1));Check (Test-H004PermissionDaclEqual $f.state.entries['object-00'].sddl $f.state.saved.objects[0].before)}
$taskBefore='D:(A;ID;0x001f019f;;;BA)(A;ID;0x001f019f;;;SY)(A;ID;0x001f01ff;;;BA)(A;;FR;;;SY)'
$taskAfter='D:(A;;FR;;;'+$sid+')(A;ID;0x001f019f;;;BA)(A;ID;0x001f019f;;;SY)(A;ID;0x001f01ff;;;BA)(A;;FR;;;SY)'
$taskReadback='D:AI(A;;FR;;;'+$sid+')(A;;FR;;;SY)(A;ID;0x001f019f;;;BA)(A;ID;0x001f019f;;;SY)(A;ID;0x001f01ff;;;BA)'
function TaskServiceFixtureReadback([string]$Text){
  # Simulated service contract, based on observed task9 ACE index order0,4,1,2,3.
  # No Task Service write/registration is performed by these fixtures.
  $d=[Security.AccessControl.RawSecurityDescriptor]::new($Text);$acl=[Security.AccessControl.RawAcl]::new($d.DiscretionaryAcl.Revision,$d.DiscretionaryAcl.Count)
  foreach($group in @($false,$true)){foreach($ace in $d.DiscretionaryAcl){if((([int]$ace.AceFlags -band 16) -ne 0) -eq $group){$acl.InsertAce($acl.Count,$ace)}}}
  $d.DiscretionaryAcl=$acl;$d.SetFlags([Security.AccessControl.ControlFlags]([int]$d.ControlFlags -bor 1024));return $d.GetSddlForm([Security.AccessControl.AccessControlSections]::Access)
}
function TaskFixture {$f=Fixture;foreach($s in $f.spec){if($s.kind -ceq 'task'){$f.state.entries[$s.key].sddl=$taskBefore}};$f.state.taskService=$true;return $f}
function ObservedTaskPartial {
  $f=TaskFixture;$f.state.fault='set-then-throw';$null=Run $f;$f.state.fault='task-then-throw';$r=Run $f 'Resume'
  Check ($r.objectsAttempted -eq 8 -and $r.objectsChanged -eq 7 -and $r.failedObjectNumber -eq 9)
  $f.state.fault='none';return $f
}
Case 'observed-task-stable-partition-is-accepted-only-for-task-kind' {
  Check (Test-H004PermissionDaclEqual $taskReadback $taskAfter 'task')
  Check (-not (Test-H004PermissionDaclEqual $taskReadback $taskAfter));Check (-not (Test-H004PermissionDaclEqual $taskReadback $taskAfter 'directory'))
}
Case 'task-comparison-preserves-explicit-and-inherited-within-group-order' {
  $explicit='D:AI(A;;FR;;;SY)(A;;FR;;;'+$sid+')(A;ID;0x001f019f;;;BA)(A;ID;0x001f019f;;;SY)(A;ID;0x001f01ff;;;BA)'
  $inherited='D:AI(A;;FR;;;'+$sid+')(A;;FR;;;SY)(A;ID;0x001f019f;;;SY)(A;ID;0x001f019f;;;BA)(A;ID;0x001f01ff;;;BA)'
  Check (-not (Test-H004PermissionDaclEqual $explicit $taskAfter 'task'));Check (-not (Test-H004PermissionDaclEqual $inherited $taskAfter 'task'))
}
Case 'task-comparison-does-not-tolerate-new-masks-flags-or-extra-entries' {
  foreach($other in @($taskReadback.Replace('FR;;;'+$sid,'FA;;;'+$sid),$taskReadback.Replace('(A;;FR;;;SY)','(A;CI;FR;;;SY)'),($taskReadback+'(A;;FR;;;BU)'))){Check (-not (Test-H004PermissionDaclEqual $other $taskAfter 'task'))}
  foreach($flag in @(256,4096)){Check (-not (Test-H004PermissionDaclEqual (WithControlFlag $taskReadback $flag) $taskAfter 'task'))}
}
Case 'deny-and-object-acls-stay-strict-only-even-on-tasks' {
  foreach($ace in @('(D;;FR;;;BU)','(OA;;FR;00112233-4455-6677-8899-aabbccddeeff;;BU)')){
    $old='D:(A;ID;FA;;;SY)'+$ace;$moved='D:AI'+$ace+'(A;ID;FA;;;SY)'
    Check (Test-H004PermissionDaclEqual $old $old 'task');Check (-not (Test-H004PermissionDaclEqual $moved $old 'task'))
  }
}
Case 'unsupported-callback-descriptor-stops-without-entering-order-tolerance' {
  $old='D:(A;ID;FA;;;SY)(XA;;FR;;;BU)';$moved='D:AI(XA;;FR;;;BU)(A;ID;FA;;;SY)';$blocked=$false
  try{$blocked=-not (Test-H004PermissionDaclEqual $moved $old 'task')}catch{$blocked=$_.Exception.Message -ceq 'UNSAFE_DACL'};Check $blocked
}
Case 'acl-byte-comparison-includes-revision-and-count' {
  $a=[Security.AccessControl.RawAcl]::new(2,1);$e=[Security.AccessControl.RawAcl]::new(4,1);$ace=[Security.AccessControl.CommonAce]::new([Security.AccessControl.AceFlags]::None,[Security.AccessControl.AceQualifier]::AccessAllowed,1179785,[Security.Principal.SecurityIdentifier]::new($sid),$false,$null)
  $a.InsertAce(0,$ace);$e.InsertAce(0,$ace);Check (-not (Test-H004PermissionAclBytes $a $e));$e=[Security.AccessControl.RawAcl]::new(2,2);$e.InsertAce(0,$ace);$e.InsertAce(1,$ace);Check (-not (Test-H004PermissionAclBytes $a $e))
}
Case 'observed-eight-files-and-first-task-after-status-remains-partial' {$f=ObservedTaskPartial;$before=$f.state.sets;$r=Run $f 'Status';Check ($r.status -eq 'PARTIAL_SETUP_REVIEW_REQUIRED' -and $f.state.sets -eq $before)}
Case 'resume-finishes-only-remaining-ten-tasks-and-retains-legacy-snapshot' {
  $f=ObservedTaskPartial;$saved=$f.state.saved|ConvertTo-Json -Depth 12 -Compress;$completed=$f.state.entries['object-08'].sddl;$before=$f.state.sets;$r=Run $f 'Resume'
  Check ($r.status -eq 'READ_PERMISSIONS_RESUMED_NATIVE_ACCEPTANCE_PENDING' -and $r.objectsChanged -eq 10 -and $r.objectsAttempted -eq 10 -and $f.state.sets -eq ($before+10));Check ($f.state.entries['object-08'].sddl -ceq $completed)
  Check (($f.state.saved|ConvertTo-Json -Depth 12 -Compress) -ceq $saved -and $f.state.saves -eq 1);$r=Run $f 'Status';Check ($r.status -eq 'READ_PERMISSIONS_PRESENT_NATIVE_ACCEPTANCE_PENDING')
  $before=$f.state.sets;$r=Run $f 'Resume';Check ($r.objectsChanged -eq 0 -and $f.state.sets -eq $before)
}
Case 'task-roundtrip-apply-and-rollback-retain-before-rights-with-idempotent-status' {
  $f=TaskFixture;$r=Run $f;Check ($r.status -eq 'READ_PERMISSIONS_APPLIED_NATIVE_ACCEPTANCE_PENDING' -and $r.objectsChanged -eq 19);$r=Run $f 'Rollback';Check ($r.status -eq 'READER_PERMISSION_ROLLBACK_COMPLETED' -and $r.objectsChanged -eq 19)
  foreach($s in $f.spec){Check (Test-H004PermissionDaclEqual $f.state.entries[$s.key].sddl $f.state.saved.objects[[array]::IndexOf($f.spec,$s)].before $s.kind)}
  $r=Run $f 'Status';Check ($r.status -eq 'READ_PERMISSIONS_NOT_APPLIED');$before=$f.state.sets;$r=Run $f 'Rollback';Check ($r.objectsChanged -eq 0 -and $f.state.sets -eq $before)
}
Case 'task-partial-rollback-only-reverts-nine-completed-objects' {$f=ObservedTaskPartial;$r=Run $f 'Rollback';Check ($r.status -eq 'READER_PERMISSION_ROLLBACK_COMPLETED' -and $r.objectsChanged -eq 9)}
Case 'foreign-task-edit-at-remaining-object-is-detected-after-quiet' {$f=ObservedTaskPartial;$f.state.fault='foreign-during-task-quiet';$before=$f.state.sets;$r=Run $f 'Resume';Check ($r.errorCode -eq 'FOREIGN_PERMISSION_CHANGE' -and $f.state.sets -eq $before)}
Case 'foreign-last-task-edit-stops-resume-before-any-write' {$f=ObservedTaskPartial;$f.state.entries['object-18'].sddl+='(A;;FR;;;BU)';$before=$f.state.sets;$r=Run $f 'Resume';Check ($r.errorCode -eq 'FOREIGN_PERMISSION_CHANGE' -and $f.state.sets -eq $before)}
Case 'result-history-preserves-original-reports-and-records-each-attempt' {
  $root=Join-Path ([IO.Path]::GetTempPath()) ('h004-permission-'+[guid]::NewGuid().ToString('N'))
  try{
    [void][IO.Directory]::CreateDirectory($root);$old=Join-Path $root 'resume-result.json';[IO.File]::WriteAllText($old,'ORIGINAL_FAILURE');[IO.File]::WriteAllText((Join-Path $root 'before.json'),'PRIVATE_SNAPSHOT')
    $a=[pscustomobject]@{status='FIRST_FIXTURE'};Write-H004PermissionResult $root 'Resume' $a;Check ($a.setupReportFile -eq 'resume-result-002.json');$b=[pscustomobject]@{status='SECOND_FIXTURE'};Write-H004PermissionResult $root 'Resume' $b;Check ($b.setupReportFile -eq 'resume-result-003.json')
    Check ([IO.File]::ReadAllText($old) -ceq 'ORIGINAL_FAILURE');Check ([IO.File]::ReadAllText((Join-Path $root 'before.json')) -ceq 'PRIVATE_SNAPSHOT')
    Check (([IO.File]::ReadAllText((Join-Path $root $a.setupReportFile))|ConvertFrom-Json).status -ceq 'FIRST_FIXTURE');Check (([IO.File]::ReadAllText((Join-Path $root $b.setupReportFile))|ConvertFrom-Json).status -ceq 'SECOND_FIXTURE')
    foreach($n in 4..32){[IO.File]::WriteAllText((Join-Path $root ('resume-result-{0:000}.json' -f $n)),'RETAIN')};$stopped=$false;try{Write-H004PermissionResult $root 'Resume' ([pscustomobject]@{status='NO_SPACE'})}catch{$stopped=$_.Exception.Message -ceq 'RESULT_HISTORY_FULL'};Check $stopped
  }finally{
    $resolved=[IO.Path]::GetFullPath($root);$bound=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if($resolved.StartsWith($bound,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -like 'h004-permission-*'){Remove-Item -LiteralPath $resolved -Recurse -Force}
  }
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
Case 'native-inherited-file-without-ai-reproduces-windows-ai-readback' {
  Initialize-H004PermissionHandles
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
public static class Hourly004LegacyAclFixtureV1 {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool SetFileSecurity(string path, uint info, byte[] descriptor);
  public static void Seed(string path, string text) {
    var d=new RawSecurityDescriptor(text);var bytes=new byte[d.BinaryLength];d.GetBinaryForm(bytes,0);
    if(!SetFileSecurity(path,4,bytes))throw new Win32Exception(Marshal.GetLastWin32Error());
  }
}
'@
  $root=Join-Path ([IO.Path]::GetTempPath()) ('h004-permission-'+[guid]::NewGuid().ToString('N'));$h=$null
  try{
    [void][IO.Directory]::CreateDirectory($root);$file=Join-Path $root 'synthetic-receipt.json';[IO.File]::WriteAllText($file,'SYNTHETIC')
    $h=[Hourly004PermissionHandleV1]::new($file,$true);$original=$h.Read();$seed=[Security.AccessControl.RawSecurityDescriptor]::new($original)
    $seed.SetFlags([Security.AccessControl.ControlFlags]([int]$seed.ControlFlags -band (-bnot 1024)))
    [Hourly004LegacyAclFixtureV1]::Seed($file,$seed.GetSddlForm([Security.AccessControl.AccessControlSections]::Access))
    $before=$h.Read();$identity=$h.Identity
    Check (([int]([Security.AccessControl.RawSecurityDescriptor]::new($before)).ControlFlags -band 1024) -eq 0)
    $wanted=Add-H004PermissionRules $before $sid @(@{mask=1179785;flags=0});$h.Write($wanted);$actual=$h.Read()
    Check ((Normalize-H004PermissionDacl $actual) -cne (Normalize-H004PermissionDacl $wanted))
    Check (([int]([Security.AccessControl.RawSecurityDescriptor]::new($actual)).ControlFlags -bxor [int]([Security.AccessControl.RawSecurityDescriptor]::new($wanted)).ControlFlags) -eq 1024)
    Check (Test-H004PermissionDaclEqual $actual $wanted);Check ($h.Identity -ceq $identity)
    $h.Write($before);Check (Test-H004PermissionDaclEqual $h.Read() $before)
  }finally{
    if($null -ne $h){$h.Dispose()}
    $resolved=[IO.Path]::GetFullPath($root);$bound=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if($resolved.StartsWith($bound,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -like 'h004-permission-*'){Remove-Item -LiteralPath $resolved -Recurse -Force}
  }
}
[pscustomobject]@{simulation=$true;nativePowerShell=$PSVersionTable.PSVersion.ToString();passed=$passed.Count;failed=$failed.Count;failures=$failed;productionPermissionWrites=0;taskRuns=0;sqlQueries=0;runtimePolicyChanges=0}|ConvertTo-Json -Depth 5 -Compress
if($failed.Count){exit 1}
