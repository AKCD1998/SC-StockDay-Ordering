param([Parameter(Mandatory=$true)][string]$FixtureRoot)
$ErrorActionPreference='Stop'
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
$resolved=[IO.Path]::GetFullPath($FixtureRoot)
if(-not $resolved.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'hourly-controller-*'){throw 'FIXTURE_ROOT_REQUIRED'}
. (Join-Path $resolved 'package\hourly004-update.ps1')
$script:HourlyApp=Join-Path $resolved 'app'
$script:HourlySecure=Join-Path $resolved 'secure'
$script:HourlyCache=Join-Path $resolved 'cache'
$script:HourlyNode=(Get-Command node.exe -ErrorAction Stop).Source
$script:FixtureCorruptAfterSwitch=$false
$script:FixtureTaskStartedAt='2026-10-24T07:00:00.000Z'
$script:FixtureNow='2026-10-24T08:03:00.000Z'
function Get-HourlyStatusNow {return $script:FixtureNow}
function Get-HourlyUpdateHost {return @{Name='SERVER004';Zone='SE Asia Standard Time';Admin=$true}}
function Get-HourlyUpdateSchedule {foreach($i in 0..12){[pscustomobject]@{Kind=$(if($i -lt 2){'full'}else{'hourly'});Enabled=$true;Running=$false;NextMinutes=120;LastMinutes=120;DefinitionVerified=$true}}}
function Get-HourlyUpdateProcesses {return @()}
function Get-HourlyUpdateCpu {[pscustomobject]@{PercentProcessorTime=5}}
function Get-HourlyTaskAttemptInfo {return @{verified=$true;startedAt=$script:FixtureTaskStartedAt;running=$false}}
function Get-HourlyProtectedTaskDefinitions {
  $taskXml='fixture-task-definition'
  if($script:FixtureCorruptAfterSwitch -and $script:FixtureLastPhase -eq 'before-postflight'){$taskXml='fixture-changed-task-definition'}
  return @{fixture=@{Xml=$taskXml;Sddl='fixture-task-security'}}
}
$passed=0
$report=[ordered]@{simulation=$true;nativePowerShell=$PSVersionTable.PSVersion.ToString();productionQueries=0;productionFilesChanged=0;taskRuns=0;realControllerInvoked=$true;fixtureProviderSubstitutions=@('host','task-scheduler','process-provider','cpu-provider');cases=@()}
function Invoke-FixtureAction([string]$RequestedAction,[bool]$Approved=$true){$Action=$RequestedAction;$ReleaseApproved=$Approved;Invoke-HourlyUpdateController -OnPhase {param($phase);$script:FixtureLastPhase=$phase}}
try {
  $baseline=Get-HourlyDefinitionSnapshot
  Assert-HourlyUpdate ((Get-HourlyInstalledState) -eq 'stability-candidate-installed') 'FIXTURE_INITIAL_STATE'
  $preflight=Invoke-FixtureAction 'Preflight'
  Assert-HourlyUpdate ($preflight.status -eq 'preflight-passed') 'FIXTURE_PREFLIGHT'
  $passed++;$report.cases+='Preflight-real-controller'
  $denied=$false;try{$null=Invoke-FixtureAction 'Update' $false}catch{$denied=$_.Exception.Message -eq 'RELEASE_APPROVAL_REQUIRED'}
  Assert-HourlyUpdate $denied 'FIXTURE_APPROVAL_GATE';$passed++;$report.cases+='Update-approval-required'
  $updated=Invoke-FixtureAction 'Update'
  Assert-HourlyUpdate ($updated.installation -eq 'checkpoint-v4-installed') 'FIXTURE_UPDATE'
  Assert-HourlyDefinitionsEqual $baseline (Get-HourlyDefinitionSnapshot)
  $passed++;$report.cases+='Update-stages-verifies-and-switches'
  $status=Invoke-FixtureAction 'Status'
  Assert-HourlyUpdate ($status.availability -eq 'unknown' -and $status.latestAttempt.status -eq 'unknown' -and $status.lastSuccess.slot -eq '14:00') 'FIXTURE_STATUS_FALSE_SUCCESS'
  $passed++;$report.cases+='Status-new-runtime-does-not-relabel-old-success'
  $repeat=Invoke-FixtureAction 'Update'
  Assert-HourlyUpdate ($repeat.installation -eq 'checkpoint-v4-installed') 'FIXTURE_IDEMPOTENT_UPDATE';$passed++;$report.cases+='Update-idempotent'
  # This helper imports only the status store and writes synthetic receipt
  # metadata. It never imports/calls the protected runtime or a SQL runner.
  $seedOutput=@(& $script:HourlyNode (Join-Path $resolved 'seed-receipt.mjs') $script:HourlySecure)
  Assert-HourlyUpdate ($LASTEXITCODE -eq 0) 'FIXTURE_RECEIPT_SEED'
  $script:FixtureTaskStartedAt='2026-10-24T08:00:00.000Z'
  $receiptFiles=@((Join-Path $script:HourlySecure 'latest-slot-result.json.receipt-0.json'),(Join-Path $script:HourlySecure 'latest-slot-result.json.receipt-1.json'))
  $receiptBytes=@{};foreach($receiptFile in $receiptFiles){$receiptBytes[$receiptFile]=[IO.File]::ReadAllBytes($receiptFile)}
  $status=Invoke-FixtureAction 'Status'
  Assert-HourlyUpdate ($status.availability -eq 'published' -and $status.lastSuccess.slot -eq '15:00') 'FIXTURE_STATUS_RECEIPT'
  $passed++;$report.cases+='Status-validates-final-publication-and-durable-receipt'
  [IO.File]::WriteAllText((Join-Path $script:HourlySecure 'latest-slot-result.json'),'{incomplete fixture view')
  $status=Invoke-FixtureAction 'Status'
  Assert-HourlyUpdate ($status.latestAttempt.status -eq 'unknown' -and $status.lastSuccess.slot -eq '15:00' -and $null -eq $status.latestAttempt.observedProducts) 'FIXTURE_STATUS_CORRUPT_VIEW'
  $passed++;$report.cases+='Status-unreadable-view-unknown-with-prior-success'
  $rolled=Invoke-FixtureAction 'Rollback'
  Assert-HourlyUpdate ($rolled.installation -eq 'stability-candidate-installed' -and $rolled.lastSuccess.slot -eq '15:00') 'FIXTURE_ROLLBACK'
  foreach($receiptFile in $receiptFiles){Assert-HourlyUpdate (Test-HourlyBytes $receiptBytes[$receiptFile] ([IO.File]::ReadAllBytes($receiptFile))) 'FIXTURE_RECEIPT_CHANGED'}
  Assert-HourlyDefinitionsEqual $baseline (Get-HourlyDefinitionSnapshot)
  $passed++;$report.cases+='Rollback-restores-v1-and-preserves-receipts-config-tasks-permissions'
  $legacyModule=Join-Path $script:HourlySecure ($script:HourlyPreviousReleaseName+'\marker.txt')
  $legacyBytes=[IO.File]::ReadAllBytes($legacyModule)
  [IO.File]::WriteAllText($legacyModule,'foreign fixture modification')
  $blocked=$false;try{$null=Invoke-FixtureAction 'Preflight'}catch{$blocked=$_.Exception.Message -eq 'INSTALLED_BASELINE_REQUIRES_REVIEW'}
  Assert-HourlyUpdate $blocked 'FIXTURE_PREDECESSOR_CHANGE';[IO.File]::WriteAllBytes($legacyModule,$legacyBytes)
  $passed++;$report.cases+='Preflight-rejects-modified-predecessor'
  # A separate untouched copy exercises activation failure through the entire
  # controller, not just its transaction helper.
  $oldSecure=$script:HourlySecure;$script:HourlySecure=Join-Path $resolved 'fault-secure'
  $faultBaseline=Get-HourlyDefinitionSnapshot
  $script:FixtureCorruptAfterSwitch=$true;$failed=$false
  try{$null=Invoke-FixtureAction 'Update'}catch{$failed=$true}
  $script:FixtureCorruptAfterSwitch=$false
  Assert-HourlyUpdate ($failed -and (Get-HourlyInstalledState) -eq 'stability-candidate-installed') 'FIXTURE_ACTIVATION_ROLLBACK'
  Assert-HourlyDefinitionsEqual $faultBaseline (Get-HourlyDefinitionSnapshot)
  $passed++;$report.cases+='Update-postflight-failure-restores-only-owned-pointer'
  $script:HourlySecure=$oldSecure
  Assert-HourlyUpdate (-not(Test-Path -LiteralPath (Join-Path $resolved 'capture-entry-executed'))) 'FIXTURE_PRODUCTION_ENTRY_INVOKED'
  $report.passed=$passed;$report.failed=0;$report.status='passed'
} catch {
  $report.passed=$passed;$report.status='failed';$report.failed=1
  $known=@('FIXTURE_INITIAL_STATE','FIXTURE_PREFLIGHT','FIXTURE_APPROVAL_GATE','FIXTURE_UPDATE','FIXTURE_STATUS_FALSE_SUCCESS','FIXTURE_IDEMPOTENT_UPDATE','FIXTURE_RECEIPT_SEED','FIXTURE_STATUS_RECEIPT','FIXTURE_STATUS_CORRUPT_VIEW','FIXTURE_ROLLBACK','FIXTURE_RECEIPT_CHANGED','FIXTURE_PREDECESSOR_CHANGE','FIXTURE_ACTIVATION_ROLLBACK','FIXTURE_PRODUCTION_ENTRY_INVOKED','INSTALLED_BASELINE_REQUIRES_REVIEW','RELEASE_INTEGRITY_FAILED','TASK_DEFINITION_OR_PERMISSIONS_CHANGED','PROTECTED_STATE_CHANGED','PROTECTED_PERMISSIONS_CHANGED')
  $known+=@('PREDECESSOR_CHANGED','PREDECESSOR_PIN_REQUIRED','TRANSACTION_RENAME_REFUSED','TRANSACTION_FILE_BUSY','TRANSACTION_FILE_UNAVAILABLE','ACTIVATION_VERIFY_FAILED','ROLLBACK_VERIFY_FAILED','ROLLBACK_REFUSED_FOREIGN_CHANGE')
  $exception=$_.Exception;$reason=$null;while($null -ne $exception){if($exception.Message -in $known){$reason=$exception.Message};$exception=$exception.InnerException}
  $report.reason=if($null -ne $reason){$reason}else{'FIXTURE_UNAVAILABLE_DETAILS_WITHHELD'}
  $report.failureLine=$_.InvocationInfo.ScriptLineNumber
  $report.phase=$script:FixtureLastPhase
  $report.imageChecks=@{};foreach($key in @('PathIdentity','ObjectIdentity','Bytes','Permissions')){if($_.Exception.Data.Contains($key)){$report.imageChecks[$key]=[bool]$_.Exception.Data[$key]}}
  $report.failureType=$_.Exception.GetType().Name
}
$report|ConvertTo-Json -Depth 6 -Compress
if($report.failed){exit 1}
