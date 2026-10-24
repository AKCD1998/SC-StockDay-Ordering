param([Parameter(Mandatory=$true)][string]$FixtureRoot)
$ErrorActionPreference='Stop'
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\';$resolved=[IO.Path]::GetFullPath($FixtureRoot)
if(-not $resolved.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'hourly-controller-*'){throw 'FIXTURE_ROOT_REQUIRED'}
. (Join-Path $resolved 'package\hourly004-update.ps1')
$script:HourlyApp=Join-Path $resolved 'app';$script:HourlyCache=Join-Path $resolved 'cache';$script:HourlyNode=(Get-Command node.exe).Source
$script:FixtureNow='2026-10-24T08:03:00.000Z';$script:FixtureTask='2026-10-24T08:00:00.000Z';$script:FixtureRunning=$false;$script:FixtureVerified=$true
function Get-HourlyStatusNow {return $script:FixtureNow}
function Get-HourlyUpdateHost {return @{Name='SERVER004';Zone='SE Asia Standard Time';Admin=$true}}
function Get-HourlyUpdateSchedule {foreach($i in 0..12){[pscustomobject]@{Kind=$(if($i -lt 2){'full'}else{'hourly'});Enabled=$true;Running=$false;NextMinutes=120;LastMinutes=120;DefinitionVerified=$true}}}
function Get-HourlyUpdateProcesses {return @()}
function Get-HourlyUpdateCpu {[pscustomobject]@{PercentProcessorTime=5}}
function Get-HourlyTaskAttemptInfo {return @{verified=$script:FixtureVerified;startedAt=$script:FixtureTask;running=$script:FixtureRunning}}
function Get-HourlyProtectedTaskDefinitions {return @{fixture=@{Xml='fixture-task';Sddl='fixture-permissions'}}}
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class HourlyFixtureExternalWriter {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 public static extern bool MoveFileEx(string source,string target,uint flags);
}
'@
$report=[ordered]@{simulation=$true;nativePowerShell=$PSVersionTable.PSVersion.ToString();realControllerInvoked=$true;nativeHandleRenameInvoked=$true;productionQueries=0;productionFilesChanged=0;taskRuns=0;cases=@();failed=0};$passed=0
function Action([string]$RequestedAction,[scriptblock]$Observer={}){$Action=$RequestedAction;$ReleaseApproved=$true;Invoke-HourlyUpdateController -OnPhase $Observer}
function Fresh([string]$Name){$script:HourlySecure=Join-Path $resolved $Name;[IO.Directory]::CreateDirectory($script:HourlySecure)|Out-Null;foreach($entry in [IO.Directory]::GetFileSystemEntries((Join-Path $resolved 'secure'))){Copy-Item -LiteralPath $entry -Destination $script:HourlySecure -Recurse};$script:Target=Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'}
try {
 foreach($direction in @('Update','Rollback')){
  $phases=@('after-preflight','preflight-validated',$(if($direction -eq 'Update'){'staging'}else{'rollback-candidate-validated'}),'before-switch','same-bytes-new-object','before-before-image-move','before-publication','before-postflight','foreign-rename-before-postflight','before-recovery-publication','postflight-failure')
  foreach($faultPhase in $phases){
   $case=$direction+'-'+$faultPhase;Fresh $case
   if($direction -eq 'Rollback'){$null=Action 'Update'}
   $original=[IO.File]::ReadAllBytes($script:Target);$acl=(Get-Acl -LiteralPath $script:Target).Sddl
   $null=Action 'Preflight';$script:Injected=$false;$script:Blocked=$false
   if($faultPhase -eq 'after-preflight'){[IO.File]::WriteAllText($script:Target,'foreign fixture bytes');$script:Injected=$true}
   $observer={param($phase)
    if($faultPhase -eq 'postflight-failure' -and $phase -eq 'before-postflight'){throw 'FIXTURE_POSTFLIGHT_FAILURE'}
    if($faultPhase -eq 'before-recovery-publication' -and $phase -eq 'before-postflight'){throw 'FIXTURE_POSTFLIGHT_FAILURE'}
    if($script:Injected){return}
    if($faultPhase -eq 'same-bytes-new-object' -and $phase -eq 'before-switch'){
      $file=Join-Path $script:HourlySecure 'foreign-object.mjs';[IO.File]::WriteAllBytes($file,$original);[IO.File]::Delete($script:Target);[IO.File]::Move($file,$script:Target);$script:Injected=$true;return
    }
    if($faultPhase -eq 'foreign-rename-before-postflight' -and $phase -eq 'before-postflight'){
      $file=Join-Path $script:HourlySecure 'foreign-object.mjs';[IO.File]::WriteAllText($file,'foreign fixture bytes');$script:Blocked=-not [HourlyFixtureExternalWriter]::MoveFileEx($file,$script:Target,9);$script:Injected=$true;throw 'FIXTURE_POSTFLIGHT_FAILURE'
    }
    if($phase -eq $faultPhase){
      $script:Injected=$true
      try{[IO.File]::WriteAllText($script:Target,'foreign fixture bytes')}catch{$script:Blocked=$true;throw 'FIXTURE_EXTERNAL_WRITE_BLOCKED'}
      if($phase -eq 'before-postflight'){throw 'FIXTURE_POSTFLIGHT_FAILURE'}
    }
   }
   $failed=$false;try{$null=Action $direction $observer}catch{$failed=$true}
   Assert-HourlyUpdate $failed 'FIXTURE_FOREIGN_CHANGE_ACCEPTED'
   if($faultPhase -in @('before-before-image-move','before-postflight','foreign-rename-before-postflight')){
     Assert-HourlyUpdate ($script:Blocked -and (Test-HourlyBytes ([IO.File]::ReadAllBytes($script:Target)) $original)) 'FIXTURE_LOCKED_IMAGE_NOT_PRESERVED'
   }elseif($faultPhase -in @('same-bytes-new-object','postflight-failure')){
     Assert-HourlyUpdate (Test-HourlyBytes ([IO.File]::ReadAllBytes($script:Target)) $original) 'FIXTURE_OWN_RECOVERY_FAILED'
   }else{Assert-HourlyUpdate ([IO.File]::ReadAllText($script:Target) -ceq 'foreign fixture bytes') 'FIXTURE_FOREIGN_CHANGE_OVERWRITTEN'}
   Assert-HourlyUpdate ((Get-Acl -LiteralPath $script:Target).Sddl -ceq $acl) 'FIXTURE_OLD_ACL_CHANGED'
   foreach($backup in @(Get-ChildItem -LiteralPath $script:HourlySecure -File | Where-Object {$_.Name -match 'previous-launcher|rollback-'})){Assert-HourlyUpdate ([IO.File]::ReadAllText($backup.FullName) -cne 'foreign fixture bytes') 'FIXTURE_FOREIGN_BYTES_TRUSTED_AS_BACKUP'}
   $passed++;$report.cases+=$case
  }
 }
 Fresh 'rollback-status'
 $null=Action 'Update';$seed=@(& $script:HourlyNode (Join-Path $resolved 'seed-receipt.mjs') $script:HourlySecure);Assert-HourlyUpdate ($LASTEXITCODE -eq 0) 'FIXTURE_RECEIPT_SEED'
 $v2=Action 'Status';Assert-HourlyUpdate ($v2.latestAttempt.slot -eq '15:00') 'FIXTURE_V2_SLOT'
 $receiptFiles=@(Get-ChildItem -LiteralPath $script:HourlySecure -Filter '*.receipt-*.json' -File);$receiptBytes=@{};foreach($f in $receiptFiles){$receiptBytes[$f.FullName]=[IO.File]::ReadAllBytes($f.FullName)}
 $outbox=Join-Path $script:HourlyCache ('hourly-evidence-outbox\004\'+('b'*64)+'.json');[IO.File]::WriteAllText($outbox,'fixture-unsent-body');$outboxBytes=[IO.File]::ReadAllBytes($outbox)
 $null=Action 'Rollback'
 $statusFile=Join-Path $script:HourlySecure 'latest-slot-result.json'
 $success=[ordered]@{status='captured-and-acknowledged';slot='16:00';inspectionTime='2026-10-24T09:00:12.000Z';finishedAt='2026-10-24T09:02:00.000Z';expectedProducts=6835;observedProducts=6835;readBatchCount=35;backendAcceptedRecords=6835;outboxPending=0}
 [IO.File]::WriteAllText($statusFile,($success|ConvertTo-Json -Compress));$script:FixtureTask='2026-10-24T09:00:02.000Z';$script:FixtureNow='2026-10-24T09:03:00.000Z'
 $status=Action 'Status';Assert-HourlyUpdate ($status.latestAttempt.status -eq 'captured-and-acknowledged' -and $status.latestAttempt.slot -eq '16:00' -and $status.latestAttempt.finishedAt -eq $success.finishedAt -and $status.lastSuccess.slot -eq '16:00' -and $status.latestAttempt.evidenceMode -eq 'legacy-v1') 'FIXTURE_V1_BORROWED_OLD_SLOT'
 $passed++;$report.cases+='Update-result-Rollback-next-v1-success-Status'
 $failure=[ordered]@{status='stopped-no-partial-capture';slot='17:00';inspectionTime='2026-10-24T10:00:12.000Z';finishedAt='2026-10-24T10:00:30.000Z';observedProducts=1400;backendAcceptedRecords=$null;outboxPending=1;lastSuccess=$success}
 [IO.File]::WriteAllText($statusFile,($failure|ConvertTo-Json -Depth 4 -Compress));$script:FixtureTask='2026-10-24T10:00:02.000Z';$script:FixtureNow='2026-10-24T10:03:00.000Z'
 $status=Action 'Status';Assert-HourlyUpdate ($status.latestAttempt.slot -eq '17:00' -and $status.latestAttempt.status -eq 'stopped-no-partial-capture' -and $status.lastSuccess.slot -eq '16:00') 'FIXTURE_V1_FAILURE_MIXED_ATTEMPTS';$passed++;$report.cases+='Rollback-next-v1-failure-Status'
 foreach($variant in @('running','corrupt-view','task-unavailable','stale-view','future-view')){
  $script:FixtureRunning=$false;$script:FixtureVerified=$true;$script:FixtureTask='2026-10-24T10:00:02.000Z';$script:FixtureNow='2026-10-24T10:03:00.000Z';[IO.File]::WriteAllText($statusFile,($failure|ConvertTo-Json -Depth 4 -Compress))
  if($variant -eq 'running'){$script:FixtureRunning=$true}
  if($variant -eq 'corrupt-view'){[IO.File]::WriteAllText($statusFile,'{incomplete view')}
  if($variant -eq 'task-unavailable'){$script:FixtureVerified=$false}
  if($variant -eq 'stale-view'){$script:FixtureTask='2026-10-24T11:00:02.000Z';$script:FixtureNow='2026-10-24T11:03:00.000Z'}
  if($variant -eq 'future-view'){$script:FixtureNow='2026-10-24T09:03:00.000Z'}
  $status=Action 'Status';Assert-HourlyUpdate ($status.latestAttempt.status -eq 'unknown' -and $null -eq $status.latestAttempt.slot -and $null -eq $status.latestAttempt.finishedAt -and $null -eq $status.latestAttempt.observedProducts) 'FIXTURE_UNKNOWN_BORROWED_OLD_EVIDENCE';$passed++;$report.cases+='Rollback-v1-'+$variant+'-unknown'
 }
 foreach($f in $receiptFiles){Assert-HourlyUpdate (Test-HourlyBytes $receiptBytes[$f.FullName] ([IO.File]::ReadAllBytes($f.FullName))) 'FIXTURE_RECEIPT_CHANGED'}
 Assert-HourlyUpdate (Test-HourlyBytes $outboxBytes ([IO.File]::ReadAllBytes($outbox))) 'FIXTURE_OUTBOX_CHANGED'
 Assert-HourlyUpdate (-not [IO.File]::Exists((Join-Path $resolved 'capture-entry-executed'))) 'FIXTURE_CAPTURE_ENTRY_INVOKED'
 $report.status='passed';$report.passed=$passed
} catch {
 $report.status='failed';$report.failed=1;$report.passed=$passed;$report.case=$case;$report.failureLine=$_.InvocationInfo.ScriptLineNumber
 $known=@('FIXTURE_FOREIGN_CHANGE_ACCEPTED','FIXTURE_LOCKED_IMAGE_NOT_PRESERVED','FIXTURE_OWN_RECOVERY_FAILED','FIXTURE_FOREIGN_CHANGE_OVERWRITTEN','FIXTURE_OLD_ACL_CHANGED','FIXTURE_FOREIGN_BYTES_TRUSTED_AS_BACKUP','FIXTURE_RECEIPT_SEED','FIXTURE_V2_SLOT','FIXTURE_V1_BORROWED_OLD_SLOT','FIXTURE_V1_FAILURE_MIXED_ATTEMPTS','FIXTURE_UNKNOWN_BORROWED_OLD_EVIDENCE','FIXTURE_RECEIPT_CHANGED','FIXTURE_OUTBOX_CHANGED','FIXTURE_CAPTURE_ENTRY_INVOKED','PREDECESSOR_CHANGED','TRANSACTION_RENAME_REFUSED')
 $report.reason=if($_.Exception.Message -in $known){$_.Exception.Message}else{'FIXTURE_UNAVAILABLE_DETAILS_WITHHELD'}
}
$report|ConvertTo-Json -Depth 5 -Compress
if($report.failed){exit 1}
