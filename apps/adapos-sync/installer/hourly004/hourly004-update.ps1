param(
  [ValidateSet('Preflight','Update','Status','Rollback')][string]$Action='Status',
  [switch]$ReleaseApproved
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
# A parent PowerShell 7 process can pass its module search path to a native
# Windows PowerShell child. Load the built-in 5.1 ACL provider by its own path;
# no machine environment, credentials or module installation is changed.
if($PSVersionTable.PSEdition -eq 'Desktop'){Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop}
$script:HourlyApp='C:\Users\Administrator\Desktop\RxAuu\apps\adapos-sync'
$script:HourlySecure='C:\ProgramData\SC-StockDay-Ordering\hourly-stock-evidence-004\complete-on-20261022'
$script:HourlyCache=Split-Path $script:HourlySecure -Parent

function Stop-HourlyUpdate([string]$Code) {throw [InvalidOperationException]::new($Code)}
function Assert-HourlyUpdate([bool]$Condition,[string]$Code) {if(-not $Condition){Stop-HourlyUpdate $Code}}
function Test-HourlyBytes([byte[]]$A,[byte[]]$B) {
  if($A.Length -ne $B.Length){return $false};for($i=0;$i -lt $A.Length;$i++){if($A[$i] -ne $B[$i]){return $false}};return $true
}
function Assert-HourlyRegular([string]$File) {
  $item=Get-Item -LiteralPath $File -ErrorAction Stop
  Assert-HourlyUpdate (-not $item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) 'PATH_TYPE_UNEXPECTED'
}
function Get-HourlyDefinitionSnapshot {
  $files=@((Join-Path $script:HourlyApp '.env'),(Join-Path $script:HourlyApp 'package-lock.json'))
  $files+=@(Get-ChildItem -LiteralPath (Join-Path $script:HourlyApp 'src') -File -Recurse | ForEach-Object {$_.FullName})
  $files+=@(Get-ChildItem -LiteralPath $script:HourlySecure -Filter 'approved-cohort-*.json' -File | ForEach-Object {$_.FullName})
  $bytes=@{};$acl=@{}
  foreach($file in $files){Assert-HourlyRegular $file;$bytes[$file]=[IO.File]::ReadAllBytes($file);$acl[$file]=(Get-Acl -LiteralPath $file).Sddl}
  foreach($file in @($script:HourlySecure,(Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'),(Join-Path $script:HourlySecure 'runtime-core.mjs'),(Join-Path $script:HourlySecure 'runtime-guard.ps1'))){$acl[$file]=(Get-Acl -LiteralPath $file).Sddl}
  $service=New-Object -ComObject Schedule.Service
  try{
    $service.Connect();$folder=$service.GetFolder('\');$tasks=@{}
    foreach($task in @($folder.GetTasks(1))){if($task.Name -match '^(AdaPOS|Hourly Stock|Transfer)'){$tasks[$task.Name]=@{Xml=$task.Xml;Sddl=$task.GetSecurityDescriptor(7)}}}
    return @{Files=$bytes;Acl=$acl;Tasks=$tasks;Timezone=[TimeZoneInfo]::Local.Id}
  }finally{if($null -ne $service){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($service)}}
}
function Assert-HourlyDefinitionsEqual($Before,$After) {
  Assert-HourlyUpdate ($Before.Timezone -ceq $After.Timezone -and $Before.Files.Count -eq $After.Files.Count -and $Before.Tasks.Count -eq $After.Tasks.Count -and $Before.Acl.Count -eq $After.Acl.Count) 'PROTECTED_STATE_CHANGED'
  foreach($key in $Before.Files.Keys){Assert-HourlyUpdate ($After.Files.ContainsKey($key) -and (Test-HourlyBytes $Before.Files[$key] $After.Files[$key])) 'PROTECTED_STATE_CHANGED'}
  foreach($key in $Before.Acl.Keys){Assert-HourlyUpdate ($Before.Acl[$key] -ceq $After.Acl[$key]) 'PROTECTED_PERMISSIONS_CHANGED'}
  foreach($key in $Before.Tasks.Keys){Assert-HourlyUpdate ($Before.Tasks[$key].Xml -ceq $After.Tasks[$key].Xml -and $Before.Tasks[$key].Sddl -ceq $After.Tasks[$key].Sddl) 'TASK_DEFINITION_OR_PERMISSIONS_CHANGED'}
}
function Get-HourlyInstalledState {
  foreach($name in @('runtime-core.mjs','runtime-guard.ps1')){
    $target=Join-Path $script:HourlySecure $name;$original=Join-Path $PSScriptRoot ('baseline\'+$name)
    Assert-HourlyRegular $target
    if(-not(Test-HourlyBytes ([IO.File]::ReadAllBytes($target)) ([IO.File]::ReadAllBytes($original)))){return 'unrecognized-baseline'}
  }
  $target=Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs';Assert-HourlyRegular $target
  $current=[IO.File]::ReadAllBytes($target)
  if(Test-HourlyBytes $current ([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'baseline\hourly-complete-launcher.mjs')))){return 'original-12-second-guard'}
  if(Test-HourlyBytes $current ([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'runtime\hourly-complete-launcher.mjs')))){return 'stability-candidate-installed'}
  return 'unrecognized-baseline'
}
function Get-HourlyUpdateHost {
  $principal=New-Object Security.Principal.WindowsPrincipal -ArgumentList ([Security.Principal.WindowsIdentity]::GetCurrent())
  return @{Name=[Environment]::MachineName;Zone=[TimeZoneInfo]::Local.Id;Admin=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)}
}
function Get-HourlyUpdateSchedule {
  $service=New-Object -ComObject Schedule.Service
  try{
    $service.Connect();$folder=$service.GetFolder('\');$now=Get-Date
    foreach($period in @('Morning','Evening')){
      $task=$folder.GetTask('AdaPOS Sync (Branch 004) - '+$period)
      [pscustomobject]@{Kind='full';Enabled=$task.Enabled;Running=[int]$task.State -eq 4;NextMinutes=($task.NextRunTime-$now).TotalMinutes;LastMinutes=($now-$task.LastRunTime).TotalMinutes;DefinitionVerified=$true}
    }
    foreach($h in 9..19){
      $task=$folder.GetTask(('Hourly Stock Evidence (Branch 004) - {0:00}00' -f $h))
      [xml]$definition=$task.Xml;$ns=New-Object Xml.XmlNamespaceManager($definition.NameTable);$ns.AddNamespace('t','http://schemas.microsoft.com/windows/2004/02/mit/task')
      $user=$definition.SelectSingleNode('//t:Principal/t:UserId',$ns).InnerText
      $exec=$definition.SelectNodes('//t:Actions/t:Exec',$ns);$verified=$false
      if($exec.Count -eq 1){
        $entry=Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs';$arguments=$exec[0].Arguments.Replace('/','\');$slot=('{0:00}:00' -f $h)
        $verified=$exec[0].Command -ieq 'C:\Program Files\nodejs\node.exe' -and $exec[0].WorkingDirectory -ieq $script:HourlyApp -and ($arguments -ceq ('"'+$entry+'" run '+$slot) -or $arguments -ceq ($entry+' run '+$slot))
      }
      [pscustomobject]@{Kind='hourly';Enabled=$task.Enabled;Running=[int]$task.State -eq 4;NextMinutes=($task.NextRunTime-$now).TotalMinutes;LastMinutes=($now-$task.LastRunTime).TotalMinutes;DefinitionVerified=($verified -and $user -in @('SYSTEM','S-1-5-18') -and $definition.SelectSingleNode('//t:ExecutionTimeLimit',$ns).InnerText -eq 'PT20M')}
    }
  }finally{if($null -ne $service){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($service)}}
}
function Get-HourlyUpdateProcesses {Get-CimInstance Win32_Process -Filter "Name='node.exe'" -OperationTimeoutSec 8}
function Get-HourlyUpdateCpu {Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -OperationTimeoutSec 8}
function Assert-HourlyQuiet {
  $hostInfo=Get-HourlyUpdateHost
  Assert-HourlyUpdate ($hostInfo.Name -ceq 'SERVER004' -and $hostInfo.Zone -ceq 'SE Asia Standard Time') 'HOST_OR_TIMEZONE_MISMATCH'
  Assert-HourlyUpdate $hostInfo.Admin 'EXISTING_ADMIN_REQUIRED'
  foreach($directory in @($script:HourlyApp,$script:HourlySecure)){Assert-HourlyUpdate (-not((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'PATH_TYPE_UNEXPECTED'}
  $tasks=@(Get-HourlyUpdateSchedule)
  Assert-HourlyUpdate (@($tasks|Where-Object {$_.Kind -eq 'full'}).Count -eq 2 -and @($tasks|Where-Object {$_.Kind -eq 'hourly'}).Count -eq 11) 'HOURLY_PRINCIPAL_OR_LIMIT_CHANGED'
  foreach($task in $tasks){
    Assert-HourlyUpdate $task.DefinitionVerified 'HOURLY_PRINCIPAL_OR_LIMIT_CHANGED'
    if($task.Kind -eq 'full'){Assert-HourlyUpdate ($task.Enabled -and -not $task.Running -and $task.NextMinutes -gt 15 -and $task.LastMinutes -gt 15) 'FULL_SYNC_NOT_QUIET'}
    else{Assert-HourlyUpdate ($task.Enabled -and -not $task.Running -and $task.NextMinutes -gt 5) 'HOURLY_NOT_QUIET'}
  }
  foreach($candidate in @(Get-HourlyUpdateProcesses)){
    Assert-HourlyUpdate (-not [string]::IsNullOrWhiteSpace($candidate.CommandLine)) 'PROCESS_IDENTITY_UNREADABLE'
    Assert-HourlyUpdate ($candidate.CommandLine -notmatch 'adapos-sync[\\/]+src[\\/]+(?:index|hourlyStockRunner|deltaShadowRunner)\.js|hourly-complete-launcher\.mjs|hourly-runtime\.mjs') 'EXISTING_AGENT_WORK'
  }
  foreach($name in @('capture.lock','delivery.lock')){Assert-HourlyUpdate (-not(Test-Path -LiteralPath (Join-Path $script:HourlyCache ('hourly-evidence-outbox\004\'+$name)))) 'OUTBOX_LOCK_HELD'}
  Assert-HourlyUpdate (-not(Test-Path -LiteralPath (Join-Path $script:HourlySecure 'guard-child.lock'))) 'GUARD_CHILD_REQUIRES_REVIEW'
  $cpu=@(Get-HourlyUpdateCpu)
  Assert-HourlyUpdate ($cpu.Count -eq 1 -and $null -ne $cpu[0].PercentProcessorTime -and [double]$cpu[0].PercentProcessorTime -ge 0 -and [double]$cpu[0].PercentProcessorTime -lt 70) 'CPU_NOT_VERIFIED_BELOW_70'
}

# The transaction is also exercised in native PS 5.1 fixtures. Its injected
# assertions operate only on fixture files; no production entrypoint is run.
function Initialize-HourlyFileTransactionNative {
  if('Hourly004FileTransactionNative' -as [type]){return}
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Hourly004FileTransactionNative {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool SetFileSecurity(string name, uint information, byte[] descriptor);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool MoveFileEx(string source, string destination, uint flags);
}
'@
}
function Write-HourlyOwnedTransactionFile([string]$Path,[byte[]]$Bytes,$Permissions) {
  $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  # Initialize only this newly created file. Never rewrite the target's ACL or
  # normalize its descriptor to make a comparison pass. Owner/group must also
  # match without changing identity or enabling privileges.
  if((Get-Acl -LiteralPath $Path).Sddl -cne $Permissions.Sddl){
    Assert-HourlyUpdate ([Hourly004FileTransactionNative]::SetFileSecurity($Path,4,$Permissions.GetSecurityDescriptorBinaryForm())) 'ACTIVATION_VERIFY_FAILED'
  }
  Assert-HourlyUpdate ((Get-Acl -LiteralPath $Path).Sddl -ceq $Permissions.Sddl -and (Test-HourlyBytes ([IO.File]::ReadAllBytes($Path)) $Bytes)) 'ACTIVATION_VERIFY_FAILED'
}
function Invoke-HourlyLauncherTransaction([string]$Target,[string]$Candidate,[string]$Backup,[scriptblock]$AssertBefore,[scriptblock]$AssertAfter,[scriptblock]$FaultAfterReplace={}) {
  & $AssertBefore
  Initialize-HourlyFileTransactionNative
  $before=[IO.File]::ReadAllBytes($Target);$next=[IO.File]::ReadAllBytes($Candidate);$permissions=Get-Acl -LiteralPath $Target
  Assert-HourlyUpdate (-not(Test-Path -LiteralPath $Backup)) 'BACKUP_ALREADY_EXISTS'
  $pending=$Target+'.update-pending'
  Assert-HourlyUpdate (-not(Test-Path -LiteralPath $pending)) 'PENDING_UPDATE_REQUIRES_REVIEW'
  Assert-HourlyUpdate ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Target)) -ieq [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Backup))) 'PATH_TYPE_UNEXPECTED'
  $switched=$false
  $pendingOwned=$false
  try{
    Write-HourlyOwnedTransactionFile $Backup $before $permissions
    Assert-HourlyUpdate (-not(Test-Path -LiteralPath $pending)) 'PENDING_UPDATE_REQUIRES_REVIEW'
    Write-HourlyOwnedTransactionFile $pending $next $permissions
    $pendingOwned=$true
    & $AssertBefore
    Assert-HourlyUpdate ((Test-HourlyBytes ([IO.File]::ReadAllBytes($Target)) $before) -and (Get-Acl -LiteralPath $Target).Sddl -ceq $permissions.Sddl) 'ACTIVATION_VERIFY_FAILED'
    # Same-directory rename, replacement + write-through only (no cross-volume
    # copy or delayed reboot). ReplaceFile changes legacy auto-inherit flags.
    Assert-HourlyUpdate ([Hourly004FileTransactionNative]::MoveFileEx($pending,$Target,9)) 'ACTIVATION_VERIFY_FAILED'
    $switched=$true;$pendingOwned=$false
    & $FaultAfterReplace
    Assert-HourlyUpdate ((Test-HourlyBytes ([IO.File]::ReadAllBytes($Target)) $next) -and (Get-Acl -LiteralPath $Target).Sddl -ceq $permissions.Sddl) 'ACTIVATION_VERIFY_FAILED'
    & $AssertAfter
  }catch{
    if($switched){
      Assert-HourlyUpdate ((Test-HourlyBytes ([IO.File]::ReadAllBytes($Target)) $next) -and (Get-Acl -LiteralPath $Target).Sddl -ceq $permissions.Sddl) 'ROLLBACK_REFUSED_FOREIGN_CHANGE'
      Assert-HourlyUpdate ((Test-HourlyBytes ([IO.File]::ReadAllBytes($Backup)) $before) -and (Get-Acl -LiteralPath $Backup).Sddl -ceq $permissions.Sddl) 'ORIGINAL_BACKUP_UNVERIFIED'
      Assert-HourlyUpdate ([Hourly004FileTransactionNative]::MoveFileEx($Backup,$Target,9)) 'ROLLBACK_VERIFY_FAILED'
      Assert-HourlyUpdate ((Test-HourlyBytes ([IO.File]::ReadAllBytes($Target)) $before) -and (Get-Acl -LiteralPath $Target).Sddl -ceq $permissions.Sddl) 'ROLLBACK_VERIFY_FAILED'
    }
    throw
  }finally{if($pendingOwned -and (Test-Path -LiteralPath $pending)){[IO.File]::Delete($pending)}}
}
function Assert-HourlyRelease([string]$Root) {
  $manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release-manifest.json') -Raw | ConvertFrom-Json
  Assert-HourlyUpdate ($manifest.files.Count -gt 10 -and $manifest.files.Count -le 15000) 'RELEASE_MANIFEST_INVALID'
  $rootPath=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\'
  $hasher=[Security.Cryptography.SHA256]::Create()
  try{foreach($entry in $manifest.files){
    Assert-HourlyUpdate ($entry.path -cmatch '^[A-Za-z0-9_@./+\-]+$' -and $entry.path -notmatch '(^|/)\.\.(/|$)|(^|/)\.env($|/)' -and -not [IO.Path]::IsPathRooted($entry.path)) 'RELEASE_MANIFEST_INVALID'
    $file=[IO.Path]::GetFullPath([IO.Path]::Combine($Root,[string]$entry.path))
    Assert-HourlyUpdate ($file.StartsWith($rootPath,[StringComparison]::OrdinalIgnoreCase)) 'RELEASE_MANIFEST_INVALID'
    $actual=Get-HourlyFileIntegrity $file $hasher
    Assert-HourlyUpdate ($actual -ceq $entry.integrity) 'RELEASE_INTEGRITY_FAILED'
  }}finally{$hasher.Dispose()}
  $actualFiles=[IO.Directory]::GetFiles($Root,'*',[IO.SearchOption]::AllDirectories)
  Assert-HourlyUpdate ($actualFiles.Length -eq $manifest.files.Count) 'RELEASE_FILE_SET_CHANGED'
}
function Get-HourlyFileIntegrity([string]$File,$Hasher){
  $attributes=[IO.File]::GetAttributes($File)
  Assert-HourlyUpdate (-not($attributes -band [IO.FileAttributes]::Directory) -and -not($attributes -band [IO.FileAttributes]::ReparsePoint)) 'PATH_TYPE_UNEXPECTED'
  $stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try{return [BitConverter]::ToString($Hasher.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose()}
}
function Assert-HourlyInstalledSource {
  $manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'baseline\installed-source-manifest.json') -Raw | ConvertFrom-Json
  $source=Join-Path $script:HourlyApp 'src'
  $files=@(Get-ChildItem -LiteralPath $source -File -Recurse -Force)
  Assert-HourlyUpdate ($files.Count -eq $manifest.files.Count) 'INSTALLED_SOURCE_REQUIRES_REVIEW'
  $hasher=[Security.Cryptography.SHA256]::Create()
  try{foreach($entry in $manifest.files){
    $file=Join-Path $source $entry.path;Assert-HourlyRegular $file
    Assert-HourlyUpdate ((Get-HourlyFileIntegrity $file $hasher) -ceq $entry.integrity) 'INSTALLED_SOURCE_REQUIRES_REVIEW'
  }}finally{$hasher.Dispose()}
}
function Get-HourlySafeStatus {
  $state=Get-HourlyInstalledState
  $report=[ordered]@{schemaVersion='hourly004-update-status-v1';installation=$state;guardBudgetMs=12000;newRecoveryEnabled=$false;productionEntryInvoked=$false;currentStockCertified=$false}
  $report.stagedReleaseExists=Test-Path -LiteralPath (Join-Path $script:HourlySecure 'stability-20261024')
  $report.originalBackupExists=Test-Path -LiteralPath (Join-Path $script:HourlySecure 'stability-original-launcher.mjs')
  $report.queueNow=@{pending=$null;checkedAt=[datetimeoffset]::Now.ToString('o')}
  try{$folder=Join-Path $script:HourlyCache 'hourly-evidence-outbox\004';$report.queueNow.pending=@(Get-ChildItem -LiteralPath $folder -File | Where-Object {$_.Name -cmatch '^[a-f0-9]{64}\.json$'}).Count}catch{}
  $file=Join-Path $script:HourlySecure 'latest-slot-result.json'
  if(Test-Path -LiteralPath $file){
    $value=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    $status=if($value.status -in @('starting','captured-and-acknowledged','pending-or-incomplete','stopped-no-partial-capture','launch-stopped')){$value.status}else{'unknown'}
    $attempt=[ordered]@{status=$status;slot=$(if($value.slot -match '^(09|1[0-9]):00$'){$value.slot}else{$null});outboxPending=$null;observedProducts=$null;backendAcceptedRecords=$null}
    foreach($key in @('outboxPending','observedProducts','backendAcceptedRecords')){if($null -ne $value.$key -and $value.$key -is [ValueType] -and [double]$value.$key -ge 0 -and [double]$value.$key -le 10000){$attempt[$key]=$value.$key}}
    $report.latestAttempt=$attempt
    $allowedReasons=@('HOURLY_SOURCE_GUARD_UNAVAILABLE','HOURLY_SOURCE_TIMEOUT','HOURLY_SOURCE_ACCESS_DENIED','HOURLY_SOURCE_READ_FAILED','HOURLY_SOURCE_READONLY_BOUNDARY_UNVERIFIED','HOURLY_SOURCE_COHORT_INCOMPLETE','HOURLY_SOURCE_COHORT_CHANGED','HOURLY_COMPLETE_COHORT_WINDOW_EXCEEDED','HOURLY_OBSERVER_CLOCK_STEP_DETECTED','HOURLY_EVIDENCE_BUSY','HOURLY_EVIDENCE_HTTP_ERROR','HOURLY_EVIDENCE_TIMEOUT','HOURLY_EVIDENCE_ACK_INVALID','HOURLY_OUTBOX_CORRUPT','HOURLY_OUTBOX_FULL','HOURLY_DELIVERY_BUDGET_EXHAUSTED','HOURLY_COMPLETE_CONFIG_INVALID','HOST_CPU_AT_OR_ABOVE_70_PERCENT','EXISTING_AGENT_OR_FULL_SYNC_WORK','GUARD_PROCESS_IDENTITY_UNREADABLE','ETIMEOUT','ELOGIN','ESOCKET','ECONNRESET','EACCES','EPERM','HOURLY_OPERATION_FAILED_DETAILS_WITHHELD')
    $report.failureCode=if($value.failure.code -in $allowedReasons){$value.failure.code}elseif($null -ne $value.failure){'HOURLY_OPERATION_FAILED_DETAILS_WITHHELD'}else{$null}
    $guardReasons=@('HOST_UNVERIFIED','IDENTITY_UNVERIFIED','FULL_SYNC_BUSY','PROCESS_UNREADABLE','CPU_UNREADABLE','CPU_LIMIT','PROVIDER_TIMEOUT','ACCESS_DENIED','TASKS_UNAVAILABLE','PROCESSES_UNAVAILABLE','CPU_UNAVAILABLE','PLATFORM_UNAVAILABLE','BUDGET_EXHAUSTED','START_FAILED','DEADLINE','OUTPUT_LIMIT','INVALID_OUTPUT','CHILD_EXIT','READY_UNVERIFIED','CHILD_STILL_RUNNING','GUARD_LEASE_UNVERIFIED')
    $report.guardReason=if($value.failure.guard.reason -in $guardReasons){$value.failure.guard.reason}else{$null}
    $last=$value.lastSuccess
    if($null -eq $last -and $status -eq 'captured-and-acknowledged'){$last=$value}
    $report.lastSuccess=$null
    $stamp=[datetimeoffset]::MinValue
    if($null -ne $last -and $last.observedProducts -eq 6835 -and $last.backendAcceptedRecords -eq 6835 -and [datetimeoffset]::TryParse([string]$last.finishedAt,[ref]$stamp)){
      $age=([datetimeoffset]::Now-$stamp).TotalMinutes
      $report.lastSuccess=@{finishedAt=$stamp.ToString('o');ageMinutes=$(if($age -ge 0){[math]::Floor($age)}else{$null});timestampInFuture=$age -lt 0;observedProducts=6835;backendAcceptedRecords=6835;currentStockCertified=$false}
    }
    $allowedStages=@('launch','powershell-startup','host-identity','task-scheduler','processes','cpu-provider','capture-lock','sql-connect','readonly-boundary','sql-batch','payload','outbox-enqueue','sql-close','delivery-lock','outbox-scan','upload','acknowledgement')
    $report.lastStage=$null
    if($value.diagnostics.events.Count -gt 0){$stage=$value.diagnostics.events[-1];if($stage.stage -in $allowedStages -and $stage.kind -in @('start','success','failure','progress','retry')){$report.lastStage=@{stage=$stage.stage;kind=$stage.kind}}}
  }
  return [pscustomobject]$report
}
function Invoke-HourlyUpdateController {
  if($Action -eq 'Status'){return Get-HourlySafeStatus}
  Assert-HourlyQuiet
  $state=Get-HourlyInstalledState
  Assert-HourlyUpdate ($state -ne 'unrecognized-baseline') 'INSTALLED_BASELINE_REQUIRES_REVIEW'
  Assert-HourlyInstalledSource
  if($Action -eq 'Preflight'){
    Assert-HourlyRelease (Join-Path $PSScriptRoot 'release')
    $null=Get-HourlyDefinitionSnapshot
    return [pscustomobject]@{status='preflight-passed';installation=$state;configurationChanged=$false;taskDefinitionsChanged=$false;productionEntryInvoked=$false;guardBudgetMs=12000;newRecoveryEnabled=$false}
  }
  Assert-HourlyUpdate ([bool]$ReleaseApproved) 'RELEASE_APPROVAL_REQUIRED'
  $lock=Join-Path $script:HourlySecure 'stability-update.lock';$handle=[IO.File]::Open($lock,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{
    $before=Get-HourlyDefinitionSnapshot
    $target=Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'
    if($Action -eq 'Update'){
      if($state -eq 'stability-candidate-installed'){Assert-HourlyRelease (Join-Path $script:HourlySecure 'stability-20261024');return Get-HourlySafeStatus}
      $source=Join-Path $PSScriptRoot 'release';Assert-HourlyRelease $source
      $release=Join-Path $script:HourlySecure 'stability-20261024'
      Assert-HourlyUpdate (-not(Test-Path -LiteralPath $release)) 'EXISTING_RELEASE_REQUIRES_REVIEW'
      $watch=[Diagnostics.Stopwatch]::StartNew()
      $null=New-Item -ItemType Directory -Path $release
      foreach($file in @(Get-ChildItem -LiteralPath $source -File -Recurse -Force)){
        Assert-HourlyUpdate ($watch.Elapsed.TotalSeconds -lt 90) 'STAGING_BUDGET_EXHAUSTED'
        $relative=$file.FullName.Substring($source.Length).TrimStart('\');$destination=Join-Path $release $relative
        $null=New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force
        [IO.File]::Copy($file.FullName,$destination,$false)
      }
      Assert-HourlyRelease $release;Assert-HourlyQuiet
      $candidate=Join-Path $PSScriptRoot 'runtime\hourly-complete-launcher.mjs'
      Invoke-HourlyLauncherTransaction $target $candidate (Join-Path $script:HourlySecure 'stability-original-launcher.mjs') {Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot)} {Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot)}
    }else{
      Assert-HourlyUpdate ($state -eq 'stability-candidate-installed') 'ROLLBACK_REFUSED_NOT_OWN_INSTALLATION'
      $original=Join-Path $script:HourlySecure 'stability-original-launcher.mjs'
      Assert-HourlyUpdate (Test-HourlyBytes ([IO.File]::ReadAllBytes($original)) ([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'baseline\hourly-complete-launcher.mjs')))) 'ORIGINAL_BACKUP_UNVERIFIED'
      Invoke-HourlyLauncherTransaction $target $original (Join-Path $script:HourlySecure ('stability-rollback-'+[guid]::NewGuid().ToString()+'.mjs')) {Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot)} {Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot)}
    }
    return Get-HourlySafeStatus
  }finally{$handle.Dispose();[IO.File]::Delete($lock)}
}
if($MyInvocation.InvocationName -ne '.'){
  try{Invoke-HourlyUpdateController | ConvertTo-Json -Depth 8}
  catch{
    $allowed=@('HOST_OR_TIMEZONE_MISMATCH','EXISTING_ADMIN_REQUIRED','PATH_TYPE_UNEXPECTED','PROTECTED_STATE_CHANGED','PROTECTED_PERMISSIONS_CHANGED','TASK_DEFINITION_OR_PERMISSIONS_CHANGED','FULL_SYNC_NOT_QUIET','HOURLY_NOT_QUIET','HOURLY_PRINCIPAL_OR_LIMIT_CHANGED','PROCESS_IDENTITY_UNREADABLE','EXISTING_AGENT_WORK','OUTBOX_LOCK_HELD','GUARD_CHILD_REQUIRES_REVIEW','CPU_NOT_VERIFIED_BELOW_70','BACKUP_ALREADY_EXISTS','PENDING_UPDATE_REQUIRES_REVIEW','ACTIVATION_VERIFY_FAILED','ROLLBACK_REFUSED_FOREIGN_CHANGE','ROLLBACK_VERIFY_FAILED','RELEASE_MANIFEST_INVALID','RELEASE_INTEGRITY_FAILED','RELEASE_FILE_SET_CHANGED','INSTALLED_BASELINE_REQUIRES_REVIEW','INSTALLED_SOURCE_REQUIRES_REVIEW','RELEASE_APPROVAL_REQUIRED','EXISTING_RELEASE_REQUIRES_REVIEW','STAGING_BUDGET_EXHAUSTED','ROLLBACK_REFUSED_NOT_OWN_INSTALLATION','ORIGINAL_BACKUP_UNVERIFIED')
    $reason=if($_.Exception.Message -in $allowed){$_.Exception.Message}elseif($_.Exception -is [UnauthorizedAccessException]){'ACCESS_DENIED'}elseif($_.Exception -is [IO.FileNotFoundException] -or $_.Exception -is [Management.Automation.ItemNotFoundException]){'PATH_NOT_FOUND'}else{'UPDATE_UNAVAILABLE_DETAILS_WITHHELD'}
    [pscustomobject]@{status='stopped';reason=$reason;detailsWithheld=$true;productionEntryInvoked=$false}|ConvertTo-Json -Compress
    exit 1
  }
}
