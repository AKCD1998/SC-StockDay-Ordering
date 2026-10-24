$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\installer\hourly004\hourly004-update.ps1')
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
$fixture=Join-Path $parent ('hourly-update-fixture-'+[guid]::NewGuid().ToString())
$null=New-Item -ItemType Directory -Path $fixture
$passed=0
try{
  foreach($case in @('success','replace-failure','postflight-failure','foreign-change','preflight-denied','legacy-acl-success','legacy-acl-rollback','legacy-acl-foreign-change','existing-backup','existing-pending')){
    $dir=Join-Path $fixture $case;$null=New-Item -ItemType Directory -Path $dir
    $target=Join-Path $dir 'launcher.mjs';$candidate=Join-Path $dir 'candidate.mjs';$backup=Join-Path $dir 'backup.mjs'
    [IO.File]::WriteAllText($target,'original fixture bytes');[IO.File]::WriteAllText($candidate,'candidate fixture bytes')
    if($case -like 'legacy-acl-*'){
      Initialize-HourlyFileTransactionNative
      $security=Get-Acl -LiteralPath $target
      $descriptor=[Security.AccessControl.RawSecurityDescriptor]::new($security.Sddl)
      $descriptor.SetFlags([Security.AccessControl.ControlFlags]([int]$descriptor.ControlFlags -band (-bnot 1024)))
      $bytes=New-Object byte[] $descriptor.BinaryLength;$descriptor.GetBinaryForm($bytes,0)
      Assert-HourlyUpdate ([Hourly004FileTransactionNative]::SetFileSecurity($target,4,$bytes)) 'FIXTURE_LEGACY_ACL_SETUP_FAILED'
      Assert-HourlyUpdate (-not (([Security.AccessControl.RawSecurityDescriptor]::new((Get-Acl -LiteralPath $target).Sddl)).ControlFlags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclAutoInherited)) 'FIXTURE_LEGACY_ACL_NOT_REPRODUCED'
    }
    $acl=(Get-Acl -LiteralPath $target).Sddl
    $pre={};$post={};$fault={}
    if($case -eq 'replace-failure'){$fault={throw 'INJECTED_FIXTURE_FAILURE'}}
    if($case -eq 'postflight-failure'){$post={throw 'INJECTED_FIXTURE_FAILURE'}}
    if($case -eq 'legacy-acl-rollback'){$post={throw 'INJECTED_FIXTURE_FAILURE'}}
    if($case -eq 'preflight-denied'){$pre={throw [UnauthorizedAccessException]::new('DO-NOT-OUTPUT')}}
    if($case -eq 'foreign-change'){$fault={[IO.File]::WriteAllText($target,'foreign fixture bytes');throw 'INJECTED_FIXTURE_FAILURE'}}
    if($case -eq 'legacy-acl-foreign-change'){$fault={[IO.File]::WriteAllText($target,'foreign fixture bytes');throw 'INJECTED_FIXTURE_FAILURE'}}
    if($case -eq 'existing-backup'){[IO.File]::WriteAllText($backup,'foreign backup')}
    if($case -eq 'existing-pending'){[IO.File]::WriteAllText(($target+'.update-pending'),'foreign pending')}
    $failed=$false;$transactionReason=$null
    try{Invoke-HourlyLauncherTransaction $target $candidate $backup $pre $post $fault}catch{$failed=$true;if($_.Exception.Message -in @('ACTIVATION_VERIFY_FAILED','ROLLBACK_VERIFY_FAILED','ORIGINAL_BACKUP_UNVERIFIED','PATH_TYPE_UNEXPECTED')){$transactionReason=$_.Exception.Message}}
    $text=[IO.File]::ReadAllText($target)
    if($case -in @('success','legacy-acl-success')){
      Assert-HourlyUpdate (-not $failed -and $text -ceq 'candidate fixture bytes' -and [IO.File]::ReadAllText($backup) -ceq 'original fixture bytes') 'FIXTURE_SUCCESS_FAILED'
      $restored=Join-Path $dir 'rollback-copy.mjs';[IO.File]::WriteAllText($restored,'original fixture bytes')
      Invoke-HourlyLauncherTransaction $target $restored (Join-Path $dir 'candidate-backup.mjs') {} {}
      Assert-HourlyUpdate ([IO.File]::ReadAllText($target) -ceq 'original fixture bytes') 'FIXTURE_ROLLBACK_FAILED'
    }elseif($case -in @('foreign-change','legacy-acl-foreign-change')){
      Assert-HourlyUpdate ($failed -and $text -ceq 'foreign fixture bytes') 'FIXTURE_FOREIGN_CHANGE_OVERWRITTEN'
    }else{
      Assert-HourlyUpdate ($failed -and $text -ceq 'original fixture bytes') 'FIXTURE_PARTIAL_INSTALL_NOT_RESTORED'
    }
    if($case -eq 'existing-backup'){Assert-HourlyUpdate ([IO.File]::ReadAllText($backup) -ceq 'foreign backup') 'FIXTURE_FOREIGN_BACKUP_CHANGED'}
    if($case -eq 'existing-pending'){Assert-HourlyUpdate ([IO.File]::ReadAllText(($target+'.update-pending')) -ceq 'foreign pending') 'FIXTURE_FOREIGN_PENDING_CHANGED'}
    Assert-HourlyUpdate ((Get-Acl -LiteralPath $target).Sddl -ceq $acl) 'FIXTURE_ACL_CHANGED'
    $passed++
  }
  $before=@{Files=@{fixture=[byte[]]@(1,2)};Acl=@{fixture='fixture-acl'};Tasks=@{fixture=@{Xml='fixture-xml';Sddl='fixture-sddl'}};Timezone='fixture-zone'}
  $after=@{Files=@{fixture=[byte[]]@(1,3)};Acl=@{fixture='fixture-acl'};Tasks=@{fixture=@{Xml='fixture-xml';Sddl='fixture-sddl'}};Timezone='fixture-zone'}
  $failed=$false;try{Assert-HourlyDefinitionsEqual $before $after}catch{$failed=$true}
  Assert-HourlyUpdate $failed 'FIXTURE_CONFIG_MUTATION_NOT_CAUGHT';$passed++
  $script:HourlyApp=$fixture;$script:HourlySecure=$fixture;$script:HourlyCache=$fixture
  $cases=@('ready','host','admin','missing-task','principal','cpu-70','full-running','full-near','full-recent','hourly-running','hourly-near','unreadable-process','busy-process','capture-lock','guard-child','cpu-denied')
  foreach($case in $cases){
    function Get-HourlyUpdateHost {return @{Name=$(if($case -eq 'host'){'OTHER'}else{'SERVER004'});Zone='SE Asia Standard Time';Admin=$case -ne 'admin'}}
    function Get-HourlyUpdateSchedule {
      $items=@()
      foreach($i in 0..12){$kind=if($i -lt 2){'full'}else{'hourly'};$items+=[pscustomobject]@{Kind=$kind;Enabled=$true;Running=($case -eq 'full-running' -and $i -eq 0) -or ($case -eq 'hourly-running' -and $i -eq 2);NextMinutes=$(if($case -eq 'full-near' -and $i -eq 0){15}elseif($case -eq 'hourly-near' -and $i -eq 2){5}else{120});LastMinutes=$(if($case -eq 'full-recent' -and $i -eq 0){14}else{120});DefinitionVerified=$case -ne 'principal'}}
      if($case -eq 'missing-task'){return $items[0..11]};return $items
    }
    function Get-HourlyUpdateProcesses {
      if($case -eq 'unreadable-process'){[pscustomobject]@{CommandLine=$null}}
      elseif($case -eq 'busy-process'){[pscustomobject]@{CommandLine='node C:\fixture\adapos-sync\src\index.js'}}
    }
    function Get-HourlyUpdateCpu {if($case -eq 'cpu-denied'){throw [UnauthorizedAccessException]::new('DO-NOT-OUTPUT')};[pscustomobject]@{PercentProcessorTime=$(if($case -eq 'cpu-70'){70}else{5})}}
    $capture=Join-Path $fixture 'hourly-evidence-outbox\004\capture.lock';$child=Join-Path $fixture 'guard-child.lock'
    if($case -eq 'capture-lock'){$null=New-Item -ItemType Directory -Path $capture -Force}
    if($case -eq 'guard-child'){[IO.File]::WriteAllText($child,'fixture-lease')}
    $failed=$false;try{Assert-HourlyQuiet}catch{$failed=$true}
    Assert-HourlyUpdate ($failed -eq ($case -ne 'ready')) ('FIXTURE_PREFLIGHT_BOUNDARY_'+$case)
    if($case -eq 'capture-lock'){[IO.Directory]::Delete($capture)}
    if($case -eq 'guard-child'){[IO.File]::Delete($child)}
    $passed++
  }
  [pscustomobject]@{simulation=$true;nativePowerShellVersion=$PSVersionTable.PSVersion.ToString();passed=$passed;failed=0;productionQueries=0;taskRuns=0;productionFilesChanged=0}|ConvertTo-Json -Compress
}catch{
  [pscustomobject]@{simulation=$true;status='fixture-failed';case=$case;transactionReason=$transactionReason;failureType=$_.Exception.GetType().Name;productionFilesChanged=0}|ConvertTo-Json -Compress
  exit 1
}finally{
  $resolved=[IO.Path]::GetFullPath($fixture)
  if($resolved.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -like 'hourly-update-fixture-*'){
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
