param([ValidateSet('Preflight','Status')][string]$Mode='Status')
Set-StrictMode -Version 2
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

# This file is supplied to the already-authorized SERVER004 local executor.
# It creates no scheduled task, service, credential, file, observer or stock read.
# Native device authorization must be established OUTSIDE this script. A local
# Windows identity or a field in this JSON cannot grant cloud access.
$script:H004Evidence='C:\ProgramData\SC-StockDay-Ordering\hourly-stock-evidence-004\complete-on-20261022'
$script:H004Queue='C:\ProgramData\SC-StockDay-Ordering\hourly-stock-evidence-004\hourly-evidence-outbox\004'
$script:H004App='C:\Users\Administrator\Desktop\RxAuu\apps\adapos-sync'
$script:H004Pointer=@'
// The existing Task action and principal remain unchanged. Only this pointer
// switches after a complete offline release is staged and verified.
import { main } from './stability-20261028-cpu-v5/installer/hourly004/runtime/hourly-runtime.mjs';
import {safeHourlyFailureCode} from './stability-20261028-cpu-v5/src/hourlyAttemptDiagnostics.js';
import {safeStorageFailure} from './stability-20261028-cpu-v5/src/hourlyStatusStore.js';
main().catch(error=>{
  console.log(JSON.stringify({status:'launch-stopped',failure:{code:safeHourlyFailureCode(error),...(error.storageFailure?{storageFailure:safeStorageFailure({code:error.storageFailure.code},error.storageFailure.stage)}:{})},detailsWithheld:true}));
  process.exitCode=1;
  if(error.hourlyDisplayIoPending===true)process.exit(1);
});
'@
function H004Prop($Object,[string]$Name){if($Object -is [Collections.IDictionary]){if($Object.Contains($Name)){return $Object[$Name]};return $null};if($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]){return $Object.$Name};return $null}
function H004Number($Value){if($null -ne $Value -and $Value -is [ValueType] -and $Value -isnot [bool]){try{$n=[double]$Value;if(-not [double]::IsNaN($n) -and -not [double]::IsInfinity($n) -and $n -ge 0){return $Value}}catch{}};return $null}
function H004Integer($Value){$n=H004Number $Value;if($null -ne $n -and [math]::Floor([double]$n) -eq [double]$n -and [double]$n -le 9007199254740991){return $n};return $null}
function H004Time($Value){if($Value -isnot [string] -or $Value -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$'){return $null};try{return [DateTimeOffset]::Parse($Value,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None)}catch{return $null}}
function H004Stop([string]$Code){throw [InvalidOperationException]::new($Code)}
function H004SafeError($Record){
  $codes=@('WRONG_EXECUTION_HOST','WRONG_EXISTING_IDENTITY','WRONG_TIMEZONE','NATIVE_PS51_REQUIRED','PATH_UNVERIFIED','FILE_TOO_LARGE','INVALID_JSON','RECEIPT_UNVERIFIED','RECEIPT_CONFLICT','READ_DEADLINE','TASK_SET_UNVERIFIED','QUEUE_SCAN_LIMIT','READ_BOUNDARY_UNVERIFIED')
  if($Record.Exception.Message -cin $codes){return $Record.Exception.Message}
  $e=$Record.Exception;for($i=0;$i -lt 4 -and $null -ne $e;$i++){
    if($e -is [UnauthorizedAccessException] -or $e.HResult -eq -2147024891){return 'ACCESS_DENIED'}
    if($e -is [IO.FileNotFoundException] -or $e -is [IO.DirectoryNotFoundException]){return 'NOT_FOUND'}
    if($e -is [TimeoutException]){return 'TIMEOUT'}
    $e=$e.InnerException
  };if([string]$Record.FullyQualifiedErrorId -cmatch '^(PathNotFound|ItemNotFound)(,|$)'){return 'NOT_FOUND'};return 'READ_UNAVAILABLE'
}
function H004AssertPath([string]$Path){
  $p=[IO.Path]::GetFullPath($Path)
  if($p.StartsWith('\\')){H004Stop 'PATH_UNVERIFIED'}
  while($p){$i=Get-Item -LiteralPath $p -Force -ErrorAction Stop;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){H004Stop 'PATH_UNVERIFIED'};$parent=Split-Path $p -Parent;if($parent -eq $p){break};$p=$parent}
}
function H004ReadBytes([string]$Path,[int]$Maximum){
  H004AssertPath $Path;$item=Get-Item -LiteralPath $Path -Force
  if($item.PSIsContainer -or $item.Length -gt $Maximum){H004Stop 'FILE_TOO_LARGE'}
  $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
  try{if($stream.Length -gt $Maximum){H004Stop 'FILE_TOO_LARGE'};$bytes=New-Object byte[] ([int]$stream.Length);$at=0;while($at -lt $bytes.Length){$read=$stream.Read($bytes,$at,$bytes.Length-$at);if($read -eq 0){H004Stop 'READ_BOUNDARY_UNVERIFIED'};$at+=$read};return ,$bytes}finally{$stream.Dispose()}
}
function H004ReadKnown([string]$Name){
  $files=@{status=@('latest-slot-result.json',262144);receipt0=@('latest-slot-result.json.receipt-0.json',8192);receipt1=@('latest-slot-result.json.receipt-1.json',8192);pointer=@('hourly-complete-launcher.mjs',4096)}
  if(-not $files.ContainsKey($Name)){H004Stop 'PATH_UNVERIFIED'}
  return ,(H004ReadBytes (Join-Path $script:H004Evidence $files[$Name][0]) $files[$Name][1])
}
function H004Json([byte[]]$Bytes){try{return [Text.Encoding]::UTF8.GetString($Bytes)|ConvertFrom-Json -ErrorAction Stop}catch{H004Stop 'INVALID_JSON'}}
function H004Receipt([byte[]]$Bytes){
  $e=H004Json $Bytes;$body=H004Prop $e 'body';$digest=H004Prop $e 'digest'
  if((H004Prop $e 'schemaVersion') -cne 'hourly004-durable-state-v2' -or $body -isnot [string] -or $digest -isnot [string]){H004Stop 'RECEIPT_UNVERIFIED'}
  $b=[Text.Encoding]::UTF8.GetBytes($body);if($b.Length -gt 8192){H004Stop 'RECEIPT_UNVERIFIED'}
  $hash=[Security.Cryptography.SHA256]::Create();try{$actual=([BitConverter]::ToString($hash.ComputeHash($b))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
  if($actual -cne $digest){H004Stop 'RECEIPT_UNVERIFIED'}
  $s=H004Json $b;$a=H004Prop $s 'attempt'
  if($null -eq (H004Integer (H004Prop $s 'generation')) -or $s.generation -lt 1 -or $null -eq (H004Integer (H004Prop $a 'sequence')) -or $a.sequence -lt 1 -or $a.slot -cnotmatch '^(09|1[0-9]):00$' -or $null -eq (H004Time $a.startedAt) -or $a.phase -cnotin @('running','finished')){H004Stop 'RECEIPT_UNVERIFIED'}
  if($a.phase -ceq 'finished' -and ($null -eq (H004Time (H004Prop $a 'finishedAt')) -or $null -eq (H004Integer (H004Prop $a 'finalViewSequence')))){H004Stop 'RECEIPT_UNVERIFIED'}
  return @{state=$s;body=$body}
}
function H004GetContext {
  $principal=New-Object Security.Principal.WindowsPrincipal -ArgumentList ([Security.Principal.WindowsIdentity]::GetCurrent())
  [pscustomobject]@{hostName=[Environment]::MachineName;existingIdentityMatched=[Security.Principal.WindowsIdentity]::GetCurrent().Name -ieq 'SERVER004\Administrator';timeZone=[TimeZoneInfo]::Local.Id;edition=$PSVersionTable.PSEdition;major=$PSVersionTable.PSVersion.Major;isAdministrator=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)}
}
function H004TaskProjection($Task,[int]$Hour){
  [xml]$xml=$Task.Xml;$ns=New-Object Xml.XmlNamespaceManager($xml.NameTable);$ns.AddNamespace('t','http://schemas.microsoft.com/windows/2004/02/mit/task')
  $exec=$xml.SelectNodes('//t:Actions/t:Exec',$ns);$principal=$xml.SelectSingleNode('//t:Principal/t:UserId',$ns);$limit=$xml.SelectSingleNode('//t:ExecutionTimeLimit',$ns)
  $slot=('{0:00}:00' -f $Hour);$entry=Join-Path $script:H004Evidence 'hourly-complete-launcher.mjs';$verified=$false
  if($exec.Count -eq 1 -and $null -ne $principal -and $null -ne $limit){$args=$exec[0].Arguments.Replace('/','\');$verified=$exec[0].Command -ieq 'C:\Program Files\nodejs\node.exe' -and $exec[0].WorkingDirectory -ieq $script:H004App -and ($args -ceq ('"'+$entry+'" run '+$slot) -or $args -ceq ($entry+' run '+$slot)) -and $principal.InnerText -in @('S-1-5-18','SYSTEM') -and $limit.InnerText -ceq 'PT20M'}
  $state=[int]$Task.State;$started=$null;if($Task.LastRunTime.Year -ge 2000){$started=([DateTimeOffset]$Task.LastRunTime).ToUniversalTime().ToString('o',[Globalization.CultureInfo]::InvariantCulture)}
  [pscustomobject]@{slot=$slot;enabled=[bool]$Task.Enabled;running=$(if($state -eq 4){$true}elseif($state -eq 3){$false}else{$null});state=$state;startedAt=$started;lastResult=[int64]$Task.LastTaskResult;nextRun=([DateTimeOffset]$Task.NextRunTime).ToString('o',[Globalization.CultureInfo]::InvariantCulture);definitionVerified=[bool]$verified}
}
function H004GetTasks {
  $service=New-Object -ComObject Schedule.Service
  try{$service.Connect();$folder=$service.GetFolder('\');foreach($hour in 9..19){$t=$folder.GetTask(('Hourly Stock Evidence (Branch 004) - {0:00}00' -f $hour));H004TaskProjection $t $hour}}
  finally{if($null -ne $service){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($service)}}
}
function H004GetQueue {
  H004AssertPath $script:H004Queue;$pending=0;$temporary=0;$unknown=0;$count=0;$locks=0
  foreach($path in [IO.Directory]::EnumerateFileSystemEntries($script:H004Queue)){$count++;if($count -gt 512){H004Stop 'QUEUE_SCAN_LIMIT'};$i=Get-Item -LiteralPath $path -Force;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){H004Stop 'PATH_UNVERIFIED'};if($i.PSIsContainer -and $i.Name -cin @('capture.lock','delivery.lock')){$locks++}elseif($i.PSIsContainer){$unknown++}elseif($i.Name -cmatch '^[a-f0-9]{64}\.json$'){$pending++}elseif($i.Name -cmatch '^[a-f0-9]{64}\.json\.[a-f0-9-]+\.tmp$'){$temporary++}else{$unknown++}}
  [pscustomobject]@{known=($unknown -eq 0);pending=$(if($unknown -eq 0){$pending}else{$null});temporary=$temporary;lockDirectoriesPresent=$locks;lockOwnershipVerified=$false;unknownEntries=$unknown}
}
function H004SafeTask($Task){
  $started=H004Time (H004Prop $Task 'startedAt');$next=H004Time (H004Prop $Task 'nextRun');$slot=H004Prop $Task 'slot'
  if($slot -isnot [string] -or $slot -cnotmatch '^(09|1[0-9]):00$'){H004Stop 'TASK_SET_UNVERIFIED'}
  $enabled=H004Prop $Task 'enabled';$running=H004Prop $Task 'running';$verified=H004Prop $Task 'definitionVerified'
  [pscustomobject]@{slot=$slot;enabled=$(if($enabled -is [bool]){$enabled}else{$null});running=$(if($running -is [bool]){$running}else{$null});state=(H004Integer (H004Prop $Task 'state'));startedAt=$(if($null -ne $started){$started.ToUniversalTime().ToString('o')}else{$null});lastResult=(H004Integer (H004Prop $Task 'lastResult'));nextRun=$(if($null -ne $next){$next.ToString('o')}else{$null});definitionVerified=($verified -ceq $true)}
}
function H004SafeGuard($Guard){
  $reasons=@('HOST_UNVERIFIED','IDENTITY_UNVERIFIED','FULL_SYNC_BUSY','PROCESS_UNREADABLE','CPU_UNREADABLE','CPU_LIMIT','PROVIDER_TIMEOUT','ACCESS_DENIED','TASKS_UNAVAILABLE','PROCESSES_UNAVAILABLE','CPU_UNAVAILABLE','PLATFORM_UNAVAILABLE','BUDGET_EXHAUSTED','START_FAILED','DEADLINE','OUTPUT_LIMIT','INVALID_OUTPUT','CHILD_EXIT','READY_UNVERIFIED','CHILD_STILL_RUNNING','GUARD_LEASE_UNVERIFIED')
  $reason=H004Prop $Guard 'reason';$result=[ordered]@{reason=$(if($reason -cin $reasons){$reason}else{$null});providerExceptions=@()}
  $provider=H004Prop $Guard 'providerFailure';$exceptions=@(H004Prop $provider 'exceptions')
  $types=@('System.TimeoutException','System.UnauthorizedAccessException','System.IO.IOException','System.ComponentModel.Win32Exception','System.Management.ManagementException','Microsoft.Management.Infrastructure.CimException','OtherException')
  $safe=foreach($e in @($exceptions|Select-Object -First 4)){$type=H004Prop $e 'type';$hr=H004Prop $e 'hresult';if($type -cin $types -and $hr -is [ValueType] -and $hr -ge -2147483648 -and $hr -le 2147483647){[pscustomobject]@{type=$type;hresult=$hr;nativeErrorCode=(H004Integer (H004Prop $e 'nativeErrorCode'));cimStatusCode=(H004Integer (H004Prop $e 'cimStatusCode'))}}}
  $result.providerExceptions=@($safe);[pscustomobject]$result
}
function H004History($Receipt,[DateTimeOffset]$Now){
  $result=[ordered]@{availability='unknown';records=@();incomplete=$true;coversAllAttempts=$false;maximumEntries=8}
  if($null -eq $Receipt){return [pscustomobject]$result}
  $property=$Receipt.state.PSObject.Properties['recentFailures'];$history=$(if($null -ne $property){,$property.Value}else{$null});if($null -eq $history){$result.availability='not-recorded';return [pscustomobject]$result}
  if($history -isnot [array] -or $history.Count -gt 8){return [pscustomobject]$result}
  $safe=@();$rejected=$false
  foreach($entry in $history){$start=H004Time (H004Prop $entry 'startedAt');$finish=H004Time (H004Prop $entry 'finishedAt');$slot=H004Prop $entry 'slot';$status=H004Prop $entry 'status';$code=H004Prop $entry 'code'
    if($slot -isnot [string] -or $slot -cnotmatch '^(09|1[0-9]):00$' -or $null -eq $start -or $null -eq $finish -or $finish -lt $start -or ($finish-$Now).TotalMilliseconds -gt 2000 -or $status -cnotin @('launch-stopped','stopped-no-partial-capture','pending-or-incomplete')){$rejected=$true;continue}
    $stages=@('launch','powershell-startup','host-identity','task-scheduler','processes','cpu-provider','capture-lock','sql-connect','readonly-boundary','sql-batch','payload','outbox-enqueue','sql-close','delivery-lock','outbox-scan','upload','acknowledgement','receipt-persist')
    $stage=H004Prop $entry 'stage';$codes=@('HOURLY_SOURCE_GUARD_UNAVAILABLE','HOURLY_SOURCE_TIMEOUT','HOURLY_SOURCE_ACCESS_DENIED','HOURLY_SOURCE_READ_FAILED','HOURLY_EVIDENCE_ACK_INVALID','HOURLY_EVIDENCE_HTTP_ERROR','HOURLY_EVIDENCE_TIMEOUT','HOURLY_RECEIPT_PERSISTENCE_FAILED','HOURLY_RECEIPT_STATE_UNVERIFIED','HOURLY_OPERATION_FAILED_DETAILS_WITHHELD','EACCES','EPERM','EIO')
    $safe+=,[pscustomobject]@{slot=$slot;startedAt=$start.ToUniversalTime().ToString('o');finishedAt=$finish.ToUniversalTime().ToString('o');status=$status;code=$(if($code -cin $codes){$code}else{'HOURLY_OPERATION_FAILED_DETAILS_WITHHELD'});stage=$(if($stage -cin $stages){$stage}else{$null});guard=(H004SafeGuard (H004Prop $entry 'guard'))}
  }
  $result.availability='verified-receipt';$result.records=$safe;$result.incomplete=($rejected -or (H004Prop $Receipt.state 'failureHistoryIncomplete') -eq $true);[pscustomobject]$result
}
function H004EvidenceProjection($View,$Receipt,$Task,[DateTimeOffset]$Now){
  $out=[ordered]@{availability='unknown';reason='EVIDENCE_UNVERIFIED';status='unknown';slot=$null;taskStartedAt=$null;attemptStartedAt=$null;collectionStartedAt=$null;finishedAt=$null;observedProducts=$null;readBatchCount=$null;backendAcceptedRecords=$null;acknowledgements=$null;outboxPending=$null;receiptViewMatched=$false;recoveryEnabled=$null;maxSampledHostCpuPercent=$null;checkpointFailures=$null;failureCode=$null;guard=$null}
  if($null -eq $Task -or $null -eq $Receipt -or $null -eq $View){return [pscustomobject]$out}
  $a=$Receipt.state.attempt;$taskAt=H004Time $Task.startedAt;$start=H004Time $a.startedAt;$inspection=H004Time (H004Prop $View 'inspectionTime');$finish=H004Time (H004Prop $View 'finishedAt')
  if($null -eq $taskAt -or $null -eq $start -or $null -eq $inspection -or $null -eq $finish -or $Task.running -ne $false){$out.reason='CURRENT_ATTEMPT_NOT_FINISHED';return [pscustomobject]$out}
  $slot=$taskAt.ToOffset([TimeSpan]::FromHours(7)).ToString('HH:00',[Globalization.CultureInfo]::InvariantCulture)
  $sameDay=$taskAt.ToOffset([TimeSpan]::FromHours(7)).ToString('yyyy-MM-dd') -ceq $finish.ToOffset([TimeSpan]::FromHours(7)).ToString('yyyy-MM-dd')
  if([math]::Abs(($taskAt-$start).TotalMilliseconds) -gt 2000 -or ($Now-$taskAt).TotalMilliseconds -gt 3602000 -or ($taskAt-$Now).TotalMilliseconds -gt 2000 -or $finish -lt $inspection -or $inspection -lt $start -or ($finish-$taskAt).TotalMilliseconds -gt 1200000 -or ($finish-$Now).TotalMilliseconds -gt 2000 -or -not $sameDay -or $slot -cne $a.slot){$out.reason='ATTEMPT_TIME_UNVERIFIED';return [pscustomobject]$out}
  if($a.phase -cne 'finished' -or (H004Prop $View 'statusAttemptSequence') -ne $a.sequence -or (H004Prop $View 'statusViewSequence') -ne (H004Prop $a 'finalViewSequence') -or (H004Prop $View 'slot') -cne $a.slot -or (H004Prop $View 'finishedAt') -cne (H004Prop $a 'finishedAt')){$out.reason='RECEIPT_VIEW_MISMATCH';return [pscustomobject]$out}
  $status=H004Prop $View 'status';if($status -cnotin @('captured-and-acknowledged','pending-or-incomplete','stopped-no-partial-capture','launch-stopped')){return [pscustomobject]$out}
  if($status -ceq 'captured-and-acknowledged'){
    $ack=H004Prop $Receipt.state 'lastAck';$success=H004Prop $Receipt.state 'lastSuccess'
    $captured=H004Time (H004Prop $ack 'capturedAt');$recorded=H004Time (H004Prop $ack 'recordedAt')
    if($null -eq $ack -or $null -eq $success -or (H004Prop $ack 'attemptSequence') -ne $a.sequence -or (H004Prop $ack 'slot') -cne $a.slot -or (H004Prop $ack 'accepted') -ne 6835 -or (H004Prop $ack 'key') -cnotmatch '^[a-f0-9]{64}$' -or $null -eq $captured -or $null -eq $recorded -or $captured -lt $start -or $recorded -lt $captured -or ($recorded-$finish).TotalMilliseconds -gt 2000 -or (H004Prop $success 'finishedAt') -cne (H004Prop $View 'finishedAt') -or (H004Prop $success 'observedProducts') -ne 6835 -or (H004Prop $success 'backendAcceptedRecords') -ne 6835 -or (H004Prop $success 'outboxPending') -ne 0 -or (H004Prop $View 'observedProducts') -ne 6835 -or (H004Prop $View 'backendAcceptedRecords') -ne 6835 -or (H004Prop $View 'outboxPending') -ne 0){$out.reason='ACK_UNVERIFIED';return [pscustomobject]$out}
  }
  $out.availability='published';$out.reason=$null;$out.status=$status;$out.slot=$a.slot;$out.taskStartedAt=$taskAt.ToUniversalTime().ToString('o');$out.attemptStartedAt=$start.ToUniversalTime().ToString('o');$out.collectionStartedAt=$inspection.ToUniversalTime().ToString('o');$out.finishedAt=$finish.ToUniversalTime().ToString('o');$out.receiptViewMatched=$true
  foreach($key in @('observedProducts','readBatchCount','backendAcceptedRecords','acknowledgements','outboxPending')){$out[$key]=H004Integer (H004Prop $View $key)}
  $r=H004Prop (H004Prop $View 'recovery') 'newUploadRecoveryEnabled';if($r -is [bool]){$out.recoveryEnabled=$r}
  $out.maxSampledHostCpuPercent=H004Number (H004Prop (H004Prop $View 'resourceGuardSummary') 'maxSampledHostCpuPercent')
  $out.checkpointFailures=H004Integer (H004Prop (H004Prop $View 'diagnostics') 'checkpointFailures')
  $code=H004Prop (H004Prop $View 'failure') 'code';$allowed=@('HOURLY_SOURCE_GUARD_UNAVAILABLE','HOURLY_SOURCE_TIMEOUT','HOURLY_SOURCE_ACCESS_DENIED','HOURLY_SOURCE_READ_FAILED','HOURLY_EVIDENCE_ACK_INVALID','HOURLY_EVIDENCE_HTTP_ERROR','HOURLY_EVIDENCE_TIMEOUT','HOURLY_RECEIPT_PERSISTENCE_FAILED','HOURLY_RECEIPT_STATE_UNVERIFIED','HOURLY_OPERATION_FAILED_DETAILS_WITHHELD','EACCES','EPERM','EIO')
  if($null -ne $code){$out.failureCode=$(if($code -cin $allowed){$code}else{'HOURLY_OPERATION_FAILED_DETAILS_WITHHELD'})}
  $out.guard=H004SafeGuard (H004Prop (H004Prop $View 'failure') 'guard')
  return [pscustomobject]$out
}
function Invoke-Hourly004DirectRead {
  param([scriptblock]$Context={H004GetContext},[scriptblock]$Read={param($Name) H004ReadKnown $Name},[scriptblock]$Tasks={H004GetTasks},[scriptblock]$Queue={H004GetQueue},[scriptblock]$Now={[DateTimeOffset]::UtcNow})
  $watch=[Diagnostics.Stopwatch]::StartNew();$stage='context';$at=& $Now
  $report=[ordered]@{schemaVersion='hourly004-direct-source-v1';checkedAt=$at.ToUniversalTime().ToString('o');branch='004';mode=$Mode;accessStatus='PARTIAL';failedStage=$null;safeError=$null;actualExecutionHostVerified=$false;existingIdentityVerified=$false;timeZoneVerified=$false;administratorToken=$null;platformAuthorization='NOT_EVALUATED_LOCALLY';requiresTrustedNativeAuthorization=$true;requiresNativeInvocationDeadlineMs=30000;fileRead='not-attempted';taskReadsExpected=11;taskReadsPassed=0;tasks=@();latestTask=$null;activePointerVersion='unknown';releaseIntegrity='NOT_FULLY_REVALIDATED';receiptState='unknown';evidence=$null;failureHistory=$null;queue=@{known=$false;pending=$null};expectedGuardBudgetMs=12000;expectedRecoveryEnabled=$false;guardChanged=$false;recoveryChanged=$false;sqlQueries=0;taskRuns=0;configurationChanges=0;permissionChanges=0;sourceFileWrites=0;newScheduledTasks=0;currentStockCertified=$false}
  try{
    $ctx=& $Context
    if($ctx.hostName -ine 'SERVER004'){H004Stop 'WRONG_EXECUTION_HOST'};$report.actualExecutionHostVerified=$true
    if((H004Prop $ctx 'existingIdentityMatched') -cne $true){H004Stop 'WRONG_EXISTING_IDENTITY'};$report.existingIdentityVerified=$true
    if($ctx.timeZone -cne 'SE Asia Standard Time'){H004Stop 'WRONG_TIMEZONE'};$report.timeZoneVerified=$true
    if($ctx.edition -cne 'Desktop' -or $ctx.major -ne 5){H004Stop 'NATIVE_PS51_REQUIRED'};$report.administratorToken=$ctx.isAdministrator
    $stage='task-read';$taskRows=@(& $Tasks|ForEach-Object {H004SafeTask $_})
    if($taskRows.Count -ne 11 -or @($taskRows|Select-Object -ExpandProperty slot -Unique).Count -ne 11 -or @($taskRows|Where-Object {$_.slot -cnotmatch '^(09|1[0-9]):00$'}).Count -gt 0){H004Stop 'TASK_SET_UNVERIFIED'}
    $report.tasks=$taskRows;$report.taskReadsPassed=$taskRows.Count
    $latest=@($taskRows|Where-Object {$null -ne (H004Time $_.startedAt)}|Sort-Object {[DateTimeOffset]::Parse($_.startedAt)} -Descending|Select-Object -First 1);if($latest.Count){$report.latestTask=$latest[0]}
    if($watch.ElapsedMilliseconds -gt 20000){H004Stop 'READ_DEADLINE'}
    $stage='status-file';$bytes=[byte[]](& $Read 'status');$report.fileRead='passed';$view=$null;$viewInvalid=$false
    try{$view=H004Json $bytes}catch{if((H004SafeError $_) -cne 'INVALID_JSON'){throw};$viewInvalid=$true}
    $stage='pointer-read';$pointer=[Text.Encoding]::UTF8.GetString([byte[]](& $Read 'pointer'));$normalize={param($s) $s.Replace("`r`n","`n").TrimEnd([char[]]"`r`n")};if((&$normalize $pointer) -ceq (&$normalize $script:H004Pointer)){$report.activePointerVersion='cpu-v5'}
    $stage='receipt-read';$valid=@();$receiptIssues=@()
    foreach($name in @('receipt0','receipt1')){try{$valid+=,(H004Receipt ([byte[]](& $Read $name)))}catch{$code=H004SafeError $_;if($code -cne 'NOT_FOUND'){$receiptIssues+=,$code}}}
    $selected=$null
    if($receiptIssues.Count -eq 0 -and $valid.Count){$ordered=@($valid|Sort-Object {$_.state.generation} -Descending);if($ordered.Count -gt 1 -and $ordered[0].state.generation -eq $ordered[1].state.generation -and $ordered[0].body -cne $ordered[1].body){$report.receiptState='conflict'}else{$selected=$ordered[0];$report.receiptState='verified'}}else{$report.receiptState='unverified'}
    $stage='evidence-validation';$seen=&$Now;$report.evidence=H004EvidenceProjection $view $selected $report.latestTask $seen;$report.failureHistory=H004History $selected $seen
    if($watch.ElapsedMilliseconds -gt 20000){H004Stop 'READ_DEADLINE'}
    $stage='queue-read';try{$report.queue=&$Queue}catch{$report.queue=@{known=$false;pending=$null;safeError=(H004SafeError $_)}}
    if($viewInvalid){$report.accessStatus='PARTIAL';$report.failedStage='status-json';$report.safeError='INVALID_JSON'}else{$report.accessStatus='PASS_READ_ACCESS_ONLY'}
  }catch{$report.failedStage=$stage;$report.safeError=H004SafeError $_;$report.accessStatus=$(if($report.safeError -cin @('WRONG_EXECUTION_HOST','WRONG_EXISTING_IDENTITY','WRONG_TIMEZONE','NATIVE_PS51_REQUIRED','ACCESS_DENIED','PATH_UNVERIFIED')){'BLOCKED'}else{'PARTIAL'})}
  $report.elapsedMs=$watch.ElapsedMilliseconds
  [pscustomobject]$report
}
if($MyInvocation.InvocationName -ne '.'){
  $result=Invoke-Hourly004DirectRead
  $result|ConvertTo-Json -Depth 10
  if($result.accessStatus -cne 'PASS_READ_ACCESS_ONLY'){exit 1}
}
