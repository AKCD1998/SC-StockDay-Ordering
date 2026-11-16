param([Parameter(Mandatory=$true)][string]$Setup)
$ErrorActionPreference='Stop'
. $Setup
$passed=@();$failed=@();$sid='S-1-5-21-111-222-333-1001';$base='O:BAG:SYD:PAI(A;;FA;;;SY)(A;;FA;;;BA)'
function Check([bool]$Value){$script:assertion++;if(-not$Value){throw 'FIXTURE_ASSERTION'}}
function Case([string]$Name,[scriptblock]$Body){$script:assertion=0;try{&$Body;$script:passed+=,$Name}catch{$script:failed+=@{case=$Name;check=$script:assertion;line=$_.InvocationInfo.ScriptLineNumber;type=$_.Exception.GetType().Name}}}
function Fixture([string]$Fault='none'){
 $state=@{fault=$Fault;before=$null;identity='1:2:3';acl=$base;writes=0;saves=0;preserves=0;preflights=0;quiets=0}
 $provider=@{
  Preflight={$state.preflights++;if($state.fault -ceq 'busy'){Stop-H004Root 'BUSY_EXISTING_WORK'}}.GetNewClosure()
  Quiet={$state.quiets++;if($state.fault -ceq 'late-foreign'){$state.acl='O:BAG:SYD:PAI(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;BU)'};if($state.fault -ceq 'late-identity'){$state.identity='4:5:6'}}.GetNewClosure()
  Get={return @{identity=$state.identity;sddl=$state.acl}}.GetNewClosure()
  Load={return $state.before}.GetNewClosure()
  Save={param($record);$state.saves++;if($state.fault -ceq 'backup-fail'){Stop-H004Root 'BACKUP_WRITE_UNVERIFIED'};$state.before=($record|ConvertTo-Json -Depth 8 -Compress)|ConvertFrom-Json}.GetNewClosure()
  Set={param($value);$state.writes++;if($state.fault -ceq 'denied'){throw [UnauthorizedAccessException]::new('PRIVATE_SHOULD_NEVER_APPEAR')};$state.acl=$value;if($state.fault -ceq 'write-then-error'){throw [IO.IOException]::new('PRIVATE_SHOULD_NEVER_APPEAR')};if($state.fault -ceq 'readback-extra'){$state.acl+='(A;;FR;;;BU)'}}.GetNewClosure()
  Preserve={$state.preserves++;if($state.fault -ceq 'preserve-fail'){Stop-H004Root 'PRESERVATION_UNVERIFIED'}}.GetNewClosure()
 }
 return @{state=$state;provider=$provider}
}
function Run($f,[string]$Mode='Apply',[bool]$Approved=$true){Invoke-H004RootEngine $Mode $Approved $sid $f.provider}
Case 'plan-writes-nothing' {$f=Fixture;$r=Run $f 'Plan';Check ($r.status -ceq 'ROOT_READ_PLAN_READY');Check ($f.state.saves -eq 0 -and $f.state.writes -eq 0)}
Case 'apply-requires-current-scope-approval' {$f=Fixture;$r=Run $f 'Apply' $false;Check ($r.errorCode -ceq 'EXPLICIT_ROOT_READ_APPROVAL_REQUIRED');Check ($f.state.preflights -eq 0 -and $f.state.writes -eq 0)}
Case 'rollback-requires-scope-approval' {$f=Fixture;$r=Run $f 'Rollback' $false;Check ($r.errorCode -ceq 'EXPLICIT_ROOT_READ_APPROVAL_REQUIRED');Check ($f.state.writes -eq 0)}
Case 'busy-stops-before-backup-and-write' {$f=Fixture 'busy';$r=Run $f;Check ($r.errorCode -ceq 'BUSY_EXISTING_WORK');Check ($f.state.saves -eq 0 -and $f.state.writes -eq 0)}
Case 'durable-backup-failure-prevents-root-write' {$f=Fixture 'backup-fail';$r=Run $f;Check ($r.errorCode -ceq 'BACKUP_WRITE_UNVERIFIED');Check ($f.state.writes -eq 0 -and -not$r.permissionWriteAttempted)}
Case 'approved-apply-adds-only129-and-keeps-acceptance-pending' {$f=Fixture;$r=Run $f;Check ($r.status -ceq 'ROOT_READ_APPLIED_NATIVE_ACCEPTANCE_PENDING');Check ($f.state.saves -eq 1 -and $f.state.writes -eq 1);Check ($r.addedReadMask -eq 129 -and $r.permissionChangeVerified);Check ($r.nativeReadAcceptance -ceq 'NOT_PERFORMED');Check (-not$r.cloudScheduleChanged -and -not$r.guardBudgetChanged -and -not$r.uploadRecoveryChanged)}
Case 'repeat-apply-is-idempotent-no-new-baseline' {$f=Fixture;$null=Run $f;$before=$f.state.before|ConvertTo-Json -Compress;$r=Run $f;Check ($r.status -ceq 'ROOT_READ_ALREADY_PRESENT_NATIVE_ACCEPTANCE_PENDING');Check ($f.state.writes -eq 1 -and $f.state.saves -eq 1);Check (($f.state.before|ConvertTo-Json -Compress) -ceq $before)}
Case 'status-is-readonly' {$f=Fixture;$null=Run $f;$writes=$f.state.writes;$r=Run $f 'Status';Check ($r.status -ceq 'ROOT_READ_PRESENT_NATIVE_ACCEPTANCE_PENDING');Check ($f.state.writes -eq $writes)}
Case 'rollback-restores-only-owned-root-difference' {$f=Fixture;$null=Run $f;$r=Run $f 'Rollback';Check ($r.status -ceq 'ROOT_READ_ROLLBACK_COMPLETE');Check (Test-H004RootDescriptor $f.state.acl $base);Check ($f.state.writes -eq 2)}
Case 'repeat-rollback-is-idempotent' {$f=Fixture;$null=Run $f;$null=Run $f 'Rollback';$r=Run $f 'Rollback';Check ($r.status -ceq 'ROOT_READ_ROLLBACK_ALREADY_COMPLETE' -and $f.state.writes -eq 2)}
Case 'missing-backup-rollback-never-guesses' {$f=Fixture;$r=Run $f 'Rollback';Check ($r.errorCode -ceq 'NO_ROOT_BACKUP');Check ($f.state.writes -eq 0)}
Case 'snapshot-tampering-cannot-add-rights' {$f=Fixture;$null=Run $f;$f.state.before.after='O:BAG:SYD:P(A;;FA;;;WD)';$r=Run $f 'Rollback';Check ($r.errorCode -ceq 'ROOT_BACKUP_UNVERIFIED');Check ($f.state.writes -eq 1)}
Case 'snapshot-path-or-user-tampering-is-rejected' {foreach($field in @('path','sid')){$f=Fixture;$null=Run $f;$f.state.before.$field='foreign';$r=Run $f 'Rollback';Check ($r.errorCode -ceq 'ROOT_BACKUP_UNVERIFIED');Check ($f.state.writes -eq 1)}}
Case 'foreign-acl-preserved-before-rollback' {$f=Fixture;$null=Run $f;$f.state.acl+='(A;;FR;;;BU)';$r=Run $f 'Rollback';Check ($r.errorCode -ceq 'FOREIGN_ROOT_PERMISSION_CHANGE');Check ($f.state.writes -eq 1 -and $f.state.acl.EndsWith('(A;;FR;;;BU)'))}
Case 'foreign-root-identity-preserved' {$f=Fixture;$null=Run $f;$f.state.identity='9:9:9';$r=Run $f 'Rollback';Check ($r.errorCode -ceq 'ROOT_OBJECT_IDENTITY_CHANGED');Check ($f.state.writes -eq 1)}
Case 'late-foreign-during-quiet-is-not-overwritten' {$f=Fixture 'late-foreign';$r=Run $f;Check ($r.errorCode -ceq 'FOREIGN_ROOT_PERMISSION_CHANGE');Check ($f.state.writes -eq 0)}
Case 'late-replacement-during-quiet-is-not-overwritten' {$f=Fixture 'late-identity';$r=Run $f;Check ($r.errorCode -ceq 'ROOT_OBJECT_IDENTITY_CHANGED');Check ($f.state.writes -eq 0)}
Case 'write-then-error-reports-uncertain-not-no-change' {$f=Fixture 'write-then-error';$r=Run $f;Check ($r.permissionWriteAttempted -and -not$r.permissionChangeVerified);Check ($r.mutationOutcome -ceq 'UNKNOWN_REVIEW_REQUIRED');Check (($r|ConvertTo-Json) -notmatch 'PRIVATE_SHOULD_NEVER_APPEAR');$f.state.fault='none';$r=Run $f 'Status';Check ($r.status -ceq 'ROOT_READ_PRESENT_NATIVE_ACCEPTANCE_PENDING');Check ($f.state.writes -eq 1)}
Case 'access-denied-keeps-code-and-does-not-retry' {$f=Fixture 'denied';$r=Run $f;Check ($r.nativeErrorCode -eq 5);Check ($f.state.writes -eq 1 -and $r.permissionWriteAttempted -and $r.mutationOutcome -ceq 'UNKNOWN_REVIEW_REQUIRED');Check (($r|ConvertTo-Json) -notmatch 'PRIVATE_SHOULD_NEVER_APPEAR')}
Case 'readback-change-is-not-accepted-or-auto-rolled-back' {$f=Fixture 'readback-extra';$r=Run $f;Check ($r.errorCode -ceq 'ROOT_PERMISSION_READBACK_DIFFER');Check ($f.state.writes -eq 1 -and -not$r.permissionChangeVerified)}
Case 'preservation-failure-cannot-claim-pass' {$f=Fixture 'preserve-fail';$r=Run $f;Check ($r.status -ceq 'STOPPED_REVIEW_REQUIRED' -and $r.errorCode -ceq 'PRESERVATION_UNVERIFIED');Check ($r.permissionChangeVerified -and $null -eq $r.fullSyncAndHourlyDefinitionsUnchanged)}
Case 'before-backup-survives-error-and-can-be-rolled-back' {$f=Fixture 'write-then-error';$null=Run $f;$f.state.fault='none';$r=Run $f 'Rollback';Check ($r.status -ceq 'ROOT_READ_ROLLBACK_COMPLETE');Check ($f.state.saves -eq 1 -and $f.state.writes -eq 2)}
Case 'preexisting-reader-grant-is-not-removed' {$f=Fixture;$f.state.acl='O:BAG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;'+$sid+')';$pre=$f.state.acl;$r=Run $f;Check ($r.status -ceq 'ROOT_READ_ALREADY_PRESENT_NATIVE_ACCEPTANCE_PENDING');Check ($f.state.writes -eq 0 -and $f.state.saves -eq 0);Check ($f.state.acl -ceq $pre)}
Case 'partial-existing-reader-grant-adds-only-missing-bit' {$p=New-H004RootPlan ('O:BAG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x1;;;'+$sid+')') $sid;Check ($p.addedMask -eq 128);$d=Convert-H004RootDescriptor $p.after;Check ($d.DiscretionaryAcl[3].AccessMask -eq 128 -and $d.DiscretionaryAcl[3].AceFlags -eq 0)}
Case 'preexisting-owner-group-foreign-inherited-aces-preserved' {
 $b='O:BAG:SYD:AI(A;;FA;;;SY)(A;ID;FR;;;BU)';$p=New-H004RootPlan $b $sid;$d=Convert-H004RootDescriptor $p.after;$old=Convert-H004RootDescriptor $b
 Check ($d.Owner.Value -ceq $old.Owner.Value -and $d.Group.Value -ceq $old.Group.Value -and $d.ControlFlags -eq $old.ControlFlags);Check ($d.DiscretionaryAcl.Count -eq 3 -and $d.DiscretionaryAcl[1].AccessMask -eq 129 -and $d.DiscretionaryAcl[1].AceFlags -eq 0)
 foreach($pair in @(@(0,0),@(1,2))){$a=New-Object byte[] $old.DiscretionaryAcl[$pair[0]].BinaryLength;$old.DiscretionaryAcl[$pair[0]].GetBinaryForm($a,0);$c=New-Object byte[] $d.DiscretionaryAcl[$pair[1]].BinaryLength;$d.DiscretionaryAcl[$pair[1]].GetBinaryForm($c,0);Check ([Linq.Enumerable]::SequenceEqual([byte[]]$a,[byte[]]$c))}
}
Case 'deny-or-null-dacl-requires-review' {foreach($b in @('O:BAG:SYD:P(D;;FR;;;BU)(A;;FA;;;SY)','O:BAG:SY')){$stop=$false;try{$null=New-H004RootPlan $b $sid}catch{$stop=$_.Exception.Message -cin @('ROOT_ACE_FORM_REVIEW_REQUIRED','UNSAFE_ROOT_DACL')};Check $stop}}
Case 'only-ai-control-bit-normalization-is-tolerated' {$v=Convert-H004RootDescriptor $base;foreach($flag in @(256,4096)){$v.SetFlags([Security.AccessControl.ControlFlags]([int](Convert-H004RootDescriptor $base).ControlFlags -bxor $flag));Check (-not(Test-H004RootDescriptor ($v.GetSddlForm([Security.AccessControl.AccessControlSections]14)) $base))}}
Case 'memory-supervisor-runs-harmless-fixture-once-without-forging-host' {
 $fixture=@'
param([string]$Action,[switch]$ApproveReadScope,[switch]$OwnedChild)
[pscustomobject]@{schemaVersion='hourly004-task-root-read-result-v1';action=$Action;status='FIXTURE_ONLY';approved=[bool]$ApproveReadScope;owned=[bool]$OwnedChild;permissionWriteAttempted=$false}|ConvertTo-Json -Compress
'@
 $v=Invoke-H004RootSupervised $fixture 'Apply' $true
 Check ($v.status -ceq 'FIXTURE_ONLY' -and $v.approved -and $v.owned -and $v.ownedChildClosed);Check ($v.ownerDeadlineMs -eq 60000 -and -not$v.permissionWriteAttempted)
}
Case 'pasted-scriptblock-captures-own-source-and-retains-helper-visibility' {
 $fixture=@'
param([string]$Action,[switch]$ApproveReadScope,[switch]$OwnedChild)
if($OwnedChild){[pscustomobject]@{schemaVersion='hourly004-task-root-read-result-v1';action=$Action;status='MEMORY_FIXTURE_ONLY';approved=[bool]$ApproveReadScope;owned=[bool]$OwnedChild;permissionWriteAttempted=$false}|ConvertTo-Json -Compress}
else{Invoke-H004RootSupervised $MyInvocation.MyCommand.ScriptBlock.ToString() $Action ([bool]$ApproveReadScope)}
'@
 $v=&([scriptblock]::Create($fixture)) -Action Apply -ApproveReadScope
 Check ($v.status -ceq 'MEMORY_FIXTURE_ONLY' -and $v.approved -and $v.owned -and $v.ownedChildClosed)
}
Case 'malformed-child-output-is-unknown-and-private-text-suppressed' {
 $v=Invoke-H004RootSupervised '"PRIVATE_SHOULD_NEVER_APPEAR"' 'Status' $false
 Check ($v.status -ceq 'OWNER_OPERATION_UNAVAILABLE_REVIEW_REQUIRED' -and $null -eq $v.permissionWriteAttempted);Check (($v|ConvertTo-Json -Depth 5) -notmatch 'PRIVATE_SHOULD_NEVER_APPEAR')
}
Case 'owned-job-deadline-kills-only-its-child-tree' {
 Initialize-H004RootSupervisor
 $code=@'
$gate=[Threading.EventWaitHandle]::OpenExisting($env:H004_ROOT_OWNER_GATE,[Security.AccessControl.EventWaitHandleRights]::Synchronize)
try{if(-not$gate.WaitOne(15000)){exit 91}}finally{$gate.Dispose()}
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe';$start.Arguments='-NoProfile -NonInteractive -Command "Start-Sleep -Seconds 60"';$start.UseShellExecute=$false;$start.CreateNoWindow=$true
$grand=[Diagnostics.Process]::Start($start);[Console]::Out.WriteLine($grand.Id);Start-Sleep -Seconds 60
'@
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe';$start.Arguments='-NoProfile -NonInteractive -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code));$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $watch=[Diagnostics.Stopwatch]::StartNew();$outcome=[H004RootOwnerJobV1]::Run($start,2000)
 Check ($outcome.TimedOut -and $outcome.ChildClosed -and $outcome.GateReleased -and $watch.ElapsedMilliseconds -lt 10000)
 $grandId=0;Check ([int]::TryParse($outcome.Output.Trim(),[ref]$grandId));$stillRunning=$false
 try{$ownedGrand=[Diagnostics.Process]::GetProcessById($grandId);try{$stillRunning=(-not$ownedGrand.WaitForExit(2000))}finally{$ownedGrand.Dispose()}}catch [ArgumentException]{}
 Check (-not$stillRunning)
}
Case 'persistence-failure-retains-real-operation-outcome-and-warns' {
 function Write-H004RootSafeResult {param($Directory,$Result);throw [IO.IOException]::new('PRIVATE_SHOULD_NEVER_APPEAR')}
 $r=[pscustomobject]@{status='ROOT_READ_APPLIED_NATIVE_ACCEPTANCE_PENDING';permissionWriteAttempted=$true;permissionChangeVerified=$true;mutationOutcome='VERIFIED'}
 $v=Complete-H004RootResult 'fixture-only' $r
 Check ($v.permissionWriteAttempted -and $v.permissionChangeVerified -and $v.mutationOutcome -ceq 'VERIFIED');Check (-not$v.resultPersisted -and $v.resultPersistence -ceq 'UNAVAILABLE_KEEP_WINDOW_OPEN');Check (($v|ConvertTo-Json) -notmatch 'PRIVATE_SHOULD_NEVER_APPEAR')
}
Case 'create-only-backup-and-result-history-preserve-older-records' {
 $dir=Join-Path ([IO.Path]::GetTempPath()) ('h004-root-fixture-'+[Guid]::NewGuid().ToString('N'))
 try{
  [void][IO.Directory]::CreateDirectory($dir);$file=Join-Path $dir 'before.json';Write-H004RootCreateOnly $file 'original';$blocked=$false
  try{Write-H004RootCreateOnly $file 'overwrite'}catch{$blocked=$_.Exception.Message -ceq 'BACKUP_WRITE_UNVERIFIED'};Check ($blocked -and [IO.File]::ReadAllText($file) -ceq 'original')
  # The real private-directory gate must reject this normal user-readable fixture.
  $rejected=$false;try{Assert-H004RootPrivateDirectory $dir}catch{$rejected=$_.Exception.Message -ceq 'PRIVATE_BACKUP_UNVERIFIED'};Check $rejected
  # Isolate only the private-directory gate for result-allocation fixtures.
  function Assert-H004RootPrivateDirectory {param($Path);if($Path -cne $dir){throw 'FIXTURE_PATH'}}
  $a=[pscustomobject]@{status='first'};Write-H004RootSafeResult $dir $a
  $b=[pscustomobject]@{status='second'};Write-H004RootSafeResult $dir $b
  Check (([IO.File]::ReadAllText((Join-Path $dir 'result-001.json'))|ConvertFrom-Json).status -ceq 'first');Check (([IO.File]::ReadAllText((Join-Path $dir 'result-002.json'))|ConvertFrom-Json).status -ceq 'second')
 }finally{$absolute=[IO.Path]::GetFullPath($dir);if(-not$absolute.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $absolute -Leaf) -notlike 'h004-root-fixture-*'){throw 'FIXTURE_CLEANUP_SCOPE'};if([IO.Directory]::Exists($absolute)){Remove-Item -LiteralPath $absolute -Recurse -Force}}
}
Case 'native-adapter-target-only-apply-rollback-keeps-child-dacl-and-root-owner' {
 Initialize-H004RootHandle
 $dir=Join-Path ([IO.Path]::GetTempPath()) ('h004-root-fixture-'+[Guid]::NewGuid().ToString('N'));$held=$null
 try{
  [void][IO.Directory]::CreateDirectory($dir);$child=Join-Path $dir 'child';[void][IO.Directory]::CreateDirectory($child);[IO.File]::WriteAllText((Join-Path $child 'leaf.txt'),'fixture')
  $acl=[IO.Directory]::GetAccessControl($dir);$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),[Security.AccessControl.FileSystemRights]::ReadAndExecute,([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow));[IO.Directory]::SetAccessControl($dir,$acl)
  $childBefore=[IO.Directory]::GetAccessControl($child).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]14);$leafBefore=[IO.File]::GetAccessControl((Join-Path $child 'leaf.txt')).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]14)
  $held=[H004TaskRootHandleV1]::new($dir,$true);$before=$held.Read();$plan=New-H004RootPlan $before $sid;$held.Write($plan.after);Check (Test-H004RootDescriptor $held.Read() $plan.after)
  Check ([IO.Directory]::GetAccessControl($child).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]14) -ceq $childBefore);Check ([IO.File]::GetAccessControl((Join-Path $child 'leaf.txt')).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]14) -ceq $leafBefore)
  $held.Write($before);Check (Test-H004RootDescriptor $held.Read() $before);Check ([IO.Directory]::GetAccessControl($child).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]14) -ceq $childBefore);Check ([IO.File]::GetAccessControl((Join-Path $child 'leaf.txt')).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]14) -ceq $leafBefore)
  $held.Dispose();$held=$null
  $held=[H004TaskRootHandleV1]::new($dir,$false);$blocked=$false;try{$held.Write($plan.after)}catch{$blocked=$true};Check $blocked
 }finally{if($null -ne $held){$held.Dispose()};$absolute=[IO.Path]::GetFullPath($dir);$tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath());if(-not$absolute.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $absolute -Leaf) -notlike 'h004-root-fixture-*'){throw 'FIXTURE_CLEANUP_SCOPE'};if([IO.Directory]::Exists($absolute)){Remove-Item -LiteralPath $absolute -Recurse -Force}}
}
[pscustomobject]@{simulation=$true;powerShell=$PSVersionTable.PSVersion.ToString();passed=$passed.Count;failed=$failed.Count;failures=$failed;cases=$passed;productionPermissionWrites=0;nativeAdapterTest='disposable local fixture only';taskRuns=0;sourceSqlQueries=0}|ConvertTo-Json -Depth 5 -Compress
if($failed.Count -gt 0){exit 1}
