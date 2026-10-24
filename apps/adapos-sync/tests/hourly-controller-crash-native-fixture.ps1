param([Parameter(Mandatory=$true)][string]$FixtureRoot)
$ErrorActionPreference='Stop'
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\';$resolved=[IO.Path]::GetFullPath($FixtureRoot)
if(-not $resolved.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'hourly-controller-*'){throw 'FIXTURE_ROOT_REQUIRED'}
. (Join-Path $resolved 'package\hourly004-update.ps1')
. (Join-Path $PSScriptRoot 'hourly-controller-crash-providers.ps1')
$script:CaseIndex=0;$script:Cases=@();$script:CrashCount=0;$script:OwnChildren=New-Object 'Collections.Generic.List[Diagnostics.Process]'
$report=[ordered]@{simulation=$true;nativePowerShell=$PSVersionTable.PSVersion.ToString();realControllerInvoked=$true;realAbruptChildCrashes=$true;productionFilesChanged=0;productionQueries=0;taskRuns=0;failed=0;passed=0}
function Check([bool]$Condition,[string]$Code){if(-not $Condition){throw [InvalidOperationException]::new($Code)}}
function Action([string]$Name,[scriptblock]$Hook={}){$Action=$Name;$ReleaseApproved=$true;return Invoke-HourlyUpdateController -OnPhase $Hook}
function New-Case([string]$Direction='Update'){
  $script:CaseIndex++;$dir=Join-Path $resolved ('hourly-controller-case-'+$script:CaseIndex)
  $null=New-Item -ItemType Directory -Path $dir
  foreach($name in @('app','secure','cache','package')){Copy-Item -LiteralPath (Join-Path $resolved $name) -Destination (Join-Path $dir $name) -Recurse}
  Set-HourlyCrashFixture $dir
  # The copied package is the very same package used by the killed worker and
  # this newly-started controller. No repair script or replacement logic.
  if($Direction -eq 'Rollback'){$null=Action 'Update'}
  $script:CaseBaseline=Get-HourlyDefinitionSnapshot
  $script:CaseHistory=@{}
  foreach($file in @(Get-ChildItem -LiteralPath $script:HourlySecure -File | Where-Object {$_.Name -like 'latest-slot-result*'})){$script:CaseHistory[$file.FullName]=[IO.File]::ReadAllBytes($file.FullName)}
  $outbox=Join-Path $script:HourlyCache 'hourly-evidence-outbox\004\fixture-retained.bin';[IO.File]::WriteAllText($outbox,'fixture outbox retained');$script:CaseHistory[$outbox]=[IO.File]::ReadAllBytes($outbox)
  return $dir
}
function Start-Crash([string]$Root,[string]$Direction,[string]$Phase,[string]$Fault='', [bool]$Held=$false){
  $start=New-Object Diagnostics.ProcessStartInfo
  $start.FileName=Join-Path $PSHOME 'powershell.exe';$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.Arguments='-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "'+(Join-Path $PSScriptRoot 'hourly-controller-crash-worker.ps1')+'" -FixtureRoot "'+$Root+'" -RequestedAction '+$Direction+' -CrashPhase '+$Phase
  if($Fault){$start.Arguments+=' -FaultCode '+$Fault};if($Held){$start.Arguments+=' -Hold'}
  $process=[Diagnostics.Process]::Start($start);$script:OwnChildren.Add($process)
  if($Held){
    $until=[DateTime]::UtcNow.AddSeconds(20)
    while(-not(Test-Path -LiteralPath (Join-Path $Root 'phase-reached.txt')) -and -not $process.HasExited -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 25}
    Check (-not $process.HasExited -and (Test-Path -LiteralPath (Join-Path $Root 'phase-reached.txt'))) 'FIXTURE_HELD_CHILD_UNAVAILABLE'
    return $process
  }
  Check ($process.WaitForExit(20000)) 'FIXTURE_CHILD_TIMEOUT'
  $script:LastChildReply=$process.StandardOutput.ReadToEnd();$null=$process.StandardError.ReadToEnd()
  Check ($process.ExitCode -ne 0 -and (Test-Path -LiteralPath (Join-Path $Root 'phase-reached.txt'))) 'FIXTURE_CRASH_PHASE_NOT_REACHED'
  if(-not $Fault){$script:CrashCount++};return $null
}
function History-Unchanged {
  Assert-HourlyDefinitionsEqual $script:CaseBaseline (Get-HourlyDefinitionSnapshot)
  foreach($file in $script:CaseHistory.Keys){Check (Test-HourlyBytes $script:CaseHistory[$file] ([IO.File]::ReadAllBytes($file))) 'FIXTURE_HISTORY_CHANGED'}
  Check (-not(Test-Path -LiteralPath (Join-Path $script:CrashFixtureRoot 'capture-entry-executed'))) 'FIXTURE_CAPTURE_INVOKED'
}
function Passed([string]$Name){$script:Cases+=,$Name}
function Recover-Check([string]$Direction){
  $wanted=if($Direction -eq 'Update'){'stability-candidate-installed'}else{'checkpoint-v4-installed'}
  $status=Action 'Status';Check ($status.installationTransaction.state -eq 'recoverable' -and $status.installationTransaction.lockOwner -eq 'orphan-proven') 'FIXTURE_NOT_RECOVERABLE'
  Check ($status.latestAttempt.status -eq 'unknown' -and $null -eq $status.latestAttempt.slot -and $status.lastSuccess.slot -eq '15:00') 'FIXTURE_FALSE_CAPTURE'
  $result=Action 'Recover';Check ((Get-HourlyInstalledState) -eq $wanted -and $result.installation -eq $wanted -and $result.installationTransaction.state -eq 'idle') 'FIXTURE_RECOVERY_WRONG_PREDECESSOR'
  $first=[IO.File]::ReadAllBytes((Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'))
  $null=Action 'Recover';Check (Test-HourlyBytes $first ([IO.File]::ReadAllBytes((Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs')))) 'FIXTURE_REPEAT_RECOVERY_CHANGED'
  History-Unchanged
}
try{
  foreach($direction in @('Update','Rollback')){
    foreach($phase in @('before-transaction-metadata','transaction-metadata-durable','before-publication','before-postflight','transaction-completed')){
      $dir=New-Case $direction;Start-Crash $dir $direction $phase
      $status=Action 'Status'
      if($phase -eq 'before-transaction-metadata'){
        Check ($status.installationTransaction.state -eq 'unverified' -and $status.installation -ne 'launcher-missing') 'FIXTURE_MISSING_METADATA_STATUS'
        $stopped=$false;try{$null=Action 'Recover'}catch{$stopped=$true};Check $stopped 'FIXTURE_UNPROVEN_RECOVERY_ALLOWED';History-Unchanged
      }elseif($phase -eq 'transaction-completed'){
        $wanted=if($direction -eq 'Update'){'checkpoint-v4-installed'}else{'stability-candidate-installed'}
        $result=Action 'Recover';Check ((Get-HourlyInstalledState) -eq $wanted -and $result.installation -eq $wanted -and $result.installationTransaction.state -eq 'idle') 'FIXTURE_COMMITTED_TRANSACTION_REVERSED';History-Unchanged
      }else{Recover-Check $direction}
      Passed ($direction+'-abrupt-'+$phase+'-restart-status-recover-repeat')
    }
    foreach($phase in @('recovery-before-candidate-move','recovery-before-publication','recovery-after-publication')){
      $dir=New-Case $direction;Start-Crash $dir $direction 'before-postflight'
      Start-Crash $dir 'Recover' $phase
      Recover-Check $direction
      Passed ($direction+'-recovery-abrupt-'+$phase+'-resume')
    }
    $dir=New-Case $direction;Start-Crash $dir $direction 'before-publication'
    $target=Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs';[IO.File]::WriteAllText($target,'foreign fixture launcher')
    $status=Action 'Status';Check ($status.installationTransaction.state -eq 'unverified') 'FIXTURE_FOREIGN_STATUS'
    $stopped=$false;try{$null=Action 'Recover'}catch{$stopped=$true};Check ($stopped -and [IO.File]::ReadAllText($target) -ceq 'foreign fixture launcher') 'FIXTURE_FOREIGN_OVERWRITTEN'
    Passed ($direction+'-foreign-before-recovery-preserved')
    $dir=New-Case $direction;Start-Crash $dir $direction 'before-postflight'
    $stopped=$false;try{$null=Action 'Recover' {param($phase);if($phase -eq 'recovery-before-publication'){[IO.File]::WriteAllText((Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'),'foreign during recovery')}}}catch{$stopped=$true}
    Check ($stopped -and [IO.File]::ReadAllText((Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs')) -ceq 'foreign during recovery') 'FIXTURE_RECOVERY_GAP_OVERWRITTEN'
    Passed ($direction+'-foreign-in-recovery-gap-preserved')
  }
  foreach($fault in @('EACCES','ENOSPC','EIO')){
    foreach($direction in @('Update','Rollback')){
      $dir=New-Case $direction;Start-Crash $dir $direction 'before-metadata-write' $fault
      $expected=if($fault -eq 'EACCES'){'ACCESS_DENIED'}elseif($fault -eq 'ENOSPC'){'DISK_FULL'}else{'IO_FAILURE'}
      $reply=$script:LastChildReply|ConvertFrom-Json;Check ($reply.reason -eq $expected) 'FIXTURE_STORAGE_ERROR_CATEGORY'
      History-Unchanged;Passed ($direction+'-metadata-'+$fault+'-no-namespace-change')
      foreach($recoveryPhase in @('before-metadata-write','recovery-before-publication')){
        $dir=New-Case $direction;Start-Crash $dir $direction 'before-postflight'
        $stopped=$false;$reason=$null
        try{$null=Action 'Recover' {param($phase);if($phase -eq $recoveryPhase){if($fault -eq 'EACCES'){throw [UnauthorizedAccessException]::new('INJECTED_FIXTURE_FAILURE')};$hr=if($fault -eq 'ENOSPC'){-2147024784}else{-2147023779};throw [IO.IOException]::new('INJECTED_FIXTURE_FAILURE',$hr)}}}catch{$stopped=$true;$reason=Get-HourlyInstallSafeReason $_}
        Check ($stopped -and $reason -eq $expected) 'FIXTURE_RECOVERY_STORAGE_ERROR_CATEGORY'
        $status=Action 'Status';Check ($status.latestAttempt.status -eq 'unknown') 'FIXTURE_RECOVERY_STORAGE_FALSE_SUCCESS'
        $null=Action 'Recover';History-Unchanged
        Passed ($direction+'-Recover-'+$recoveryPhase+'-'+$fault+'-retains-proof-and-retries-safely')
      }
    }
  }
  $dir=New-Case;Start-Crash $dir 'Update' 'before-publication'
  $metadata=@(Get-ChildItem -LiteralPath $script:HourlySecure -Filter 'installation-transaction-*.json' | Where-Object {$_.Name -cmatch '^installation-transaction-[a-f0-9]{32}\.json$'})[0].FullName
  $held=[IO.File]::Open($metadata,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
  try{$status=Action 'Status';Check ($status.installationTransaction.state -eq 'unverified' -and $status.lastSuccess.slot -eq '15:00') 'FIXTURE_UNREADABLE_METADATA_STATUS';$stopped=$false;try{$null=Action 'Recover'}catch{$stopped=$true};Check $stopped 'FIXTURE_UNREADABLE_METADATA_RECOVERY'}finally{$held.Dispose()}
  Recover-Check 'Update';Passed 'metadata-unreadable-reader-held-preserves-history'
  $dir=New-Case;Start-Crash $dir 'Update' 'before-publication'
  $metadata=@(Get-ChildItem -LiteralPath $script:HourlySecure -Filter 'installation-transaction-*.json' | Where-Object {$_.Name -cmatch '^installation-transaction-[a-f0-9]{32}\.json$'})[0].FullName
  [IO.File]::WriteAllText($metadata,'{"incomplete":')
  $status=Action 'Status';Check ($status.installationTransaction.state -eq 'unverified' -and $status.latestAttempt.status -eq 'unknown') 'FIXTURE_TORN_METADATA_STATUS'
  $stopped=$false;try{$null=Action 'Recover'}catch{$stopped=$true};Check ($stopped -and -not(Test-Path -LiteralPath (Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'))) 'FIXTURE_TORN_METADATA_GUESSED';Passed 'torn-metadata-no-guessed-pointer'
  $dir=New-Case;Start-Crash $dir 'Update' 'before-publication'
  [IO.File]::WriteAllText((Join-Path $script:HourlySecure 'stability-update.lock'),'unknown legacy lock')
  $status=Action 'Status';Check ($status.installationTransaction.lockOwner -eq 'unknown') 'FIXTURE_UNKNOWN_LOCK_STATUS'
  $stopped=$false;try{$null=Action 'Recover'}catch{$stopped=$true};Check ($stopped -and [IO.File]::ReadAllText((Join-Path $script:HourlySecure 'stability-update.lock')) -ceq 'unknown legacy lock') 'FIXTURE_UNKNOWN_LOCK_TAKEN';Passed 'unknown-lock-never-taken'
  $dir=New-Case;$process=Start-Crash $dir 'Update' 'before-publication' '' $true
  try{
    $status=Action 'Status';Check ($status.installationTransaction.lockOwner -eq 'active' -and $status.installationTransaction.state -eq 'updating') 'FIXTURE_ACTIVE_OWNER_STATUS'
    $stopped=$false;try{$null=Action 'Recover'}catch{$stopped=$true};Check ($stopped -and -not $process.HasExited) 'FIXTURE_ACTIVE_OWNER_TAKEN'
  }finally{[IO.File]::WriteAllText((Join-Path $dir 'release-child.txt'),'release fixture child');Check ($process.WaitForExit(10000)) 'FIXTURE_CHILD_RELEASE_FAILED'}
  Recover-Check 'Update';Passed 'active-owner-no-takeover-then-proven-orphan'
  $dir=New-Case;Start-Crash $dir 'Update' 'before-publication'
  $backup=Join-Path $script:HourlySecure $script:HourlyPointerBackup;$oldBytes=[IO.File]::ReadAllBytes($backup);[IO.File]::Move($backup,($backup+'.foreign-moved'));[IO.File]::WriteAllBytes($backup,$oldBytes)
  $stopped=$false;try{$null=Action 'Recover'}catch{$stopped=$true};Check $stopped 'FIXTURE_SAME_BYTES_FOREIGN_ID_ACCEPTED';Passed 'before-image-same-bytes-different-file-identity-rejected'
  $dir=New-Case;Start-Crash $dir 'Update' 'before-publication'
  $backup=Join-Path $script:HourlySecure $script:HourlyPointerBackup;[IO.File]::WriteAllText($backup,'foreign bytes at pinned before-image')
  $stopped=$false;try{$null=Action 'Recover'}catch{$stopped=$true};Check ($stopped -and [IO.File]::ReadAllText($backup) -ceq 'foreign bytes at pinned before-image') 'FIXTURE_FOREIGN_BACKUP_BYTES_ACCEPTED';Passed 'before-image-changed-bytes-rejected-and-preserved'
  $dir=New-Case;Start-Crash $dir 'Update' 'before-publication'
  $lockPath=Join-Path $script:HourlySecure 'stability-update.lock';$lockBytes=[IO.File]::ReadAllBytes($lockPath);[IO.File]::Move($lockPath,($lockPath+'.foreign-moved'));[IO.File]::WriteAllBytes($lockPath,$lockBytes)
  $stopped=$false;try{$null=Action 'Recover'}catch{$stopped=$true};Check ($stopped -and (Test-HourlyBytes $lockBytes ([IO.File]::ReadAllBytes($lockPath)))) 'FIXTURE_FOREIGN_LOCK_OBJECT_TAKEN';Passed 'original-lock-identical-bytes-foreign-object-not-taken'
  $dir=New-Case;Start-Crash $dir 'Update' 'before-publication'
  $stopped=$false
  try{$null=Action 'Recover' {param($phase);if($phase -eq 'recovery-validated'){$meta=@(Get-ChildItem -LiteralPath $script:HourlySecure -Filter 'installation-transaction-*.json' | Where-Object {$_.Name -cmatch '^installation-transaction-[a-f0-9]{32}\.json$'})[0].FullName;$bytes=[IO.File]::ReadAllBytes($meta);[IO.File]::Move($meta,($meta+'.foreign-moved'));[IO.File]::WriteAllBytes($meta,$bytes)}}}catch{$stopped=$true}
  Check ($stopped -and (Test-Path -LiteralPath (Join-Path $script:HourlySecure 'stability-update.lock'))) 'FIXTURE_FOREIGN_METADATA_DURING_RECOVERY_ACCEPTED';Passed 'metadata-replaced-after-validation-no-namespace-change'
  foreach($kind in @('complete','recovered')){
    $dir=New-Case
    if($kind -eq 'complete'){Start-Crash $dir 'Update' 'transaction-completed'}else{Start-Crash $dir 'Update' 'before-postflight';Start-Crash $dir 'Recover' 'recovery-after-publication'}
    $prepared=@(Get-ChildItem -LiteralPath $script:HourlySecure -Filter 'installation-transaction-*.json' | Where-Object {$_.Name -cmatch '^installation-transaction-[a-f0-9]{32}\.json$'})[0].FullName
    $terminal=$prepared.Substring(0,$prepared.Length-5)+'.'+$kind+'.json';[IO.File]::WriteAllText($terminal,'{"incomplete-terminal":')
    $null=Action 'Recover';$null=Action 'Recover'
    Check ((Get-HourlyInstalledState) -eq 'stability-candidate-installed' -and [IO.File]::ReadAllText($terminal) -ceq '{"incomplete-terminal":') 'FIXTURE_TORN_TERMINAL_NOT_PRESERVED';History-Unchanged;Passed ('torn-'+$kind+'-retained-safe-recovery-fresh-terminal')
  }
  foreach($kind in @('missing','foreign')){
    $dir=New-Case;$target=Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'
    [IO.File]::Move($target,($target+'.unproven-history'))
    if($kind -eq 'foreign'){[IO.File]::WriteAllText($target,'unrecognized fixture launcher')}
    $status=Action 'Status';Check ($status.installationTransaction.state -eq 'unverified' -and $status.latestAttempt.status -eq 'unknown' -and $status.lastSuccess.slot -eq '15:00') 'FIXTURE_NO_JOURNAL_STATUS'
    $stopped=$false;try{$null=Action 'Recover'}catch{$stopped=$true};Check $stopped 'FIXTURE_NO_JOURNAL_RECOVERY_GUESSED';Passed ($kind+'-launcher-without-metadata-status-no-guessed-recovery')
  }
  $report.passed=$script:Cases.Count;$report.cases=$script:Cases;$report.abruptChildProcessTerminations=$script:CrashCount;$report.status='passed'
}catch{
  $report.failed=1;$report.status='failed';$report.passed=$script:Cases.Count;$report.lastPassed=if($script:Cases.Count){$script:Cases[-1]}else{$null};$report.caseIndex=$script:CaseIndex;$report.failureLine=$_.InvocationInfo.ScriptLineNumber
  $report.reason=if($_.Exception.Message -cmatch '^[A-Z_]{3,80}$'){$_.Exception.Message}else{Get-HourlyInstallSafeReason $_};$report.failureType=$_.Exception.GetType().Name
  $report.failureScript=[IO.Path]::GetFileName($_.InvocationInfo.ScriptName)
}finally{
  foreach($child in $script:OwnChildren){if(-not $child.HasExited){$release=Join-Path $script:CrashFixtureRoot 'release-child.txt';[IO.File]::WriteAllText($release,'fixture cleanup');[void]$child.WaitForExit(1000)};$child.Dispose()}
}
$report|ConvertTo-Json -Depth 6 -Compress
if($report.failed){exit 1}
