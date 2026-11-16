param([ValidateSet('Plan','Apply','Status','Rollback')][string]$Action='Plan',[switch]$ApproveReadScope,[switch]$OwnedChild)
Set-StrictMode -Version 2
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'

function Stop-H004Root([string]$Code){throw [InvalidOperationException]::new($Code)}
function Convert-H004RootDescriptor([string]$Text){
 $d=[Security.AccessControl.RawSecurityDescriptor]::new($Text)
 if($null -eq $d.DiscretionaryAcl -or $d.DiscretionaryAcl.Count -eq 0){Stop-H004Root 'UNSAFE_ROOT_DACL'}
 return $d
}
function Test-H004RootDescriptor([string]$Actual,[string]$Expected){
 $a=Convert-H004RootDescriptor $Actual;$b=Convert-H004RootDescriptor $Expected
 if((([int]$a.ControlFlags -bxor [int]$b.ControlFlags) -band (-bnot 1024)) -ne 0){return $false}
 if($a.Owner.Value -cne $b.Owner.Value -or $a.Group.Value -cne $b.Group.Value){return $false}
 $ab=New-Object byte[] $a.DiscretionaryAcl.BinaryLength;$bb=New-Object byte[] $b.DiscretionaryAcl.BinaryLength
 $a.DiscretionaryAcl.GetBinaryForm($ab,0);$b.DiscretionaryAcl.GetBinaryForm($bb,0)
 return [Linq.Enumerable]::SequenceEqual([byte[]]$ab,[byte[]]$bb)
}
function New-H004RootPlan([string]$Before,[string]$Sid){
 $d=Convert-H004RootDescriptor $Before;$caller=[Security.Principal.SecurityIdentifier]::new($Sid);$covered=0
 foreach($ace in $d.DiscretionaryAcl){
  if($ace -isnot [Security.AccessControl.CommonAce] -or $ace.IsCallback -or $ace.AceQualifier -ne [Security.AccessControl.AceQualifier]::AccessAllowed){Stop-H004Root 'ROOT_ACE_FORM_REVIEW_REQUIRED'}
  if($ace.SecurityIdentifier.Value -ceq $Sid -and ([int]$ace.AceFlags -band 8) -eq 0){$covered=$covered -bor $ace.AccessMask}
 }
 $missing=129 -band (-bnot $covered)
 if($missing -ne 0){
  $at=$d.DiscretionaryAcl.Count
  for($i=0;$i -lt $d.DiscretionaryAcl.Count;$i++){if(([int]$d.DiscretionaryAcl[$i].AceFlags -band 16) -ne 0){$at=$i;break}}
  $d.DiscretionaryAcl.InsertAce($at,[Security.AccessControl.CommonAce]::new([Security.AccessControl.AceFlags]::None,[Security.AccessControl.AceQualifier]::AccessAllowed,$missing,$caller,$false,$null))
 }
 return @{after=$d.GetSddlForm([Security.AccessControl.AccessControlSections]14);addedMask=$missing}
}
function Invoke-H004RootEngine([string]$Mode,[bool]$Approved,[string]$Sid,$Provider){
 $r=[ordered]@{schemaVersion='hourly004-task-root-read-result-v1';inspectionTime=[DateTimeOffset]::Now.ToString('o');action=$Mode;status='STOPPED_REVIEW_REQUIRED';errorCode=$null;failedStage=$null;nativeErrorCode=$null;objectsExpected=1;addedReadMask=$null;permissionWriteAttempted=$false;permissionChangeVerified=$false;mutationOutcome='NOT_ATTEMPTED';backupAvailable=$false;fullSyncAndHourlyDefinitionsUnchanged=$null;existingReaderPermissionsUnchanged=$null;configurationBytesAndPermissionsUnchanged=$null;nativeReadAcceptance='NOT_PERFORMED';cloudScheduleChanged=$false;guardBudgetChanged=$false;uploadRecoveryChanged=$false;sourceSqlQueries=0;taskRuns=0;syncRequested=$false;manualCaptureOrUploadRequested=$false;automaticRetryOrRollback=$false}
 $stage='approval'
 try{
  if($Mode -cin @('Apply','Rollback') -and -not $Approved){Stop-H004Root 'EXPLICIT_ROOT_READ_APPROVAL_REQUIRED'}
  if($Sid -cnotmatch '^S-1-5-21-(\d+-){3}\d+$'){Stop-H004Root 'READER_IDENTITY_UNVERIFIED'}
  $stage='preflight';&$Provider.Preflight
  $stage='snapshot-read';$saved=&$Provider.Load;$current=&$Provider.Get
  if($null -eq $saved){
   if($Mode -ceq 'Rollback'){Stop-H004Root 'NO_ROOT_BACKUP'}
   $plan=New-H004RootPlan $current.sddl $Sid
   $record=@{schemaVersion='hourly004-task-root-before-v1';path='C:\Windows\System32\Tasks';sid=$Sid;identity=$current.identity;before=$current.sddl;after=$plan.after;addedMask=$plan.addedMask}
  }else{
   $r.backupAvailable=$true
   if($saved.schemaVersion -cne 'hourly004-task-root-before-v1' -or $saved.path -cne 'C:\Windows\System32\Tasks' -or $saved.sid -cne $Sid){Stop-H004Root 'ROOT_BACKUP_UNVERIFIED'}
   $plan=New-H004RootPlan $saved.before $Sid
   if($saved.after -cne $plan.after -or $saved.addedMask -ne $plan.addedMask){Stop-H004Root 'ROOT_BACKUP_UNVERIFIED'}
   $record=$saved
  }
  if([string]$record.identity -cnotmatch '^\d+:\d+:\d+$' -or $current.identity -cne $record.identity){Stop-H004Root 'ROOT_OBJECT_IDENTITY_CHANGED'}
  $before=Test-H004RootDescriptor $current.sddl $record.before;$after=Test-H004RootDescriptor $current.sddl $record.after
  if(-not $before -and -not $after){Stop-H004Root 'FOREIGN_ROOT_PERMISSION_CHANGE'}
  $r.addedReadMask=[int]$record.addedMask
  if($Mode -ceq 'Plan'){$r.status='ROOT_READ_PLAN_READY';return [pscustomobject]$r}
  if($Mode -ceq 'Status'){$r.status=$(if($after){'ROOT_READ_PRESENT_NATIVE_ACCEPTANCE_PENDING'}else{'ROOT_READ_NOT_APPLIED'});return [pscustomobject]$r}
  $wanted=$(if($Mode -ceq 'Rollback'){$record.before}else{$record.after})
  $expected=$(if($Mode -ceq 'Rollback'){$record.after}else{$record.before})
  if(Test-H004RootDescriptor $current.sddl $wanted){
   $stage='preservation';&$Provider.Preserve
   $r.fullSyncAndHourlyDefinitionsUnchanged=$true;$r.existingReaderPermissionsUnchanged=$true;$r.configurationBytesAndPermissionsUnchanged=$true
   $r.status=$(if($Mode -ceq 'Rollback'){'ROOT_READ_ROLLBACK_ALREADY_COMPLETE'}else{'ROOT_READ_ALREADY_PRESENT_NATIVE_ACCEPTANCE_PENDING'})
   return [pscustomobject]$r
  }
  if($Mode -ceq 'Apply' -and $null -eq $saved){$stage='backup-write';&$Provider.Save $record;$r.backupAvailable=$true}
  $stage='quiet-recheck';&$Provider.Quiet
  $stage='late-identity-and-permission-check';$current=&$Provider.Get
  if($current.identity -cne $record.identity){Stop-H004Root 'ROOT_OBJECT_IDENTITY_CHANGED'}
  if(-not (Test-H004RootDescriptor $current.sddl $expected)){Stop-H004Root 'FOREIGN_ROOT_PERMISSION_CHANGE'}
  $stage='root-dacl-write';$r.permissionWriteAttempted=$true;$r.mutationOutcome='UNKNOWN_REVIEW_REQUIRED'
  &$Provider.Set $wanted
  $stage='root-readback';$actual=&$Provider.Get
  if($actual.identity -cne $record.identity -or -not(Test-H004RootDescriptor $actual.sddl $wanted)){Stop-H004Root 'ROOT_PERMISSION_READBACK_DIFFER'}
  $r.permissionChangeVerified=$true;$r.mutationOutcome='VERIFIED'
  $stage='preservation';&$Provider.Preserve
  $r.fullSyncAndHourlyDefinitionsUnchanged=$true;$r.existingReaderPermissionsUnchanged=$true;$r.configurationBytesAndPermissionsUnchanged=$true
  $r.status=$(if($Mode -ceq 'Rollback'){'ROOT_READ_ROLLBACK_COMPLETE'}else{'ROOT_READ_APPLIED_NATIVE_ACCEPTANCE_PENDING'})
 }catch{
  $r.failedStage=$stage
  $known=@('EXPLICIT_ROOT_READ_APPROVAL_REQUIRED','READER_IDENTITY_UNVERIFIED','UNSAFE_ROOT_DACL','ROOT_ACE_FORM_REVIEW_REQUIRED','NO_ROOT_BACKUP','ROOT_BACKUP_UNVERIFIED','ROOT_OBJECT_IDENTITY_CHANGED','FOREIGN_ROOT_PERMISSION_CHANGE','ROOT_PERMISSION_READBACK_DIFFER','BUSY_EXISTING_WORK','QUEUE_NOT_EMPTY_OR_UNVERIFIED','PRESERVATION_UNVERIFIED','PRIVATE_BACKUP_UNVERIFIED','BACKUP_WRITE_UNVERIFIED','OPERATOR_ALREADY_ACTIVE')
  $r.errorCode=$(if($_.Exception.Message -cin $known){$_.Exception.Message}else{'ROOT_OPERATION_UNAVAILABLE_DETAILS_WITHHELD'})
  $e=$_.Exception;for($i=0;$null -ne $e -and $i -lt 5;$i++){
   if($e -is [UnauthorizedAccessException] -or $e.HResult -eq -2147024891){$r.nativeErrorCode=5;break}
   if($e -is [ComponentModel.Win32Exception] -and $e.NativeErrorCode -in @(2,3,5,32,87,122,1314,1722)){$r.nativeErrorCode=$e.NativeErrorCode;break};$e=$e.InnerException
  }
 }
 return [pscustomobject]$r
}
function Initialize-H004RootHandle {
 if('H004TaskRootHandleV1' -as [type]){return}
 Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.Runtime.InteropServices;using System.Security.AccessControl;using Microsoft.Win32.SafeHandles;
public sealed class H004TaskRootHandleV1:IDisposable{
 [StructLayout(LayoutKind.Sequential)]struct FT{public uint L,H;}
 [StructLayout(LayoutKind.Sequential)]struct INFO{public uint Attr;public FT C,A,W;public uint V,SH,SL,Links,IH,IL;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFile(string n,uint a,uint share,IntPtr sec,uint c,uint flags,IntPtr t);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle h,out INFO i);
 [DllImport("advapi32.dll",SetLastError=true)]static extern uint GetSecurityInfo(SafeFileHandle h,uint type,uint info,out IntPtr o,out IntPtr g,out IntPtr d,out IntPtr s,out IntPtr sd);
 [DllImport("advapi32.dll",SetLastError=true)]static extern uint SetSecurityInfo(SafeFileHandle h,uint type,uint info,IntPtr o,IntPtr g,IntPtr d,IntPtr s);
 [DllImport("advapi32.dll")]static extern uint GetSecurityDescriptorLength(IntPtr sd);
 [DllImport("kernel32.dll")]static extern IntPtr LocalFree(IntPtr p);
 SafeFileHandle handle;bool writer;public string Identity{get;private set;}
 public H004TaskRootHandleV1(string path,bool write){
  writer=write;
  // MAXIMUM_ALLOWED on the WRITER handle suppresses child-ACE propagation per
  // SetSecurityInfo's documented contract. It grants the reader no extra rights.
  // No delete sharing: a held object cannot be renamed/replaced during the write.
  handle=CreateFile(path,write?0x02000000u:0x20080u,3,IntPtr.Zero,3,0x02200000u,IntPtr.Zero);
  if(handle.IsInvalid)throw new Win32Exception(Marshal.GetLastWin32Error());
  try{INFO i;if(!GetFileInformationByHandle(handle,out i))throw new Win32Exception(Marshal.GetLastWin32Error());if((i.Attr&0x400)!=0||(i.Attr&0x10)==0)throw new InvalidOperationException("ROOT_KIND");Identity=i.V+":"+i.IH+":"+i.IL;}catch{handle.Dispose();throw;}
 }
 public string Read(){IntPtr o,g,d,s,sd;uint e=GetSecurityInfo(handle,1,7,out o,out g,out d,out s,out sd);if(e!=0)throw new Win32Exception((int)e);try{int n=checked((int)GetSecurityDescriptorLength(sd));if(n<20||n>65536)throw new InvalidOperationException("ROOT_SD_SIZE");byte[] b=new byte[n];Marshal.Copy(sd,b,0,n);return new RawSecurityDescriptor(b,0).GetSddlForm((AccessControlSections)14);}finally{LocalFree(sd);}}
 public void Write(string text){
  if(!writer)throw new InvalidOperationException("ROOT_READ_ONLY_HANDLE");
  var r=new RawSecurityDescriptor(text);if(r.DiscretionaryAcl==null||r.DiscretionaryAcl.Count==0)throw new InvalidOperationException("ROOT_NULL_DACL");
  byte[] b=new byte[r.BinaryLength];r.GetBinaryForm(b,0);int offset=BitConverter.ToInt32(b,16);if(offset<20||offset>=b.Length)throw new InvalidOperationException("ROOT_DACL_OFFSET");
  var pinned=GCHandle.Alloc(b,GCHandleType.Pinned);try{uint e=SetSecurityInfo(handle,1,4,IntPtr.Zero,IntPtr.Zero,IntPtr.Add(pinned.AddrOfPinnedObject(),offset),IntPtr.Zero);if(e!=0)throw new Win32Exception((int)e);}finally{pinned.Free();}
 }
 public void Dispose(){if(handle!=null)handle.Dispose();}
}
'@
}
function Assert-H004RootLocalPath([string]$Path){
 $p=[IO.Path]::GetFullPath($Path);if($p.StartsWith('\\')){Stop-H004Root 'PRIVATE_BACKUP_UNVERIFIED'}
 while($p){$info=Get-Item -LiteralPath $p -Force;if($info.Attributes -band [IO.FileAttributes]::ReparsePoint){Stop-H004Root 'PRIVATE_BACKUP_UNVERIFIED'};$up=Split-Path $p -Parent;if($up -eq $p){break};$p=$up}
}
function Assert-H004RootPrivateDirectory([string]$Path){
 Assert-H004RootLocalPath $Path
 $acl=[IO.Directory]::GetAccessControl($Path)
 foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -cnotin @('S-1-5-18','S-1-5-32-544')){Stop-H004Root 'PRIVATE_BACKUP_UNVERIFIED'}}
}
function Write-H004RootCreateOnly([string]$Path,[string]$Text){
 if([IO.File]::Exists($Path) -or [IO.Directory]::Exists($Path)){Stop-H004Root 'BACKUP_WRITE_UNVERIFIED'}
 $bytes=[Text.Encoding]::UTF8.GetBytes($Text);if($bytes.Length -gt 131072){Stop-H004Root 'BACKUP_WRITE_UNVERIFIED'}
 $file=[IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read,4096,[IO.FileOptions]::WriteThrough)
 try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
 if([IO.File]::ReadAllText($Path) -cne $Text){Stop-H004Root 'BACKUP_WRITE_UNVERIFIED'}
}
function Write-H004RootSafeResult([string]$Directory,$Result){
 Assert-H004RootPrivateDirectory $Directory
 $Result|Add-Member -NotePropertyName resultPersisted -NotePropertyValue $true -Force
 for($n=1;$n -le 32;$n++){
  $path=Join-Path $Directory ('result-{0:000}.json' -f $n)
  if(-not[IO.File]::Exists($path) -and -not[IO.Directory]::Exists($path)){
   Write-H004RootCreateOnly $path ($Result|ConvertTo-Json -Depth 5 -Compress);return
  }
 }
 Stop-H004Root 'RESULT_HISTORY_FULL'
}
function Complete-H004RootResult([string]$Directory,$Result){
 try{Write-H004RootSafeResult $Directory $Result}
 catch{$Result|Add-Member -NotePropertyName resultPersisted -NotePropertyValue $false -Force;$Result|Add-Member -NotePropertyName resultPersistence -NotePropertyValue 'UNAVAILABLE_KEEP_WINDOW_OPEN' -Force}
 return $Result
}
function Initialize-H004RootSupervisor {
 if('H004RootOwnerJobV1' -as [type]){return}
 Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.Diagnostics;using System.Runtime.InteropServices;using System.Threading;
public sealed class H004RootOwnerOutcomeV1{public bool TimedOut,ChildClosed,GateReleased;public int ExitCode;public string Output;}
public static class H004RootOwnerJobV1{
 [StructLayout(LayoutKind.Sequential)]struct BASIC{public long P,J;public uint Flags;public UIntPtr Min,Max;public uint Active;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)]struct IO{public ulong R,W,O,RB,WB,OB;}
 [StructLayout(LayoutKind.Sequential)]struct EXT{public BASIC Basic;public IO Io;public UIntPtr P,J,PeakP,PeakJ;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr a,string n);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr j,int c,IntPtr i,uint n);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 public static H004RootOwnerOutcomeV1 Run(ProcessStartInfo start,int budget){
  IntPtr job=IntPtr.Zero;Process p=null;EventWaitHandle gate=null;var r=new H004RootOwnerOutcomeV1();r.ExitCode=-1;
  try{
   job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
   var limits=new EXT();limits.Basic.Flags=0x2000;int n=Marshal.SizeOf(typeof(EXT));IntPtr b=Marshal.AllocHGlobal(n);
   try{Marshal.StructureToPtr(limits,b,false);if(!SetInformationJobObject(job,9,b,(uint)n))throw new Win32Exception(Marshal.GetLastWin32Error());}finally{Marshal.FreeHGlobal(b);}
   string name="Local\\H004RootOwner-"+Guid.NewGuid().ToString("N");gate=new EventWaitHandle(false,EventResetMode.ManualReset,name);start.EnvironmentVariables["H004_ROOT_OWNER_GATE"]=name;
   p=Process.Start(start);var output=p.StandardOutput.ReadToEndAsync();var errors=p.StandardError.ReadToEndAsync();
   // Child bootstrap waits before decoding/invoking the operator. Failure to
   // assign its OWN job therefore cannot race an uncontained permission write.
   if(!AssignProcessToJobObject(job,p.Handle))throw new Win32Exception(Marshal.GetLastWin32Error());
   gate.Set();r.GateReleased=true;
   if(!p.WaitForExit(budget)){r.TimedOut=true;CloseHandle(job);job=IntPtr.Zero;p.WaitForExit(5000);}
   r.ChildClosed=p.HasExited;if(r.ChildClosed)r.ExitCode=p.ExitCode;
   if(output.Wait(5000)&&errors.Wait(5000)&&output.Result.Length<=131072)r.Output=output.Result;
   return r;
  }finally{
   if(job!=IntPtr.Zero)CloseHandle(job);
   if(p!=null){try{if(!p.HasExited){p.Kill();p.WaitForExit(5000);}}catch{}p.Dispose();}
   if(gate!=null)gate.Dispose();
  }
 }
}
'@
}
function Invoke-H004RootSupervised([string]$Source,[string]$Mode,[bool]$Approved){
 Initialize-H004RootSupervisor
 $memory=[IO.MemoryStream]::new();$gzip=[IO.Compression.GZipStream]::new($memory,[IO.Compression.CompressionMode]::Compress,$true)
 $bytes=[Text.Encoding]::UTF8.GetBytes($Source);try{$gzip.Write($bytes,0,$bytes.Length)}finally{$gzip.Dispose()}
 $encoded=[Convert]::ToBase64String($memory.ToArray());$memory.Dispose()
 $approvalLiteral=$(if($Approved){'$true'}else{'$false'})
 $bootstrap=@'
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$gate=[Threading.EventWaitHandle]::OpenExisting($env:H004_ROOT_OWNER_GATE,[Security.AccessControl.EventWaitHandleRights]::Synchronize)
try{if(-not$gate.WaitOne(15000)){exit 91}}finally{$gate.Dispose()}
$inputStream=[IO.MemoryStream]::new([Convert]::FromBase64String($env:H004_ROOT_OWNER_SOURCE))
$compressed=[IO.Compression.GZipStream]::new($inputStream,[IO.Compression.CompressionMode]::Decompress)
$reader=[IO.StreamReader]::new($compressed,[Text.Encoding]::UTF8)
try{$source=$reader.ReadToEnd()}finally{$reader.Dispose();$inputStream.Dispose()}
$env:H004_ROOT_OWNER_SOURCE=$null;$env:H004_ROOT_OWNER_GATE=$null
& ([scriptblock]::Create($source)) -Action '__MODE__' -ApproveReadScope:__APPROVED__ -OwnedChild
'@
 $bootstrap=$bootstrap.Replace('__MODE__',$Mode).Replace('__APPROVED__',$approvalLiteral)
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $start.Arguments='-NoProfile -NonInteractive -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($bootstrap))
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.EnvironmentVariables['H004_ROOT_OWNER_SOURCE']=$encoded
 $run=[H004RootOwnerJobV1]::Run($start,60000)
 $value=$null
 if(-not$run.TimedOut -and $run.ChildClosed -and $run.ExitCode -eq 0){try{$candidate=$run.Output|ConvertFrom-Json;if($candidate.schemaVersion -ceq 'hourly004-task-root-read-result-v1' -and $candidate.action -ceq $Mode){$value=$candidate}}catch{}}
 if($null -eq $value){
  $value=[pscustomobject]@{schemaVersion='hourly004-task-root-read-result-v1';action=$Mode;inspectionTime=[DateTimeOffset]::Now.ToString('o');status='OWNER_OPERATION_UNAVAILABLE_REVIEW_REQUIRED';errorCode=$(if($run.TimedOut){'OWNER_DEADLINE_EXCEEDED'}else{'OWNER_CHILD_RESULT_UNAVAILABLE'});permissionWriteAttempted=$null;mutationOutcome='UNKNOWN_REVIEW_REQUIRED';nativeReadAcceptance='NOT_PERFORMED';cloudScheduleChanged=$false;guardBudgetChanged=$false;uploadRecoveryChanged=$false;sourceSqlQueries=0;taskRuns=0;syncRequested=$false;manualCaptureOrUploadRequested=$false;automaticRetryOrRollback=$false;resultPersisted=$false}
 }
 $value|Add-Member -NotePropertyName ownerDeadlineMs -NotePropertyValue 60000 -Force
 $value|Add-Member -NotePropertyName ownedChildClosed -NotePropertyValue $run.ChildClosed -Force
 return $value
}
function Invoke-H004RootNative([string]$Mode,[bool]$Approved){
 $root='C:\Windows\System32\Tasks';$secure='C:\ProgramData\SC-StockDay-Ordering\hourly-stock-evidence-004\complete-on-20261022'
 $backupDir=Join-Path $secure 'reader-task-root-permission-20261116';$backup=Join-Path $backupDir 'before.json'
 $rootHandle=$null;$lock=$null;$service=$null;$memo=@{};$mutating=($Mode -cin @('Apply','Rollback'))
 try{
  if([Environment]::MachineName -ine 'SERVER004'){Stop-H004Root 'WRONG_EXECUTION_HOST'}
  if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or -not[Environment]::Is64BitProcess){Stop-H004Root 'NATIVE_PS51_X64_REQUIRED'}
  if([TimeZoneInfo]::Local.Id -cne 'SE Asia Standard Time'){Stop-H004Root 'WRONG_TIMEZONE'}
  $id=[Security.Principal.WindowsIdentity]::GetCurrent();$principal=[Security.Principal.WindowsPrincipal]::new($id)
  if($id.Name -ine 'SERVER004\Administrator' -or -not$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){Stop-H004Root 'LOCAL_ADMINISTRATOR_REQUIRED'}
  if($mutating -and -not$Approved){Stop-H004Root 'EXPLICIT_ROOT_READ_APPROVAL_REQUIRED'}
  $sid=([Security.Principal.NTAccount]::new('SERVER004','CodexSandboxOffline')).Translate([Security.Principal.SecurityIdentifier])
  if($sid.AccountDomainSid.Value -cne $id.User.AccountDomainSid.Value -or $sid.Translate([Security.Principal.NTAccount]).Value -ine 'SERVER004\CodexSandboxOffline'){Stop-H004Root 'READER_IDENTITY_UNVERIFIED'}
  Assert-H004RootLocalPath $root;Assert-H004RootLocalPath $secure
  # Bind the added root read to the already approved user's original snapshot;
  # do not grant a deleted/recreated account just because its name is identical.
  $priorDirectory=Join-Path $secure 'reader-permission-setup-20261112';$priorFile=Join-Path $priorDirectory 'before.json'
  Assert-H004RootPrivateDirectory $priorDirectory;Assert-H004RootLocalPath $priorFile
  if((Get-Item -LiteralPath $priorFile).Length -gt 131072){Stop-H004Root 'READER_IDENTITY_UNVERIFIED'}
  $prior=[IO.File]::ReadAllText($priorFile)|ConvertFrom-Json
  if($prior.schemaVersion -cne 'hourly004-reader-permission-before-v1' -or $prior.sid -cne $sid.Value -or $prior.objects.Count -ne 19){Stop-H004Root 'READER_IDENTITY_UNVERIFIED'}
  Initialize-H004RootHandle
  $rootHandle=[H004TaskRootHandleV1]::new($root,$mutating)
  $service=New-Object -ComObject Schedule.Service;$service.Connect();$folder=$service.GetFolder('\')
  $names=@();foreach($hour in 9..19){$names+=('Hourly Stock Evidence (Branch 004) - {0:00}00' -f $hour)}
  $fullNames=@('AdaPOS Sync (Branch 004) - Morning','AdaPOS Sync (Branch 004) - Evening')
  foreach($name in @($names)+@($fullNames)){$t=$folder.GetTask($name);$memo[$name]=@{xml=[string]$t.Xml;dacl=[string]$t.GetSecurityDescriptor(4)}}
  $readerObjects=@((Join-Path $secure 'latest-slot-result.json.receipt-0.json'),(Join-Path $secure 'latest-slot-result.json.receipt-1.json'),(Join-Path $secure 'hourly-complete-launcher.mjs'),'C:\ProgramData\SC-StockDay-Ordering',(Split-Path $secure -Parent),$secure,(Join-Path (Split-Path $secure -Parent) 'hourly-evidence-outbox'),(Join-Path (Split-Path $secure -Parent) 'hourly-evidence-outbox\004'))
  $memo.readerAcl=@{}
  foreach($path in $readerObjects){Assert-H004RootLocalPath $path;$memo.readerAcl[$path]=(Get-Acl -LiteralPath $path).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]14)}
  $config='C:\Users\Administrator\Desktop\RxAuu\apps\adapos-sync\.env';Assert-H004RootLocalPath $config
  if((Get-Item -LiteralPath $config).Length -gt 1048576){Stop-H004Root 'PRESERVATION_UNVERIFIED'}
  $memo.config=[IO.File]::ReadAllBytes($config);$memo.configAcl=[IO.File]::GetAccessControl($config).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]14)
  $checkQuiet={
   foreach($name in $names){$t=$folder.GetTask($name);if($t.State -eq 4 -or ($t.Enabled -and $t.NextRunTime.Year -gt 2000 -and ($t.NextRunTime-(Get-Date)).TotalMinutes -le 5)){Stop-H004Root 'BUSY_EXISTING_WORK'}}
   foreach($name in $fullNames){$t=$folder.GetTask($name);if($t.State -eq 4 -or ($t.Enabled -and $t.NextRunTime.Year -gt 2000 -and ($t.NextRunTime-(Get-Date)).TotalMinutes -le 15)){Stop-H004Root 'BUSY_EXISTING_WORK'}}
   $queue=Join-Path (Split-Path $secure -Parent) 'hourly-evidence-outbox\004';Assert-H004RootLocalPath $queue
   foreach($entry in [IO.Directory]::EnumerateFileSystemEntries($queue)){Stop-H004Root 'QUEUE_NOT_EMPTY_OR_UNVERIFIED'}
  }
  $preserve={
   foreach($name in @($names)+@($fullNames)){$t=$folder.GetTask($name);if([string]$t.Xml -cne $memo[$name].xml -or [string]$t.GetSecurityDescriptor(4) -cne $memo[$name].dacl){Stop-H004Root 'PRESERVATION_UNVERIFIED'}}
   foreach($path in $readerObjects){Assert-H004RootLocalPath $path;if((Get-Acl -LiteralPath $path).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]14) -cne $memo.readerAcl[$path]){Stop-H004Root 'PRESERVATION_UNVERIFIED'}}
   $bytes=[IO.File]::ReadAllBytes($config);$acl=[IO.File]::GetAccessControl($config).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]14)
   if(-not[Linq.Enumerable]::SequenceEqual([byte[]]$memo.config,[byte[]]$bytes) -or $acl -cne $memo.configAcl){Stop-H004Root 'PRESERVATION_UNVERIFIED'}
  }
  if($mutating){
   &$checkQuiet
   if(-not[IO.Directory]::Exists($backupDir)){[void][IO.Directory]::CreateDirectory($backupDir)}
   Assert-H004RootPrivateDirectory $backupDir
   try{$lock=[IO.FileStream]::new((Join-Path $backupDir 'operator.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{Stop-H004Root 'OPERATOR_ALREADY_ACTIVE'}
  }
  $provider=@{
   Preflight={if($mutating){&$checkQuiet}}
   Quiet=$checkQuiet
   Get={return @{identity=$rootHandle.Identity;sddl=$rootHandle.Read()}}
   Set={param($text);$rootHandle.Write($text)}
   Load={
    if([IO.File]::Exists($backup)){
     Assert-H004RootPrivateDirectory $backupDir;Assert-H004RootLocalPath $backup
     if((Get-Item -LiteralPath $backup).Length -gt 131072){Stop-H004Root 'ROOT_BACKUP_UNVERIFIED'}
     return ([IO.File]::ReadAllText($backup)|ConvertFrom-Json)
    }
    return $null
   }
   Save={param($record);Assert-H004RootPrivateDirectory $backupDir;Write-H004RootCreateOnly $backup ($record|ConvertTo-Json -Depth 5 -Compress)}
   Preserve=$preserve
  }
  $result=Invoke-H004RootEngine $Mode $Approved $sid.Value $provider
  if($mutating -and $null -ne $lock){$result=Complete-H004RootResult $backupDir $result}
  return $result
 }finally{if($null -ne $lock){$lock.Dispose()};if($null -ne $rootHandle){$rootHandle.Dispose()};if($null -ne $service){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($service)}}
}
if($MyInvocation.InvocationName -ne '.'){
 $parentAuthorizedContext=$false
 try{
  if(-not$OwnedChild){
   # Parent checks happen before compiling/spawning, and native child rechecks.
   if([Environment]::MachineName -ine 'SERVER004'){Stop-H004Root 'WRONG_EXECUTION_HOST'}
   if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or -not[Environment]::Is64BitProcess){Stop-H004Root 'NATIVE_PS51_X64_REQUIRED'}
   $id=[Security.Principal.WindowsIdentity]::GetCurrent()
   if($id.Name -ine 'SERVER004\Administrator' -or -not([Security.Principal.WindowsPrincipal]::new($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){Stop-H004Root 'LOCAL_ADMINISTRATOR_REQUIRED'}
   if($Action -cin @('Apply','Rollback') -and -not$ApproveReadScope){Stop-H004Root 'EXPLICIT_ROOT_READ_APPROVAL_REQUIRED'}
   $parentAuthorizedContext=$true
   $result=Invoke-H004RootSupervised $MyInvocation.MyCommand.ScriptBlock.ToString() $Action ([bool]$ApproveReadScope)
  }else{$result=Invoke-H004RootNative $Action ([bool]$ApproveReadScope)}
 }catch{
  $known=@('WRONG_EXECUTION_HOST','NATIVE_PS51_X64_REQUIRED','WRONG_TIMEZONE','LOCAL_ADMINISTRATOR_REQUIRED','EXPLICIT_ROOT_READ_APPROVAL_REQUIRED','READER_IDENTITY_UNVERIFIED','BUSY_EXISTING_WORK','QUEUE_NOT_EMPTY_OR_UNVERIFIED','PRIVATE_BACKUP_UNVERIFIED','OPERATOR_ALREADY_ACTIVE')
  $early=$_.Exception.Message -cin $known
  $result=[pscustomobject]@{schemaVersion='hourly004-task-root-read-result-v1';inspectionTime=[DateTimeOffset]::Now.ToString('o');action=$Action;status=$(if($early){'STOPPED_BEFORE_ROOT_PERMISSION_WRITE'}else{'OWNER_OPERATION_UNAVAILABLE_REVIEW_REQUIRED'});errorCode=$(if($early){$_.Exception.Message}else{'ROOT_OPERATION_UNAVAILABLE_DETAILS_WITHHELD'});permissionWriteAttempted=$(if($early){$false}else{$null});mutationOutcome=$(if($early){'NOT_ATTEMPTED'}else{'UNKNOWN_REVIEW_REQUIRED'});nativeReadAcceptance='NOT_PERFORMED';cloudScheduleChanged=$false;guardBudgetChanged=$false;uploadRecoveryChanged=$false;sourceSqlQueries=0;taskRuns=0;syncRequested=$false;manualCaptureOrUploadRequested=$false;resultPersisted=$false}
 }
 if(-not$OwnedChild -and $parentAuthorizedContext -and $Action -cin @('Apply','Rollback')){
  # Final supervisor receipt is separate from the child's receipt, never an
  # overwrite. If the child timed out after a write it must remain UNKNOWN.
  $directory='C:\ProgramData\SC-StockDay-Ordering\hourly-stock-evidence-004\complete-on-20261022\reader-task-root-permission-20261116'
  if([IO.Directory]::Exists((Split-Path $directory -Parent))){
   $receiptLock=$null
   try{
    Assert-H004RootLocalPath (Split-Path $directory -Parent)
    if(-not[IO.Directory]::Exists($directory)){[void][IO.Directory]::CreateDirectory($directory)}
    Assert-H004RootPrivateDirectory $directory
    $receiptLock=[IO.FileStream]::new((Join-Path $directory 'operator.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    $result=Complete-H004RootResult $directory $result
   }catch{$result|Add-Member -NotePropertyName resultPersisted -NotePropertyValue $false -Force;$result|Add-Member -NotePropertyName resultPersistence -NotePropertyValue 'UNAVAILABLE_KEEP_WINDOW_OPEN' -Force}
   finally{if($null -ne $receiptLock){$receiptLock.Dispose()}}
  }
 }
 $result|ConvertTo-Json -Depth 5
}
