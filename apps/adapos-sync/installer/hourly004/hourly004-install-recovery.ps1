# Installation recovery only. This does not enable upload/outbox recovery.
# Immutable, flushed records describe the locked objects BEFORE either rename.
# Checksums detect torn records; they are not signatures against an administrator.
function Get-HourlyInstallDigest([byte[]]$Bytes) {
  $hash=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($hash.ComputeHash($Bytes)).Replace('-','')}finally{$hash.Dispose()}
}
function Get-HourlyInstallOwner {
  $process=[Diagnostics.Process]::GetCurrentProcess()
  try{return @{pid=$PID;started=$process.StartTime.ToUniversalTime().Ticks.ToString()}}finally{$process.Dispose()}
}
function Get-HourlyInstallOwnerState($Owner) {
  if($null -eq $Owner -or $Owner.pid -notmatch '^[1-9][0-9]{0,9}$' -or $Owner.started -notmatch '^[0-9]{10,20}$'){return 'unknown'}
  try{
    $process=[Diagnostics.Process]::GetProcessById([int]$Owner.pid)
    try{if($process.StartTime.ToUniversalTime().Ticks.ToString() -ceq $Owner.started){return 'active'};return 'orphan-proven'}finally{$process.Dispose()}
  }catch [ArgumentException]{return 'orphan-proven'}catch{return 'unknown'}
}
function ConvertTo-HourlyInstallRecord($Value) {
  $payload=ConvertTo-Json -InputObject $Value -Depth 12 -Compress
  $bytes=[Text.Encoding]::UTF8.GetBytes($payload)
  return [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @{schema='hourly004-install-record-v1';payload=[Convert]::ToBase64String($bytes);integrity=(Get-HourlyInstallDigest $bytes)} -Compress))
}
function Read-HourlyInstallRecord([string]$Path,[switch]$LiveLock) {
  Assert-HourlyRegular $Path
  $locked=$null;$stream=$null
  try{
    if(-not $LiveLock){$locked=[Hourly004LockedFile]::new($Path,$true)}
    $identity=[Hourly004LockedFile]::FileIdentity($Path)
    $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    Assert-HourlyUpdate ($stream.Length -gt 0 -and $stream.Length -le 131072) 'INSTALL_METADATA_UNVERIFIED'
    $bytes=New-Object byte[] ([int]$stream.Length);$offset=0
    while($offset -lt $bytes.Length){$count=$stream.Read($bytes,$offset,$bytes.Length-$offset);Assert-HourlyUpdate ($count -gt 0) 'INSTALL_METADATA_UNVERIFIED';$offset+=$count}
    $permissions=(Get-Acl -LiteralPath $Path).Sddl
    Assert-HourlyUpdate ([Hourly004LockedFile]::FileIdentity($Path) -ceq $identity) 'INSTALL_METADATA_UNVERIFIED'
  }finally{if($null -ne $stream){$stream.Dispose()};if($null -ne $locked){$locked.Dispose()}}
  $record=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json
  Assert-HourlyUpdate ($record.schema -ceq 'hourly004-install-record-v1') 'INSTALL_METADATA_UNVERIFIED'
  $payload=[Convert]::FromBase64String($record.payload)
  Assert-HourlyUpdate ((Get-HourlyInstallDigest $payload) -ceq $record.integrity) 'INSTALL_METADATA_UNVERIFIED'
  return @{Value=([Text.Encoding]::UTF8.GetString($payload)|ConvertFrom-Json);Bytes=$bytes;Digest=(Get-HourlyInstallDigest $bytes);Permissions=$permissions;Identity=$identity}
}
function Write-HourlyInstallRecord([string]$Path,$Value,$Permissions,[scriptblock]$OnPhase={}) {
  & $OnPhase 'before-metadata-write'
  Write-HourlyOwnedTransactionFile $Path (ConvertTo-HourlyInstallRecord $Value) $Permissions
  & $OnPhase 'after-metadata-write'
  return Read-HourlyInstallRecord $Path
}
function Get-HourlyInstallRecordPath([string]$Id,[string]$Suffix='') {
  Assert-HourlyUpdate ($Id -cmatch '^[a-f0-9]{32}$' -and $Suffix -cmatch '^(|\.(complete|restored|recovered)(-[a-f0-9]{32})?|\.recover-[a-f0-9]{32})$') 'INSTALL_METADATA_UNVERIFIED'
  return Join-Path $script:HourlySecure ('installation-transaction-'+$Id+$Suffix+'.json')
}
function Test-HourlyInstallTerminal($Record,[string]$Suffix) {
  $path=Get-HourlyInstallRecordPath $Record.Value.id $Suffix
  $paths=@($path)
  $paths+=@(Get-ChildItem -LiteralPath $script:HourlySecure -File -Filter ('installation-transaction-'+$Record.Value.id+$Suffix+'-*.json') -ErrorAction Stop | Where-Object {$_.Name -cmatch ('^installation-transaction-'+$Record.Value.id+[regex]::Escape($Suffix)+'-[a-f0-9]{32}\.json$')} | ForEach-Object {$_.FullName})
  Assert-HourlyUpdate ($paths.Count -le 32) 'INSTALL_METADATA_UNVERIFIED'
  foreach($entry in $paths){
    if(-not(Test-Path -LiteralPath $entry)){continue}
    try{
      $end=Read-HourlyInstallRecord $entry
      if($end.Value.kind -ceq $Suffix.Substring(1) -and $end.Value.id -ceq $Record.Value.id -and $end.Value.prepared -ceq $Record.Digest -and $end.Permissions -ceq $Record.Permissions){return $true}
    }catch{}
  }
  return $false
}
function Assert-HourlyInstallPrepared($Record) {
  $value=$Record.Value
  Assert-HourlyUpdate ($value.kind -ceq 'prepared' -and $value.id -cmatch '^[a-f0-9]{32}$' -and $value.direction -in @('Update','Rollback') -and $value.root -ieq [IO.Path]::GetFullPath($script:HourlySecure)) 'INSTALL_METADATA_UNVERIFIED'
  Assert-HourlyUpdate ($value.rootPermissions -ceq (Get-Acl -LiteralPath $script:HourlySecure).Sddl -and $Record.Permissions -ceq $value.predecessor.sddl -and $value.candidate.sddl -ceq $value.predecessor.sddl) 'INSTALL_PERMISSIONS_UNVERIFIED'
  Assert-HourlyUpdate ($value.target -ceq 'hourly-complete-launcher.mjs' -and $value.pending -ceq 'hourly-complete-launcher.mjs.update-pending' -and $value.failed -ceq ('hourly-complete-launcher.mjs.failed-'+$value.id+'.mjs')) 'INSTALL_METADATA_UNVERIFIED'
  $expectedBackup=if($value.direction -eq 'Update'){$script:HourlyPointerBackup}else{'checkpoint-v4-rollback-'+$value.id+'.mjs'}
  Assert-HourlyUpdate ($value.backup -ceq $expectedBackup) 'INSTALL_METADATA_UNVERIFIED'
  $old=Join-Path $PSScriptRoot 'baseline\previous-launcher.mjs';$next=Join-Path $PSScriptRoot 'runtime\hourly-complete-launcher.mjs'
  if($value.direction -eq 'Rollback'){$swap=$old;$old=$next;$next=$swap}
  Assert-HourlyUpdate ((Test-HourlyBytes ([Convert]::FromBase64String($value.predecessor.bytes)) ([IO.File]::ReadAllBytes($old))) -and (Test-HourlyBytes ([Convert]::FromBase64String($value.candidate.bytes)) ([IO.File]::ReadAllBytes($next))) -and $value.predecessor.identity -cmatch '^[0-9]+:[0-9]+:[0-9]+$' -and $value.candidate.identity -cmatch '^[0-9]+:[0-9]+:[0-9]+$') 'INSTALL_METADATA_UNVERIFIED'
}
function ConvertFrom-HourlyInstallImage($Image) {
  $permissions=New-Object Security.AccessControl.FileSecurity
  $permissions.SetSecurityDescriptorSddlForm($Image.sddl)
  return @{Identity=$Image.identity;Bytes=[Convert]::FromBase64String($Image.bytes);Permissions=$permissions}
}
function Test-HourlyInstallImageAt([string]$Path,$Image) {
  if(-not(Test-Path -LiteralPath $Path)){return 'missing'}
  $handle=$null
  try{$handle=[Hourly004LockedFile]::new($Path);Assert-HourlyLauncherImage $handle $Path (ConvertFrom-HourlyInstallImage $Image);return 'verified'}catch{return 'unverified'}finally{if($null -ne $handle){$handle.Dispose()}}
}
function Get-HourlyInstallLock {
  $path=Join-Path $script:HourlySecure 'stability-update.lock'
  if(-not(Test-Path -LiteralPath $path)){return @{state='absent';record=$null;path=$path}}
  try{
    $record=Read-HourlyInstallRecord $path -LiveLock
    Assert-HourlyUpdate ($record.Value.kind -ceq 'lock' -and $record.Value.id -cmatch '^[a-f0-9]{32}$' -and $record.Value.action -in @('Update','Rollback','Recover')) 'INSTALL_METADATA_UNVERIFIED'
    return @{state=(Get-HourlyInstallOwnerState $record.Value.owner);record=$record;path=$path}
  }catch{return @{state='unknown';record=$null;path=$path}}
}
function Open-HourlyInstallLock([string]$Id,[string]$RequestedAction,$Permissions,[string]$PreparedDigest='') {
  $path=Join-Path $script:HourlySecure 'stability-update.lock'
  $value=@{kind='lock';id=$Id;action=$RequestedAction;owner=(Get-HourlyInstallOwner);prepared=$PreparedDigest}
  $bytes=ConvertTo-HourlyInstallRecord $value
  $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Read)
  try{
    $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)
    # Locks inherit the protected directory's descriptor; never change it.
    return @{Stream=$stream;Path=$path;Bytes=$bytes;Id=$Id;Owner=$value.owner;Permissions=(Get-Acl -LiteralPath $path).Sddl;Identity=[Hourly004LockedFile]::FileIdentity($path)}
  }catch{$stream.Dispose();throw}
}
function Close-HourlyInstallLock($Lock) {
  if($null -eq $Lock){return}
  $Lock.Stream.Dispose();$handle=$null
  try{
    $handle=[Hourly004LockedFile]::new($Lock.Path)
    $expected=@{Identity=$Lock.Identity;Bytes=$Lock.Bytes;Permissions=(Get-Acl -LiteralPath $Lock.Path)}
    Assert-HourlyUpdate ($expected.Permissions.Sddl -ceq $Lock.Permissions) 'INSTALL_LOCK_UNVERIFIED'
    Assert-HourlyLauncherImage $handle $Lock.Path $expected
    Assert-HourlyUpdate ($handle.RenameNoReplace((Join-Path $script:HourlySecure ('installation-lock-'+$Lock.Id+'-released-'+[guid]::NewGuid().ToString('N')+'.json')))) 'INSTALL_LOCK_UNVERIFIED'
  }finally{if($null -ne $handle){$handle.Dispose()}}
}
function Move-HourlyOrphanInstallLock($ObservedLock) {
  Assert-HourlyUpdate ($ObservedLock.state -ceq 'orphan-proven' -and $null -ne $ObservedLock.record) 'INSTALL_LOCK_OWNER_UNVERIFIED'
  $handle=[Hourly004LockedFile]::new($ObservedLock.path)
  try{
    $current=Read-HourlyInstallRecord $ObservedLock.path -LiveLock
    Assert-HourlyUpdate ($handle.Identity -ceq $ObservedLock.record.Identity -and (Test-HourlyBytes $handle.ReadBytes() $ObservedLock.record.Bytes) -and $current.Permissions -ceq $ObservedLock.record.Permissions -and (Get-HourlyInstallOwnerState $current.Value.owner) -ceq 'orphan-proven') 'INSTALL_LOCK_OWNER_UNVERIFIED'
    Assert-HourlyUpdate ($handle.IsAt($ObservedLock.path) -and $handle.RenameNoReplace((Join-Path $script:HourlySecure ('installation-lock-'+$current.Value.id+'-orphan-'+[guid]::NewGuid().ToString('N')+'.json')))) 'INSTALL_LOCK_UNVERIFIED'
  }finally{$handle.Dispose()}
}
function Get-HourlyInstallationInspection {
  $report=@{state='idle';reason=$null;lockOwner='absent';lockMetadata='absent';interrupted=$null;metadata='absent';recoverable=$false;beforeImage='unknown';pending='unknown';failed='unknown';transactionCount=0;pendingPresent=$null;failedCandidateCount=$null;beforeImagePresent=$null;record=$null;lock=$null}
  try{
    Initialize-HourlyFileTransactionNative
    $lock=Get-HourlyInstallLock;$report.lock=$lock;$report.lockOwner=$lock.state
    $report.lockMetadata=if($null -ne $lock.record){'verified'}elseif($lock.state -eq 'absent'){'absent'}else{'unverified'}
    $report.interrupted=if($lock.state -eq 'orphan-proven'){$true}elseif($lock.state -eq 'active'){$false}else{$null}
    $report.pendingPresent=Test-Path -LiteralPath (Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs.update-pending') -ErrorAction Stop
    $report.beforeImagePresent=Test-Path -LiteralPath (Join-Path $script:HourlySecure $script:HourlyPointerBackup) -ErrorAction Stop
    $report.failedCandidateCount=@(Get-ChildItem -LiteralPath $script:HourlySecure -File -Filter 'hourly-complete-launcher.mjs.failed-*.mjs' -ErrorAction Stop).Count
    $files=@(Get-ChildItem -LiteralPath $script:HourlySecure -File -Filter 'installation-transaction-*.json' -ErrorAction Stop | Where-Object {$_.Name -cmatch '^installation-transaction-[a-f0-9]{32}\.json$'})
    Assert-HourlyUpdate ($files.Count -le 256) 'INSTALL_METADATA_UNVERIFIED';$report.transactionCount=$files.Count
    if($files.Count){$report.metadata='unverified'}
    $unresolved=@();$selected=$null;$pendingVerified=$false
    foreach($file in $files){
      $record=Read-HourlyInstallRecord $file.FullName;Assert-HourlyInstallPrepared $record
      if($report.pendingPresent -and (Test-HourlyInstallImageAt (Join-Path $script:HourlySecure $record.Value.pending) $record.Value.candidate) -eq 'verified'){$pendingVerified=$true}
      Assert-HourlyUpdate ($file.Name -ceq ('installation-transaction-'+$record.Value.id+'.json')) 'INSTALL_METADATA_UNVERIFIED'
      $terminal=(Test-HourlyInstallTerminal $record '.complete') -or (Test-HourlyInstallTerminal $record '.restored') -or (Test-HourlyInstallTerminal $record '.recovered')
      if(-not $terminal){$unresolved+=,$record}
      if($null -ne $lock.record -and $lock.record.Value.id -ceq $record.Value.id){$selected=$record}
    }
    if($lock.state -eq 'active'){$report.state='updating';$report.metadata=if($null -ne $selected){'verified'}else{'not-yet-prepared'};return $report}
    if($lock.state -eq 'unknown'){Stop-HourlyUpdate 'INSTALL_LOCK_OWNER_UNVERIFIED'}
    if($null -eq $selected){
      if($lock.state -ne 'absent'){Stop-HourlyUpdate 'INSTALL_METADATA_UNVERIFIED'}
      if($unresolved.Count -eq 0){
        if($report.pendingPresent -and -not $pendingVerified){Stop-HourlyUpdate 'INSTALL_METADATA_UNVERIFIED'}
        if($files.Count -eq 0 -and ($report.pendingPresent -or $report.beforeImagePresent -or $report.failedCandidateCount -gt 0)){Stop-HourlyUpdate 'INSTALL_METADATA_UNVERIFIED'}
        $report.metadata=if($files.Count){'verified-history'}else{'absent'};return $report
      }
      Assert-HourlyUpdate ($unresolved.Count -eq 1) 'INSTALL_METADATA_UNVERIFIED';$selected=$unresolved[0]
    }
    $report.record=$selected;$report.metadata='verified'
    Assert-HourlyUpdate ((Get-HourlyInstallOwnerState $selected.Value.owner) -ceq 'orphan-proven') 'INSTALL_TRANSACTION_OWNER_UNVERIFIED'
    if($null -ne $lock.record){
      if($lock.record.Value.action -eq 'Recover'){
        Assert-HourlyUpdate ($lock.record.Value.prepared -ceq $selected.Digest -and $lock.record.Permissions -ceq $selected.Value.lock.sddl) 'INSTALL_LOCK_UNVERIFIED'
      }else{
        Assert-HourlyUpdate ($lock.record.Value.action -ceq $selected.Value.direction -and $lock.record.Identity -ceq $selected.Value.lock.identity -and $lock.record.Digest -ceq $selected.Value.lock.digest -and $lock.record.Permissions -ceq $selected.Value.lock.sddl) 'INSTALL_LOCK_UNVERIFIED'
      }
    }
    $report.interrupted=$true
    $value=$selected.Value;$target=Join-Path $script:HourlySecure $value.target
    $report.beforeImage=Test-HourlyInstallImageAt (Join-Path $script:HourlySecure $value.backup) $value.predecessor
    $report.pending=Test-HourlyInstallImageAt (Join-Path $script:HourlySecure $value.pending) $value.candidate
    $report.failed=Test-HourlyInstallImageAt (Join-Path $script:HourlySecure $value.failed) $value.candidate
    $predecessorAtTarget=Test-HourlyInstallImageAt $target $value.predecessor
    $candidateAtTarget=Test-HourlyInstallImageAt $target $value.candidate
    if($predecessorAtTarget -eq 'verified'){$report.state='recoverable';$report.reason='PREDECESSOR_ALREADY_PRESENT';$report.recoverable=$true;return $report}
    Assert-HourlyUpdate ($report.beforeImage -eq 'verified') 'INSTALL_BEFORE_IMAGE_UNVERIFIED'
    Assert-HourlyUpdate ($predecessorAtTarget -eq 'missing' -or $candidateAtTarget -eq 'verified') 'RECOVERY_REFUSED_FOREIGN_CHANGE'
    $report.state='recoverable';$report.reason=if($candidateAtTarget -eq 'verified' -and (Test-HourlyInstallTerminal $selected '.complete')){'VERIFIED_COMPLETION_REQUIRES_LOCK_REVIEW'}else{'INTERRUPTED_INSTALLATION'};$report.recoverable=$true
    return $report
  }catch{
    $report.state='unverified';$report.reason=Get-HourlyInstallSafeReason $_;$report.recoverable=$false
    if($report.metadata -eq 'unverified'){$report.metadata=if($report.reason -in @('ACCESS_DENIED','TRANSACTION_FILE_BUSY','TRANSACTION_FILE_UNAVAILABLE','IO_FAILURE')){'unreadable'}else{'corrupt-or-unverified'}}
    return $report
  }
}
function Get-HourlyInstallSafeReason($ErrorRecord) {
  $allowed=@('INSTALL_METADATA_UNVERIFIED','INSTALL_PERMISSIONS_UNVERIFIED','INSTALL_LOCK_UNVERIFIED','INSTALL_LOCK_OWNER_UNVERIFIED','INSTALL_TRANSACTION_OWNER_UNVERIFIED','INSTALL_BEFORE_IMAGE_UNVERIFIED','RECOVERY_REFUSED_FOREIGN_CHANGE','INSTALL_METADATA_WRITE_FAILED','ACCESS_DENIED','PATH_NOT_FOUND','TRANSACTION_FILE_BUSY','TRANSACTION_FILE_UNAVAILABLE')
  $errorObject=$ErrorRecord.Exception
  while($null -ne $errorObject){if($errorObject.Message -in $allowed){return $errorObject.Message};if($errorObject -is [UnauthorizedAccessException]){return 'ACCESS_DENIED'};if($errorObject -is [IO.IOException]){$code=$errorObject.HResult -band 65535;if($code -eq 112 -or $code -eq 39){return 'DISK_FULL'};if($code -eq 5){return 'ACCESS_DENIED'};if($code -in @(23,29,30,31,1117)){return 'IO_FAILURE'}};$errorObject=$errorObject.InnerException}
  return 'INSTALL_EVIDENCE_UNAVAILABLE'
}
function Write-HourlyInstallTerminal($Record,[string]$Kind,$Permissions,[scriptblock]$OnPhase={}) {
  $path=Get-HourlyInstallRecordPath $Record.Value.id ('.'+$Kind)
  if(Test-HourlyInstallTerminal $Record ('.'+$Kind)){return}
  # Preserve a torn terminal record. A fresh immutable terminal is permitted
  # only after the caller has re-proved the actual restored/committed object.
  if(Test-Path -LiteralPath $path){$path=Get-HourlyInstallRecordPath $Record.Value.id ('.'+$Kind+'-'+[guid]::NewGuid().ToString('N'))}
  $null=Write-HourlyInstallRecord $path @{kind=$Kind;id=$Record.Value.id;prepared=$Record.Digest;owner=(Get-HourlyInstallOwner)} $Permissions $OnPhase
}
function Invoke-HourlyInstallRecovery([scriptblock]$OnPhase={}) {
  Assert-HourlyUpdate ([bool]$ReleaseApproved) 'RELEASE_APPROVAL_REQUIRED'
  Assert-HourlyQuiet
  $inspection=Get-HourlyInstallationInspection
  Assert-HourlyUpdate ($inspection.state -in @('idle','recoverable')) 'RECOVERY_EVIDENCE_UNVERIFIED'
  if($inspection.state -eq 'idle'){Assert-HourlyUpdate ((Get-HourlyInstalledState) -in @('checkpoint-v4-installed','stability-candidate-installed','original-12-second-guard')) 'RECOVERY_EVIDENCE_UNVERIFIED';return Get-HourlySafeStatus}
  $record=$inspection.record;Assert-HourlyInstallPrepared $record;$value=$record.Value
  Assert-HourlyPreviousRelease;Assert-HourlyInstalledSource
  foreach($name in @('runtime-core.mjs','runtime-guard.ps1')){Assert-HourlyUpdate (Test-HourlyBytes ([IO.File]::ReadAllBytes((Join-Path $script:HourlySecure $name))) ([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot ('baseline\'+$name))))) 'INSTALLED_BASELINE_REQUIRES_REVIEW'}
  if($value.direction -eq 'Rollback'){Assert-HourlyRelease (Join-Path $script:HourlySecure $script:HourlyReleaseName)}
  $before=Get-HourlyDefinitionSnapshot -ExcludeLauncher
  & $OnPhase 'recovery-validated'
  $metadataPath=Get-HourlyInstallRecordPath $value.id
  $metadataHandle=[Hourly004LockedFile]::new($metadataPath,$true)
  $lock=$null;$oldHandle=$null;$candidateHandle=$null
  try{
    $recordPermissions=New-Object Security.AccessControl.FileSecurity;$recordPermissions.SetSecurityDescriptorSddlForm($record.Permissions)
    Assert-HourlyLauncherImage $metadataHandle $metadataPath @{Identity=$record.Identity;Bytes=$record.Bytes;Permissions=$recordPermissions}
    Assert-HourlyQuiet
    if($inspection.lock.state -ne 'absent'){Move-HourlyOrphanInstallLock $inspection.lock}
    $lock=Open-HourlyInstallLock $value.id 'Recover' (ConvertFrom-HourlyInstallImage $value.predecessor).Permissions $record.Digest
    # This durable intent plus the original immutable prepared record is enough
    # to resume either recovery gap; it never authorizes candidate activation.
    $permissions=(ConvertFrom-HourlyInstallImage $value.predecessor).Permissions
    $null=Write-HourlyInstallRecord (Get-HourlyInstallRecordPath $value.id ('.recover-'+[guid]::NewGuid().ToString('N'))) @{kind='recover-intent';id=$value.id;prepared=$record.Digest;owner=(Get-HourlyInstallOwner)} $permissions $OnPhase
    $target=Join-Path $script:HourlySecure $value.target;$backup=Join-Path $script:HourlySecure $value.backup;$committed=$false
    if((Test-HourlyInstallImageAt $target $value.predecessor) -ne 'verified'){
      $oldHandle=[Hourly004LockedFile]::new($backup)
      Assert-HourlyLauncherImage $oldHandle $backup (ConvertFrom-HourlyInstallImage $value.predecessor)
      if(Test-Path -LiteralPath $target){
        $candidateHandle=[Hourly004LockedFile]::new($target)
        Assert-HourlyLauncherImage $candidateHandle $target (ConvertFrom-HourlyInstallImage $value.candidate)
        if(Test-HourlyInstallTerminal $record '.complete'){
          if($value.direction -eq 'Update'){Assert-HourlyRelease (Join-Path $script:HourlySecure $script:HourlyReleaseName)}
          Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot -ExcludeLauncher)
          $committed=$true
        }else{
          & $OnPhase 'recovery-before-candidate-move'
          Assert-HourlyQuiet
          Assert-HourlyLauncherImage $candidateHandle $target (ConvertFrom-HourlyInstallImage $value.candidate)
          Assert-HourlyUpdate ($candidateHandle.RenameNoReplace((Join-Path $script:HourlySecure $value.failed))) 'RECOVERY_REFUSED_FOREIGN_CHANGE'
        }
      }
      if(-not $committed){
        & $OnPhase 'recovery-before-publication'
        Assert-HourlyQuiet
        Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot -ExcludeLauncher)
        Assert-HourlyLauncherImage $oldHandle $backup (ConvertFrom-HourlyInstallImage $value.predecessor)
        Assert-HourlyUpdate ($oldHandle.RenameNoReplace($target)) 'RECOVERY_REFUSED_FOREIGN_CHANGE'
        Assert-HourlyLauncherImage $oldHandle $target (ConvertFrom-HourlyInstallImage $value.predecessor)
        & $OnPhase 'recovery-after-publication'
      }
    }else{
      $oldHandle=[Hourly004LockedFile]::new($target)
      Assert-HourlyLauncherImage $oldHandle $target (ConvertFrom-HourlyInstallImage $value.predecessor)
    }
    Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot -ExcludeLauncher)
    if($committed){Assert-HourlyLauncherImage $candidateHandle $target (ConvertFrom-HourlyInstallImage $value.candidate)}else{
      Assert-HourlyLauncherImage $oldHandle $target (ConvertFrom-HourlyInstallImage $value.predecessor)
      Write-HourlyInstallTerminal $record 'recovered' $permissions $OnPhase
    }
  }finally{
    if($null -ne $candidateHandle){$candidateHandle.Dispose()};if($null -ne $oldHandle){$oldHandle.Dispose()};$metadataHandle.Dispose();Close-HourlyInstallLock $lock
  }
  return Get-HourlySafeStatus
}
