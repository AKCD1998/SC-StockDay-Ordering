param([ValidateSet('Plan','Apply','Resume','Status','Rollback')][string]$Action='Plan',[switch]$ApproveReadScope)
Set-StrictMode -Version 2
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'

function Stop-H004Permission([string]$Code){throw [InvalidOperationException]::new($Code)}
function Get-H004PermissionSpec {
  $root='C:\ProgramData\SC-StockDay-Ordering\hourly-stock-evidence-004'
  $secure=Join-Path $root 'complete-on-20261022';$items=@();$index=0
  foreach($name in @('latest-slot-result.json.receipt-0.json','latest-slot-result.json.receipt-1.json','hourly-complete-launcher.mjs')){
    $items+=@{key=('object-{0:00}' -f $index);kind='file';path=(Join-Path $secure $name);rules=@(@{mask=1179785;flags=0})};$index++
  }
  foreach($path in @('C:\ProgramData\SC-StockDay-Ordering',$root,$secure,(Join-Path $root 'hourly-evidence-outbox'))){
    $items+=@{key=('object-{0:00}' -f $index);kind='directory';path=$path;rules=@(@{mask=1048736;flags=0})};$index++
  }
  $items+=@{key=('object-{0:00}' -f $index);kind='directory';path=(Join-Path $root 'hourly-evidence-outbox\004');rules=@(@{mask=1048737;flags=0},@{mask=1048704;flags=11})};$index++
  foreach($h in 9..19){$items+=@{key=('object-{0:00}' -f $index);kind='task';path=('Hourly Stock Evidence (Branch 004) - {0:00}00' -f $h);rules=@(@{mask=1179785;flags=0})};$index++}
  return ,$items
}
function Normalize-H004PermissionDacl([string]$Sddl){
  try{$d=[Security.AccessControl.RawSecurityDescriptor]::new($Sddl);if($null -eq $d.DiscretionaryAcl -or $d.DiscretionaryAcl.Count -eq 0){Stop-H004Permission 'UNSAFE_DACL'};return $d.GetSddlForm([Security.AccessControl.AccessControlSections]::Access)}catch{Stop-H004Permission 'UNSAFE_DACL'}
}
function Test-H004PermissionDaclEqual([string]$Actual,[string]$Expected){
  # SetSecurityInfo can add SE_DACL_AUTO_INHERITED (0x400) on readback.
  # Compare only: do not rewrite stored before/after images or canonicalize ACEs.
  $a=[Security.AccessControl.RawSecurityDescriptor]::new((Normalize-H004PermissionDacl $Actual))
  $e=[Security.AccessControl.RawSecurityDescriptor]::new((Normalize-H004PermissionDacl $Expected))
  if((([int]$a.ControlFlags -bxor [int]$e.ControlFlags) -band (-bnot 1024)) -ne 0){return $false}
  $ab=New-Object byte[] $a.DiscretionaryAcl.BinaryLength;$eb=New-Object byte[] $e.DiscretionaryAcl.BinaryLength
  $a.DiscretionaryAcl.GetBinaryForm($ab,0);$e.DiscretionaryAcl.GetBinaryForm($eb,0)
  return [Linq.Enumerable]::SequenceEqual([byte[]]$ab,[byte[]]$eb)
}
function Add-H004PermissionRules([string]$Sddl,[string]$Sid,$Rules){
  $d=[Security.AccessControl.RawSecurityDescriptor]::new((Normalize-H004PermissionDacl $Sddl));$sidObject=[Security.Principal.SecurityIdentifier]::new($Sid)
  foreach($ace in $d.DiscretionaryAcl){
    if($ace -isnot [Security.AccessControl.CommonAce] -or $ace.SecurityIdentifier.Value -cne $Sid){continue}
    if($ace.AceQualifier -ne [Security.AccessControl.AceQualifier]::AccessAllowed){Stop-H004Permission 'EXISTING_READER_DENY_REVIEW_REQUIRED'}
    $allowed=@($Rules|Where-Object {[int]$_.flags -eq [int]$ace.AceFlags})
    if($allowed.Count -ne 1 -or ($ace.AccessMask -band (-bnot [int]$allowed[0].mask)) -ne 0){Stop-H004Permission 'EXISTING_READER_RIGHTS_REVIEW_REQUIRED'}
  }
  foreach($rule in $Rules){
    $covered=$false
    foreach($ace in $d.DiscretionaryAcl){
      if($ace -isnot [Security.AccessControl.CommonAce]){continue}
      if($ace.SecurityIdentifier.Value -cne $Sid){continue}
      if($ace.AceQualifier -ne [Security.AccessControl.AceQualifier]::AccessAllowed){Stop-H004Permission 'EXISTING_READER_DENY_REVIEW_REQUIRED'}
      if([int]$ace.AceFlags -eq [int]$rule.flags -and ($ace.AccessMask -band $rule.mask) -eq $rule.mask){$covered=$true}
    }
    if(-not $covered){
      $at=$d.DiscretionaryAcl.Count
      for($i=0;$i -lt $d.DiscretionaryAcl.Count;$i++){if(([int]$d.DiscretionaryAcl[$i].AceFlags -band 16) -ne 0){$at=$i;break}}
      $new=[Security.AccessControl.CommonAce]::new([Security.AccessControl.AceFlags]$rule.flags,[Security.AccessControl.AceQualifier]::AccessAllowed,[int]$rule.mask,$sidObject,$false,$null)
      $d.DiscretionaryAcl.InsertAce($at,$new)
    }
  }
  return $d.GetSddlForm([Security.AccessControl.AccessControlSections]::Access)
}
function Invoke-H004CheckedPermissionWrite($Spec,[string]$Wanted,[string]$ExpectedIdentity,[string]$ExpectedDacl,[scriptblock]$Quiet,[scriptblock]$Read,[scriptblock]$Write){
  & $Quiet
  # The quiet check performs COM calls. Recheck after them, immediately before
  # writing; do not overwrite an edit observed while checking business work.
  $current=& $Read $Spec
  if($current.identity -cne $ExpectedIdentity){Stop-H004Permission 'OBJECT_IDENTITY_CHANGED'}
  if(-not (Test-H004PermissionDaclEqual $current.sddl $ExpectedDacl)){Stop-H004Permission 'FOREIGN_PERMISSION_CHANGE'}
  & $Write $Spec $Wanted
}
function Invoke-H004PermissionEngine {
  param([string]$Mode,[bool]$Approved,[string]$Sid,$Spec,$Provider)
  $report=[ordered]@{schemaVersion='hourly004-reader-permission-result-v1';inspectionTime=[DateTimeOffset]::Now.ToString('o');action=$Mode;status='STOPPED_REVIEW_REQUIRED';errorCode=$null;failedStage=$null;failedObjectNumber=$null;nativeErrorCode=$null;objectsExpected=19;objectsAttempted=0;objectsChanged=0;backupAvailable=$false;sourceSqlQueries=0;taskRuns=0;syncRequested=$false;manualCaptureOrUploadRequested=$false;runtimeCodeChanged=$false;configurationChanged=$false;fullSyncDefinitionsUnchanged=$null;deltaConfigurationBytesUnchanged=$null;expectedGuardBudgetMs=12000;expectedUploadRecoveryEnabled=$false;nativeReadAcceptance='NOT_PERFORMED';cloudScheduleChanged=$false}
  $phase='approval';$objectNumber=$null
  try{
    if($Mode -cin @('Apply','Resume','Rollback') -and -not $Approved){Stop-H004Permission 'EXPLICIT_READ_SCOPE_APPROVAL_REQUIRED'}
    if($Spec.Count -ne 19 -or $Sid -cnotmatch '^S-1-5-21-(\d+-){3}\d+$'){Stop-H004Permission 'PLAN_OR_IDENTITY_UNVERIFIED'}
    $phase='preflight'; & $Provider.Preflight
    $phase='backup-read'
    $saved=& $Provider.Load
    if($null -ne $saved){
      $report.backupAvailable=$true
      if($saved.schemaVersion -cne 'hourly004-reader-permission-before-v1' -or $saved.sid -cne $Sid -or $saved.objects.Count -ne $Spec.Count){Stop-H004Permission 'BACKUP_UNVERIFIED'}
      $records=@($saved.objects)
      for($i=0;$i -lt $Spec.Count;$i++){
        $s=$Spec[$i];$r=$records[$i]
        if($r.key -cne $s.key -or $r.kind -cne $s.kind -or $r.path -cne $s.path -or $r.after -cne (Add-H004PermissionRules $r.before $Sid $s.rules)){Stop-H004Permission 'BACKUP_UNVERIFIED'}
      }
    }else{
      if($Mode -cin @('Resume','Rollback')){Stop-H004Permission 'NO_SETUP_BACKUP'}
      $records=@()
      foreach($s in $Spec){$phase='object-snapshot';$objectNumber=$records.Count+1;$current=& $Provider.Get $s;$before=Normalize-H004PermissionDacl $current.sddl;$records+=@{key=$s.key;kind=$s.kind;path=$s.path;identity=$current.identity;before=$before;after=(Add-H004PermissionRules $before $Sid $s.rules)}}
    }
    $beforeCount=0;$afterCount=0
    for($i=0;$i -lt $Spec.Count;$i++){
      $phase='object-verification';$objectNumber=$i+1
      $current=& $Provider.Get $Spec[$i];$r=$records[$i];$d=Normalize-H004PermissionDacl $current.sddl
      if($current.identity -cne $r.identity){Stop-H004Permission 'OBJECT_IDENTITY_CHANGED'}
      $isAfter=Test-H004PermissionDaclEqual $d $r.after;$isBefore=Test-H004PermissionDaclEqual $d $r.before
      if($isAfter){$afterCount++};if($isBefore){$beforeCount++};if(-not $isAfter -and -not $isBefore){Stop-H004Permission 'FOREIGN_PERMISSION_CHANGE'}
    }
    if($Mode -ceq 'Plan'){$report.status='READ_PERMISSION_PLAN_READY';return [pscustomobject]$report}
    if($Mode -ceq 'Status'){$report.status=$(if($afterCount -eq 19){'READ_PERMISSIONS_PRESENT_NATIVE_ACCEPTANCE_PENDING'}elseif($beforeCount -eq 19){'READ_PERMISSIONS_NOT_APPLIED'}else{'PARTIAL_SETUP_REVIEW_REQUIRED'});return [pscustomobject]$report}
    if($Mode -ceq 'Apply'){
      if($null -ne $saved){if($afterCount -eq 19){$report.status='READ_PERMISSIONS_ALREADY_PRESENT_NATIVE_ACCEPTANCE_PENDING';return [pscustomobject]$report};Stop-H004Permission 'EXISTING_SETUP_REVIEW_REQUIRED'}
      $phase='backup-write';$objectNumber=$null
      & $Provider.Save @{schemaVersion='hourly004-reader-permission-before-v1';sid=$Sid;objects=$records}
      $report.backupAvailable=$true
    }
    $order=if($Mode -ceq 'Rollback'){@(($Spec.Count-1)..0)}else{@(0..($Spec.Count-1))}
    foreach($i in $order){
      $phase='object-verification';$objectNumber=$i+1
      $s=$Spec[$i];$r=$records[$i];$current=& $Provider.Get $s;$d=Normalize-H004PermissionDacl $current.sddl
      if($current.identity -cne $r.identity){Stop-H004Permission 'OBJECT_IDENTITY_CHANGED'}
      $wanted=if($Mode -cin @('Apply','Resume')){$r.after}else{$r.before}
      if(Test-H004PermissionDaclEqual $d $wanted){continue}
      $expected=if($Mode -cin @('Apply','Resume')){$r.before}else{$r.after}
      if(-not (Test-H004PermissionDaclEqual $d $expected)){Stop-H004Permission 'FOREIGN_PERMISSION_CHANGE'}
      $report.objectsAttempted++
      $phase='permission-write'
      & $Provider.Set $s $wanted $r.identity $expected
      $check=& $Provider.Get $s
      if($check.identity -cne $r.identity -or -not (Test-H004PermissionDaclEqual $check.sddl $wanted)){Stop-H004Permission 'PERMISSION_READBACK_DIFFER'}
      $report.objectsChanged++
    }
    $phase='preservation';$objectNumber=$null; & $Provider.Preserve
    $report.fullSyncDefinitionsUnchanged=$true;$report.deltaConfigurationBytesUnchanged=$true
    $report.status=$(if($Mode -ceq 'Apply'){'READ_PERMISSIONS_APPLIED_NATIVE_ACCEPTANCE_PENDING'}elseif($Mode -ceq 'Resume'){'READ_PERMISSIONS_RESUMED_NATIVE_ACCEPTANCE_PENDING'}else{'READER_PERMISSION_ROLLBACK_COMPLETED'})
  }catch{
    $report.failedStage=$phase;$report.failedObjectNumber=$objectNumber
    $known=@('EXPLICIT_READ_SCOPE_APPROVAL_REQUIRED','PLAN_OR_IDENTITY_UNVERIFIED','BACKUP_UNVERIFIED','NO_SETUP_BACKUP','OBJECT_IDENTITY_CHANGED','FOREIGN_PERMISSION_CHANGE','EXISTING_SETUP_REVIEW_REQUIRED','PERMISSION_READBACK_DIFFER','UNSAFE_DACL','EXISTING_READER_DENY_REVIEW_REQUIRED','EXISTING_READER_RIGHTS_REVIEW_REQUIRED','HOURLY_OR_FULLSYNC_BUSY','QUEUE_NOT_EMPTY_OR_UNVERIFIED','PRESERVATION_UNVERIFIED','BACKUP_WRITE_UNVERIFIED','READ_SCOPE_ACCESS_DENIED')
    $report.errorCode=$(if($_.Exception.Message -cin $known){$_.Exception.Message}else{'SETUP_UNAVAILABLE_DETAILS_WITHHELD'})
    $e=$_.Exception;for($depth=0;$null -ne $e -and $depth -lt 4;$depth++){
      if($e -is [UnauthorizedAccessException] -or $e.HResult -eq -2147024891){$report.nativeErrorCode=5;$report.errorCode='READ_SCOPE_ACCESS_DENIED';break}
      if($e -is [ComponentModel.Win32Exception] -and $e.NativeErrorCode -in @(2,3,5,32,87,122,1300,1314,1722)){$report.nativeErrorCode=$e.NativeErrorCode;if($e.NativeErrorCode -eq 5){$report.errorCode='READ_SCOPE_ACCESS_DENIED'};break};$e=$e.InnerException
    }
  }
  return [pscustomobject]$report
}
function Initialize-H004PermissionHandles {
  if('Hourly004PermissionHandleV1' -as [type]){return}
  Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.Runtime.InteropServices;using System.Security.AccessControl;using Microsoft.Win32.SafeHandles;
public sealed class Hourly004PermissionHandleV1:IDisposable {
 [StructLayout(LayoutKind.Sequential)]struct FT{public uint L,H;}
 [StructLayout(LayoutKind.Sequential)]struct INFO{public uint Attr;public FT Created,Accessed,Written;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFile(string n,uint a,uint s,IntPtr sec,uint c,uint f,IntPtr t);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle h,out INFO i);
 [DllImport("advapi32.dll",SetLastError=true)]static extern uint GetSecurityInfo(SafeFileHandle h,uint type,uint info,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr sd);
 [DllImport("advapi32.dll",SetLastError=true)]static extern uint SetSecurityInfo(SafeFileHandle h,uint type,uint info,IntPtr owner,IntPtr group,IntPtr dacl,IntPtr sacl);
 [DllImport("advapi32.dll")]static extern uint GetSecurityDescriptorLength(IntPtr sd);
 [DllImport("kernel32.dll")]static extern IntPtr LocalFree(IntPtr p);
 SafeFileHandle handle;public string Identity{get;private set;}public bool IsDirectory{get;private set;}
 public Hourly004PermissionHandleV1(string file,bool write){
  handle=CreateFile(file,0x20080u|(write?0x40000u:0),7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
  if(handle.IsInvalid)throw new Win32Exception(Marshal.GetLastWin32Error());
  try{INFO i;if(!GetFileInformationByHandle(handle,out i))throw new Win32Exception(Marshal.GetLastWin32Error());if((i.Attr&0x400)!=0||((i.Attr&0x10)==0&&i.Links!=1))throw new InvalidOperationException("LINK_OBJECT");IsDirectory=(i.Attr&0x10)!=0;Identity=i.Volume+":"+i.IndexHigh+":"+i.IndexLow;}catch{handle.Dispose();throw;}
 }
 public string Read(){IntPtr o,g,d,s,sd;uint e=GetSecurityInfo(handle,1,4,out o,out g,out d,out s,out sd);if(e!=0)throw new Win32Exception((int)e);try{int n=checked((int)GetSecurityDescriptorLength(sd));if(n<20||n>65536)throw new InvalidOperationException("SECURITY_SIZE");byte[] b=new byte[n];Marshal.Copy(sd,b,0,n);return new RawSecurityDescriptor(b,0).GetSddlForm(AccessControlSections.Access);}finally{LocalFree(sd);}}
 public void Write(string sddl){var r=new RawSecurityDescriptor(sddl);if(r.DiscretionaryAcl==null||r.DiscretionaryAcl.Count==0)throw new InvalidOperationException("EMPTY_DACL");byte[] b=new byte[r.BinaryLength];r.GetBinaryForm(b,0);int offset=BitConverter.ToInt32(b,16);if(offset<20||offset>=b.Length)throw new InvalidOperationException("DACL_OFFSET");var p=GCHandle.Alloc(b,GCHandleType.Pinned);try{uint flags=4u|((r.ControlFlags&ControlFlags.DiscretionaryAclProtected)!=0?0x80000000u:0x20000000u);uint e=SetSecurityInfo(handle,1,flags,IntPtr.Zero,IntPtr.Zero,IntPtr.Add(p.AddrOfPinnedObject(),offset),IntPtr.Zero);if(e!=0)throw new Win32Exception((int)e);}finally{p.Free();}}
 public void Dispose(){if(handle!=null)handle.Dispose();}
}
'@
}
function Assert-H004PermissionPath([string]$Path){
  $p=[IO.Path]::GetFullPath($Path);if($p.StartsWith('\\')){Stop-H004Permission 'PATH_UNVERIFIED'}
  while($p){$i=Get-Item -LiteralPath $p -Force;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){Stop-H004Permission 'PATH_UNVERIFIED'};$parent=Split-Path $p -Parent;if($parent -eq $p){break};$p=$parent}
}
function Assert-H004PermissionObjectKind($Handle,[string]$Kind){
  if(($Kind -ceq 'directory' -and $Handle.IsDirectory -ne $true) -or ($Kind -cin @('file','task') -and $Handle.IsDirectory -ne $false)){Stop-H004Permission 'OBJECT_KIND_UNVERIFIED'}
}
function Assert-H004PrivatePermissionBackup([string]$Path){
  Assert-H004PermissionPath $Path
  $acl=[IO.Directory]::GetAccessControl($Path)
  foreach($r in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -cnotin @('S-1-5-18','S-1-5-32-544')){Stop-H004Permission 'BACKUP_WRITE_UNVERIFIED'}}
}
function Invoke-H004NativePermissionSetup([string]$Mode,[bool]$Approved){
  $service=$null;$handles=@{};$taskHandles=@{};$definitions=@{};$memo=@{};$nativeSpec=Get-H004PermissionSpec
  $secure='C:\ProgramData\SC-StockDay-Ordering\hourly-stock-evidence-004\complete-on-20261022'
  $backupDir=Join-Path $secure 'reader-permission-setup-20261112';$backup=Join-Path $backupDir 'before.json'
  try{
    if($env:COMPUTERNAME -cne 'SERVER004'){Stop-H004Permission 'WRONG_EXECUTION_HOST'}
    if([TimeZoneInfo]::Local.Id -cne 'SE Asia Standard Time'){Stop-H004Permission 'WRONG_TIMEZONE'}
    if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5){Stop-H004Permission 'NATIVE_PS51_REQUIRED'}
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent();$principal=[Security.Principal.WindowsPrincipal]::new($identity)
    if($identity.Name -ine 'SERVER004\Administrator' -or -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){Stop-H004Permission 'LOCAL_ADMINISTRATOR_REQUIRED'}
    if($Mode -cin @('Apply','Resume','Rollback') -and -not $Approved){Stop-H004Permission 'EXPLICIT_READ_SCOPE_APPROVAL_REQUIRED'}
    $sid=([Security.Principal.NTAccount]::new('SERVER004','CodexSandboxOffline')).Translate([Security.Principal.SecurityIdentifier]).Value
    if($sid -cnotmatch '^S-1-5-21-(\d+-){3}\d+$' -or (([Security.Principal.SecurityIdentifier]::new($sid)).Translate([Security.Principal.NTAccount]).Value) -ine 'SERVER004\CodexSandboxOffline' -or ([Security.Principal.SecurityIdentifier]::new($sid)).AccountDomainSid.Value -cne $identity.User.AccountDomainSid.Value){Stop-H004Permission 'PLAN_OR_IDENTITY_UNVERIFIED'}
    Initialize-H004PermissionHandles
    $service=New-Object -ComObject Schedule.Service;$service.Connect();$folder=$service.GetFolder('\')
    foreach($s in $nativeSpec){
      if($s.kind -ceq 'task'){
        $t=$folder.GetTask($s.path);$definitions[$s.key]=[string]$t.Xml
        $f=Join-Path 'C:\Windows\System32\Tasks' $s.path;Assert-H004PermissionPath $f
        $opened=[Hourly004PermissionHandleV1]::new($f,$false);try{Assert-H004PermissionObjectKind $opened 'task';$taskHandles[$s.key]=$opened}catch{$opened.Dispose();throw}
      }else{Assert-H004PermissionPath $s.path;$opened=[Hourly004PermissionHandleV1]::new($s.path,($Mode -cin @('Apply','Resume','Rollback')));try{Assert-H004PermissionObjectKind $opened $s.kind;$handles[$s.key]=$opened}catch{$opened.Dispose();throw}}
    }
    $checkQuiet={
      foreach($s in $nativeSpec|Where-Object {$_.kind -ceq 'task'}){$t=$folder.GetTask($s.path);if($t.State -eq 4 -or ($t.NextRunTime-(Get-Date)).TotalMinutes -le 5){Stop-H004Permission 'HOURLY_OR_FULLSYNC_BUSY'}}
      foreach($period in @('Morning','Evening')){$t=$folder.GetTask('AdaPOS Sync (Branch 004) - '+$period);if($t.State -eq 4 -or ($t.NextRunTime-(Get-Date)).TotalMinutes -le 15){Stop-H004Permission 'HOURLY_OR_FULLSYNC_BUSY'}}
      $count=0;foreach($p in [IO.Directory]::EnumerateFileSystemEntries((Join-Path (Split-Path $secure -Parent) 'hourly-evidence-outbox\004'))){$count++;if($count -gt 0){Stop-H004Permission 'QUEUE_NOT_EMPTY_OR_UNVERIFIED'}}
    }
    $readObject={param($s)
      if($s.kind -ceq 'task'){$t=$folder.GetTask($s.path);if([string]$t.Xml -cne $definitions[$s.key]){Stop-H004Permission 'PRESERVATION_UNVERIFIED'};$f=Join-Path 'C:\Windows\System32\Tasks' $s.path;$check=[Hourly004PermissionHandleV1]::new($f,$false);try{if($check.Identity -cne $taskHandles[$s.key].Identity){Stop-H004Permission 'OBJECT_IDENTITY_CHANGED'}}finally{$check.Dispose()};return @{identity=$taskHandles[$s.key].Identity;sddl=[string]$t.GetSecurityDescriptor(4)}}
      $check=[Hourly004PermissionHandleV1]::new($s.path,$false);try{if($check.Identity -cne $handles[$s.key].Identity){Stop-H004Permission 'OBJECT_IDENTITY_CHANGED'}}finally{$check.Dispose()};return @{identity=$handles[$s.key].Identity;sddl=$handles[$s.key].Read()}
    }
    $writeObject={param($s,$dacl);if($s.kind -ceq 'task'){$folder.GetTask($s.path).SetSecurityDescriptor($dacl,16)}else{$handles[$s.key].Write($dacl)}}
    $provider=@{
      Preflight={
        if($Mode -cin @('Apply','Resume','Rollback')){
          &$checkQuiet
          $config='C:\Users\Administrator\Desktop\RxAuu\apps\adapos-sync\.env';Assert-H004PermissionPath $config
          $st=Get-Item -LiteralPath $config -Force;if($st.Length -gt 1048576){Stop-H004Permission 'PRESERVATION_UNVERIFIED'};$memo.config=[IO.File]::ReadAllBytes($config)
          foreach($period in @('Morning','Evening')){$t=$folder.GetTask('AdaPOS Sync (Branch 004) - '+$period);$memo[$period]=@{xml=[string]$t.Xml;dacl=[string]$t.GetSecurityDescriptor(4)}}
        }
      }
      Get=$readObject
      Set={param($s,$dacl,$expectedIdentity,$expectedDacl);Invoke-H004CheckedPermissionWrite $s $dacl $expectedIdentity $expectedDacl $checkQuiet $readObject $writeObject}
      Load={if([IO.Directory]::Exists($backupDir)){Assert-H004PrivatePermissionBackup $backupDir;if(-not [IO.File]::Exists($backup)){Stop-H004Permission 'BACKUP_UNVERIFIED'};$st=Get-Item -LiteralPath $backup -Force;if($st.Length -gt 131072 -or $st.Attributes -band [IO.FileAttributes]::ReparsePoint){Stop-H004Permission 'BACKUP_UNVERIFIED'};return ([IO.File]::ReadAllText($backup)|ConvertFrom-Json)};return $null}
      Save={param($value)
        if([IO.Directory]::Exists($backupDir)){Stop-H004Permission 'EXISTING_SETUP_REVIEW_REQUIRED'}
        [void][IO.Directory]::CreateDirectory($backupDir);Assert-H004PrivatePermissionBackup $backupDir
        $bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Depth 12 -Compress));if($bytes.Length -gt 131072){Stop-H004Permission 'BACKUP_WRITE_UNVERIFIED'}
        $stream=[IO.FileStream]::new($backup,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read,4096,[IO.FileOptions]::WriteThrough)
        try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
        if([IO.File]::ReadAllText($backup) -cne [Text.Encoding]::UTF8.GetString($bytes)){Stop-H004Permission 'BACKUP_WRITE_UNVERIFIED'}
      }
      Preserve={
        foreach($s in $nativeSpec|Where-Object {$_.kind -ceq 'task'}){if([string]$folder.GetTask($s.path).Xml -cne $definitions[$s.key]){Stop-H004Permission 'PRESERVATION_UNVERIFIED'}}
        foreach($period in @('Morning','Evening')){$t=$folder.GetTask('AdaPOS Sync (Branch 004) - '+$period);if([string]$t.Xml -cne $memo[$period].xml -or [string]$t.GetSecurityDescriptor(4) -cne $memo[$period].dacl){Stop-H004Permission 'PRESERVATION_UNVERIFIED'}}
        $b=[IO.File]::ReadAllBytes('C:\Users\Administrator\Desktop\RxAuu\apps\adapos-sync\.env');if(-not [Linq.Enumerable]::SequenceEqual([byte[]]$memo.config,[byte[]]$b)){Stop-H004Permission 'PRESERVATION_UNVERIFIED'}
      }
    }
    $result=Invoke-H004PermissionEngine -Mode $Mode -Approved $Approved -Sid $sid -Spec $nativeSpec -Provider $provider
    if($Mode -cin @('Apply','Resume','Rollback') -and [IO.Directory]::Exists($backupDir)){
      try{
      Assert-H004PrivatePermissionBackup $backupDir
      $resultFile=Join-Path $backupDir ($Mode.ToLowerInvariant()+'-result.json')
      if(-not [IO.File]::Exists($resultFile)){
        $bytes=[Text.Encoding]::UTF8.GetBytes(($result|ConvertTo-Json -Depth 5 -Compress));$stream=[IO.FileStream]::new($resultFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read,4096,[IO.FileOptions]::WriteThrough)
        try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
      }
      }catch{$result|Add-Member -NotePropertyName setupReportPersistence -NotePropertyValue 'UNAVAILABLE_KEEP_WINDOW_OPEN' -Force}
    }
    return $result
  }finally{foreach($h in @($handles.Values)+@($taskHandles.Values)){$h.Dispose()};if($null -ne $service){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($service)}}
}
if($MyInvocation.InvocationName -ne '.'){
  try{$result=Invoke-H004NativePermissionSetup -Mode $Action -Approved ([bool]$ApproveReadScope)}catch{$codes=@('WRONG_EXECUTION_HOST','WRONG_TIMEZONE','NATIVE_PS51_REQUIRED','LOCAL_ADMINISTRATOR_REQUIRED','EXPLICIT_READ_SCOPE_APPROVAL_REQUIRED','PLAN_OR_IDENTITY_UNVERIFIED');$early=$_.Exception.Message -cin $codes;$result=[pscustomobject]@{schemaVersion='hourly004-reader-permission-result-v1';inspectionTime=[DateTimeOffset]::Now.ToString('o');action=$Action;status=$(if($early){'STOPPED_BEFORE_PERMISSION_CHANGE'}else{'SETUP_RESULT_UNAVAILABLE_REVIEW_REQUIRED'});errorCode=$(if($early){$_.Exception.Message}else{'SETUP_UNAVAILABLE_DETAILS_WITHHELD'});sourceSqlQueries=0;taskRuns=0;syncRequested=$false;manualCaptureOrUploadRequested=$false;cloudScheduleChanged=$false}}
  $result|ConvertTo-Json -Depth 5
}
