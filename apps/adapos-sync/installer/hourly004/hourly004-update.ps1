param(
  [ValidateSet('Preflight','Update','Status','Rollback','Recover')][string]$Action='Status',
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
$script:HourlyReleaseName='stability-20261028-cpu-v5'
$script:HourlyPreviousReleaseName='stability-20261024-checkpoint-v4'
$script:HourlyPointerBackup='cpu-v5-previous-launcher.mjs'
$script:HourlyNode='C:\Program Files\nodejs\node.exe'

function Stop-HourlyUpdate([string]$Code) {throw [InvalidOperationException]::new($Code)}
function Assert-HourlyUpdate([bool]$Condition,[string]$Code) {if(-not $Condition){Stop-HourlyUpdate $Code}}
function Test-HourlyBytes([byte[]]$A,[byte[]]$B) {
  if($A.Length -ne $B.Length){return $false};for($i=0;$i -lt $A.Length;$i++){if($A[$i] -ne $B[$i]){return $false}};return $true
}
function Assert-HourlyRegular([string]$File) {
  $item=Get-Item -LiteralPath $File -ErrorAction Stop
  Assert-HourlyUpdate (-not $item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) 'PATH_TYPE_UNEXPECTED'
}
function Get-HourlyDefinitionSnapshot([switch]$ExcludeLauncher) {
  $files=@((Join-Path $script:HourlyApp '.env'),(Join-Path $script:HourlyApp 'package-lock.json'))
  $files+=@(Get-ChildItem -LiteralPath (Join-Path $script:HourlyApp 'src') -File -Recurse | ForEach-Object {$_.FullName})
  $files+=@(Get-ChildItem -LiteralPath $script:HourlySecure -Filter 'approved-cohort-*.json' -File | ForEach-Object {$_.FullName})
  $bytes=@{};$acl=@{}
  foreach($file in $files){Assert-HourlyRegular $file;$bytes[$file]=[IO.File]::ReadAllBytes($file);$acl[$file]=(Get-Acl -LiteralPath $file).Sddl}
  $protected=@($script:HourlySecure,(Join-Path $script:HourlySecure 'runtime-core.mjs'),(Join-Path $script:HourlySecure 'runtime-guard.ps1'))
  if(-not $ExcludeLauncher){$protected+=(Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs')}
  foreach($file in $protected){$acl[$file]=(Get-Acl -LiteralPath $file).Sddl}
  return @{Files=$bytes;Acl=$acl;Tasks=(Get-HourlyProtectedTaskDefinitions);Timezone=[TimeZoneInfo]::Local.Id}
}
function Get-HourlyProtectedTaskDefinitions {
  $service=New-Object -ComObject Schedule.Service
  try{
    $service.Connect();$folder=$service.GetFolder('\');$tasks=@{}
    foreach($task in @($folder.GetTasks(1))){if($task.Name -match '^(AdaPOS|Hourly Stock|Transfer)'){$tasks[$task.Name]=@{Xml=$task.Xml;Sddl=$task.GetSecurityDescriptor(7)}}}
    return $tasks
  }finally{if($null -ne $service){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($service)}}
}
function Assert-HourlyDefinitionsEqual($Before,$After) {
  Assert-HourlyUpdate ($Before.Timezone -ceq $After.Timezone -and $Before.Files.Count -eq $After.Files.Count -and $Before.Tasks.Count -eq $After.Tasks.Count -and $Before.Acl.Count -eq $After.Acl.Count) 'PROTECTED_STATE_CHANGED'
  foreach($key in $Before.Files.Keys){Assert-HourlyUpdate ($After.Files.ContainsKey($key) -and (Test-HourlyBytes $Before.Files[$key] $After.Files[$key])) 'PROTECTED_STATE_CHANGED'}
  foreach($key in $Before.Acl.Keys){Assert-HourlyUpdate ($Before.Acl[$key] -ceq $After.Acl[$key]) 'PROTECTED_PERMISSIONS_CHANGED'}
  foreach($key in $Before.Tasks.Keys){Assert-HourlyUpdate ($Before.Tasks[$key].Xml -ceq $After.Tasks[$key].Xml -and $Before.Tasks[$key].Sddl -ceq $After.Tasks[$key].Sddl) 'TASK_DEFINITION_OR_PERMISSIONS_CHANGED'}
}
function Get-HourlyInstalledState {
  try {
  foreach($name in @('runtime-core.mjs','runtime-guard.ps1')){
    $target=Join-Path $script:HourlySecure $name;$original=Join-Path $PSScriptRoot ('baseline\'+$name)
    Assert-HourlyRegular $target
    if(-not(Test-HourlyBytes ([IO.File]::ReadAllBytes($target)) ([IO.File]::ReadAllBytes($original)))){return 'unrecognized-baseline'}
  }
  $target=Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'
  if(-not(Test-Path -LiteralPath $target)){return 'launcher-missing'}
  Assert-HourlyRegular $target
  $current=[IO.File]::ReadAllBytes($target)
  if(Test-HourlyBytes $current ([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'baseline\hourly-complete-launcher.mjs')))){return 'original-12-second-guard'}
  if(Test-HourlyBytes $current ([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'baseline\previous-launcher.mjs')))){return 'checkpoint-v4-installed'}
  if(Test-HourlyBytes $current ([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'runtime\hourly-complete-launcher.mjs')))){return 'cpu-v5-installed'}
  return 'unrecognized-baseline'
  }catch{return 'installation-unavailable'}
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
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class Hourly004FileTransactionNative {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool SetFileSecurity(string name, uint information, byte[] descriptor);
}
public sealed class Hourly004LockedFile : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct Information {
    public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;
    public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFile(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Information info);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle handle,int type,IntPtr data,uint bytes);
  readonly SafeFileHandle handle; readonly FileStream stream;
  public readonly string Identity;
  static string IdentityOf(SafeFileHandle handle) {
    Information info;if(!GetFileInformationByHandle(handle,out info)||(info.Attributes&0x410)!=0||info.Links!=1)throw new IOException("PATH_TYPE_UNEXPECTED");
    return info.Volume.ToString()+":"+info.IndexHigh.ToString()+":"+info.IndexLow.ToString();
  }
  public Hourly004LockedFile(string file) : this(file,false) {}
  public Hourly004LockedFile(string file,bool readOnly) {
    // Freeze this object against other writers/renamers. Rename through this
    // handle, never replace a pathname after a separate comparison.
    handle=CreateFile(file,readOnly?0x80000000:0x80010000,1,IntPtr.Zero,3,0x80200000,IntPtr.Zero);
    if(handle.IsInvalid){int code=Marshal.GetLastWin32Error();handle.Dispose();throw new IOException(code==32||code==33?"TRANSACTION_FILE_BUSY":code==5?"ACCESS_DENIED":code==2||code==3?"PATH_NOT_FOUND":"TRANSACTION_FILE_UNAVAILABLE");}
    try{Identity=IdentityOf(handle);stream=new FileStream(handle,FileAccess.Read,4096,false);}catch{handle.Dispose();throw;}
  }
  public byte[] ReadBytes() {
    if(stream.Length>1048576)throw new IOException("PATH_TYPE_UNEXPECTED");
    stream.Position=0;byte[] bytes=new byte[(int)stream.Length];int offset=0;
    while(offset<bytes.Length){int count=stream.Read(bytes,offset,bytes.Length-offset);if(count==0)throw new IOException("TRANSACTION_FILE_UNAVAILABLE");offset+=count;}return bytes;
  }
  public bool IsAt(string file) {
    using(SafeFileHandle other=CreateFile(file,0x80000000,7,IntPtr.Zero,3,0x00200000,IntPtr.Zero)){
      if(other.IsInvalid)return false;try{return IdentityOf(other)==Identity;}catch{return false;}
    }
  }
  public static string FileIdentity(string file) {
    using(SafeFileHandle other=CreateFile(file,0x80000000,7,IntPtr.Zero,3,0x00200000,IntPtr.Zero)){
      if(other.IsInvalid)throw new IOException("TRANSACTION_FILE_UNAVAILABLE");return IdentityOf(other);
    }
  }
  public bool RenameNoReplace(string file) {
    byte[] name=Encoding.Unicode.GetBytes(Path.GetFullPath(file));int offset=IntPtr.Size==8?20:12;
    IntPtr data=Marshal.AllocHGlobal(offset+name.Length+2);
    try{for(int i=0;i<offset+name.Length+2;i++)Marshal.WriteByte(data,i,0);Marshal.WriteInt32(data,IntPtr.Size==8?16:8,name.Length);Marshal.Copy(name,0,IntPtr.Add(data,offset),name.Length);
      return SetFileInformationByHandle(handle,3,data,(uint)(offset+name.Length+2));
    }finally{Marshal.FreeHGlobal(data);}
  }
  public void Dispose(){stream.Dispose();}
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
function Get-HourlyLauncherImage([string]$Target,[byte[]]$ExpectedBytes) {
  Initialize-HourlyFileTransactionNative
  $imageHandle=[Hourly004LockedFile]::new($Target)
  try {
    $imageBytes=$imageHandle.ReadBytes()
    Assert-HourlyUpdate (Test-HourlyBytes $imageBytes $ExpectedBytes) 'PREDECESSOR_CHANGED'
    return @{Bytes=$imageBytes;Identity=$imageHandle.Identity;Permissions=(Get-Acl -LiteralPath $Target)}
  } finally {$imageHandle.Dispose()}
}
function Assert-HourlyLauncherImage($Handle,[string]$Target,$ExpectedImage) {
  Assert-HourlyUpdate ($null -ne $ExpectedImage) 'PREDECESSOR_PIN_REQUIRED'
  $imageChecks=@{PathIdentity=$Handle.IsAt($Target);ObjectIdentity=$Handle.Identity -ceq $ExpectedImage.Identity;Bytes=(Test-HourlyBytes ($Handle.ReadBytes()) $ExpectedImage.Bytes);Permissions=(Get-Acl -LiteralPath $Target).Sddl -ceq $ExpectedImage.Permissions.Sddl}
  if($imageChecks.Values -contains $false){$imageError=[InvalidOperationException]::new('PREDECESSOR_CHANGED');foreach($key in $imageChecks.Keys){$imageError.Data[$key]=$imageChecks[$key]};throw $imageError}
}
function Invoke-HourlyLauncherTransaction([string]$Target,[string]$Candidate,[string]$Backup,[scriptblock]$AssertBefore,[scriptblock]$AssertAfter,[scriptblock]$FaultAfterReplace={},$ExpectedImage=$null,[scriptblock]$OnPhase={},$TransactionContext=$null) {
  Assert-HourlyUpdate ($null -ne $ExpectedImage) 'PREDECESSOR_PIN_REQUIRED'
  & $AssertBefore
  Initialize-HourlyFileTransactionNative
  $transactionNextBytes=[IO.File]::ReadAllBytes($Candidate)
  $pending=$Target+'.update-pending'
  Assert-HourlyUpdate (-not(Test-Path -LiteralPath $Backup)) 'BACKUP_ALREADY_EXISTS'
  Assert-HourlyUpdate (-not(Test-Path -LiteralPath $pending)) 'PENDING_UPDATE_REQUIRES_REVIEW'
  Assert-HourlyUpdate ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Target)) -ieq [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Backup))) 'PATH_TYPE_UNEXPECTED'
  $originalHandle=$null;$candidateHandle=$null;$displaced=$false;$published=$false
  $failedCandidate=$Target+'.failed-'+$(if($null -ne $TransactionContext){$TransactionContext.Id}else{[guid]::NewGuid().ToString('N')})+'.mjs'
  $prepared=$null
  try {
    $originalHandle=[Hourly004LockedFile]::new($Target)
    Assert-HourlyLauncherImage $originalHandle $Target $ExpectedImage
    Write-HourlyOwnedTransactionFile $pending $transactionNextBytes $ExpectedImage.Permissions
    $candidateHandle=[Hourly004LockedFile]::new($pending)
    Assert-HourlyUpdate (Test-HourlyBytes ($candidateHandle.ReadBytes()) $transactionNextBytes) 'ACTIVATION_VERIFY_FAILED'
    if($null -ne $TransactionContext){
      & $OnPhase 'before-transaction-metadata'
      $value=@{kind='prepared';id=$TransactionContext.Id;direction=$TransactionContext.Direction;owner=$TransactionContext.Owner;lock=$TransactionContext.Lock;root=[IO.Path]::GetFullPath($script:HourlySecure);rootPermissions=(Get-Acl -LiteralPath $script:HourlySecure).Sddl;target=[IO.Path]::GetFileName($Target);backup=[IO.Path]::GetFileName($Backup);pending=[IO.Path]::GetFileName($pending);failed=[IO.Path]::GetFileName($failedCandidate);predecessor=@{identity=$ExpectedImage.Identity;bytes=[Convert]::ToBase64String($ExpectedImage.Bytes);sddl=$ExpectedImage.Permissions.Sddl};candidate=@{identity=$candidateHandle.Identity;bytes=[Convert]::ToBase64String($transactionNextBytes);sddl=$ExpectedImage.Permissions.Sddl}}
      $prepared=Write-HourlyInstallRecord (Get-HourlyInstallRecordPath $value.id) $value $ExpectedImage.Permissions $OnPhase
      Assert-HourlyInstallPrepared $prepared
      & $OnPhase 'transaction-metadata-durable'
    }
    & $AssertBefore
    & $OnPhase 'before-before-image-move'
    Assert-HourlyLauncherImage $originalHandle $Target $ExpectedImage
    # Move the locked, pinned object itself to the backup. Neither rename may
    # replace an existing name. A new target in the publication gap is foreign.
    Assert-HourlyUpdate ($originalHandle.RenameNoReplace($Backup)) 'TRANSACTION_RENAME_REFUSED'
    $displaced=$true
    Assert-HourlyLauncherImage $originalHandle $Backup $ExpectedImage
    & $OnPhase 'before-publication'
    Assert-HourlyUpdate ($candidateHandle.RenameNoReplace($Target)) 'TRANSACTION_RENAME_REFUSED'
    $published=$true
    & $FaultAfterReplace
    & $OnPhase 'before-postflight'
    Assert-HourlyUpdate ($candidateHandle.IsAt($Target) -and (Test-HourlyBytes ($candidateHandle.ReadBytes()) $transactionNextBytes) -and (Get-Acl -LiteralPath $Target).Sddl -ceq $ExpectedImage.Permissions.Sddl) 'ACTIVATION_VERIFY_FAILED'
    & $AssertAfter
    Assert-HourlyUpdate ($candidateHandle.IsAt($Target) -and (Test-HourlyBytes ($candidateHandle.ReadBytes()) $transactionNextBytes) -and (Get-Acl -LiteralPath $Target).Sddl -ceq $ExpectedImage.Permissions.Sddl) 'ACTIVATION_VERIFY_FAILED'
    if($null -ne $prepared){Write-HourlyInstallTerminal $prepared 'complete' $ExpectedImage.Permissions $OnPhase;& $OnPhase 'transaction-completed'}
  } catch {
    if($displaced){
      if($published){
        Assert-HourlyUpdate ($candidateHandle.IsAt($Target) -and (Test-HourlyBytes ($candidateHandle.ReadBytes()) $transactionNextBytes) -and (Get-Acl -LiteralPath $Target).Sddl -ceq $ExpectedImage.Permissions.Sddl) 'ROLLBACK_REFUSED_FOREIGN_CHANGE'
        Assert-HourlyUpdate ($candidateHandle.RenameNoReplace($failedCandidate)) 'ROLLBACK_VERIFY_FAILED'
      }
      Assert-HourlyLauncherImage $originalHandle $Backup $ExpectedImage
      & $OnPhase 'before-recovery-publication'
      Assert-HourlyUpdate ($originalHandle.RenameNoReplace($Target)) 'ROLLBACK_REFUSED_FOREIGN_CHANGE'
      Assert-HourlyLauncherImage $originalHandle $Target $ExpectedImage
      if($null -ne $prepared){Write-HourlyInstallTerminal $prepared 'restored' $ExpectedImage.Permissions $OnPhase}
    }
    throw
  } finally {
    if($null -ne $candidateHandle){$candidateHandle.Dispose()}
    if($null -ne $originalHandle){$originalHandle.Dispose()}
    # Retain failed owned pending/backup objects for review. Never delete or
    # normalize a pathname that might have been supplied by another writer.
  }
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
function Get-HourlyTaskAttemptInfo {
  param([scriptblock]$CreateService={New-Object -ComObject Schedule.Service},[scriptblock]$ReleaseService={param($Service) [void][Runtime.InteropServices.Marshal]::ReleaseComObject($Service)})
  $service=$null
  try {
    $service=& $CreateService
    $service.Connect();$folder=$service.GetFolder('\');$latest=$null
    foreach($hour in 9..19){$task=$folder.GetTask(('Hourly Stock Evidence (Branch 004) - {0:00}00' -f $hour));if($task.LastRunTime.Year -ge 2000 -and ($null -eq $latest -or $task.LastRunTime -gt $latest.LastRunTime)){$latest=$task}}
    if($null -eq $latest){return @{verified=$false;startedAt=$null;running=$null}}
    [xml]$definition=$latest.Xml
    $ns=New-Object Xml.XmlNamespaceManager($definition.NameTable);$ns.AddNamespace('t','http://schemas.microsoft.com/windows/2004/02/mit/task')
    $exec=$definition.SelectNodes('//t:Actions/t:Exec',$ns)
    $user=$definition.SelectSingleNode('//t:Principal/t:UserId',$ns).InnerText
    $slot=$latest.Name.Substring($latest.Name.Length-4).Insert(2,':')
    $entry=Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'
    $verified=$false
    if($exec.Count -eq 1){
      $arguments=$exec[0].Arguments.Replace('/','\')
      $verified=$exec[0].Command -ieq $script:HourlyNode -and $exec[0].WorkingDirectory -ieq $script:HourlyApp -and ($arguments -ceq ('"'+$entry+'" run '+$slot) -or $arguments -ceq ($entry+' run '+$slot))
    }
    $verified=$verified -and $user -in @('SYSTEM','S-1-5-18') -and $definition.SelectSingleNode('//t:ExecutionTimeLimit',$ns).InnerText -eq 'PT20M'
    return @{verified=$true;startedAt=([datetimeoffset]$latest.LastRunTime).ToUniversalTime().ToString('o');running=[int]$latest.State -eq 4;enabled=[bool]$latest.Enabled;lastResult=[int]$latest.LastTaskResult;definitionVerified=[bool]$verified}
  } catch {return @{verified=$false;startedAt=$null;running=$null}}
  finally {if($null -ne $service){& $ReleaseService $service}}
}
function Get-HourlyStatusNow {return [datetimeoffset]::Now.ToString('o')}
function Get-HourlySafeStatus {
  $state=Get-HourlyInstalledState
  $report=[ordered]@{schemaVersion='hourly004-update-status-v3';installation=$state;guardBudgetMs=12000;newRecoveryEnabled=$false;productionEntryInvoked=$false;currentStockCertified=$false}
  $inspection=Get-HourlyInstallationInspection
  if($inspection.state -eq 'idle' -and $state -notin @('cpu-v5-installed','checkpoint-v4-installed','original-12-second-guard')){$inspection.state='unverified';$inspection.reason='LAUNCHER_OR_BASELINE_UNVERIFIED'}
  $report.installationTransaction=@{};foreach($key in @('state','reason','lockOwner','lockMetadata','interrupted','metadata','recoverable','beforeImage','pending','failed','transactionCount','pendingPresent','failedCandidateCount','beforeImagePresent')){$report.installationTransaction[$key]=$inspection[$key]}
  foreach($entry in @(@('stagedReleaseExists',$script:HourlyReleaseName),@('previousReleaseExists',$script:HourlyPreviousReleaseName),@('previousPointerBackupExists',$script:HourlyPointerBackup))){$report[$entry[0]]=$null;try{$report[$entry[0]]=Test-Path -LiteralPath (Join-Path $script:HourlySecure $entry[1]) -ErrorAction Stop}catch{}}
  $report.queueNow=@{pending=$null;checkedAt=[datetimeoffset]::Now.ToString('o')}
  try{$folder=Join-Path $script:HourlyCache 'hourly-evidence-outbox\004';$report.queueNow.pending=@(Get-ChildItem -LiteralPath $folder -File -ErrorAction Stop | Where-Object {$_.Name -cmatch '^[a-f0-9]{64}\.json$'}).Count}catch{}
  $report.availability='unknown';$report.latestAttempt=@{status='unknown';slot=$null;observedProducts=$null;backendAcceptedRecords=$null;outboxPending=$null};$report.lastSuccess=$null;$report.failureCode=$null
  $meta=@{verified=$false;startedAt=$null;running=$null};try{$meta=Get-HourlyTaskAttemptInfo}catch{}
  # Aggregate status only: no credentials, arguments, process query, SQL or task
  # mutation. A cloud caller must independently establish device authorization.
  $report.sourceObservation=@{schemaVersion='hourly004-source-observation-v1';observedAt=[datetimeoffset]::UtcNow.ToString('o');hostVerified=[Environment]::MachineName -ceq 'SERVER004';timeZoneVerified=[TimeZoneInfo]::Local.Id -ceq 'SE Asia Standard Time';taskAccessVerified=$meta.verified;task=@{startedAt=$meta.startedAt;running=$meta.running;enabled=$meta.enabled;lastResult=$meta.lastResult;definitionVerified=$meta.definitionVerified};sqlQueries=0;taskRuns=0;configurationChanges=0}
  $modeVerified=$state -in @('cpu-v5-installed','checkpoint-v4-installed','original-12-second-guard')
  $modeVerified=$modeVerified -and $inspection.state -eq 'idle'
  $request=@{file=(Join-Path $script:HourlySecure 'latest-slot-result.json');now=(Get-HourlyStatusNow);legacyMode=$state -eq 'original-12-second-guard';latestTaskStartedAt=$(if($meta.verified -and $modeVerified){$meta.startedAt}else{$null});taskRunning=$meta.running}|ConvertTo-Json -Compress
  $reader=Join-Path $PSScriptRoot 'release\installer\hourly004\runtime\hourly-status.mjs'
  if(-not(Test-Path -LiteralPath $reader)){$reader=Join-Path $PSScriptRoot 'runtime\hourly-status.mjs'}
  try {
    $reply=@($request | & $script:HourlyNode $reader 2>$null)
    if($LASTEXITCODE -eq 0){$view=($reply -join [Environment]::NewLine)|ConvertFrom-Json;if($view.schemaVersion -eq 'hourly004-status-view-v2'){
      foreach($key in @('availability','latestAttempt','lastSuccess','failureCode','guardReason','lastStage','storageFailure','receiptState','progressObservation','providerFailure','cpuObservation','failureHistory')){$report[$key]=$view.$key}
    }}
  } catch { }
  return [pscustomobject]$report
}
function Assert-HourlyPreviousRelease {
  $expected=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'baseline\previous-release-integrity.json') -Raw|ConvertFrom-Json
  $root=Join-Path $script:HourlySecure $script:HourlyPreviousReleaseName
  $dirs=New-Object 'Collections.Generic.Stack[string]';$dirs.Push($root);$files=New-Object 'Collections.Generic.List[string]'
  while($dirs.Count){$dir=$dirs.Pop();Assert-HourlyUpdate (-not([IO.File]::GetAttributes($dir) -band [IO.FileAttributes]::ReparsePoint)) 'PATH_TYPE_UNEXPECTED';foreach($child in [IO.Directory]::GetDirectories($dir)){$dirs.Push($child)};foreach($child in [IO.Directory]::GetFiles($dir)){$files.Add($child);Assert-HourlyUpdate ($files.Count -le 15000) 'RELEASE_FILE_SET_CHANGED'}}
  Assert-HourlyUpdate ($files.Count -eq $expected.files) 'INSTALLED_BASELINE_REQUIRES_REVIEW'
  $relativeFiles=New-Object 'Collections.Generic.List[string]';foreach($entry in $files){$relativeFiles.Add($entry.Substring($root.Length+1).Replace('\','/'))}
  $ordered=$relativeFiles.ToArray();[Array]::Sort($ordered,[StringComparer]::Ordinal)
  $hash=[Security.Cryptography.SHA256]::Create();$tree=[Security.Cryptography.SHA256]::Create()
  try {
    foreach($relative in $ordered){$integrity=Get-HourlyFileIntegrity (Join-Path $root $relative) $hash;$record=[Text.Encoding]::UTF8.GetBytes($relative+[char]0+$integrity+[char]10);[void]$tree.TransformBlock($record,0,$record.Length,$null,0)}
    [void]$tree.TransformFinalBlock([byte[]]@(),0,0)
    Assert-HourlyUpdate ([BitConverter]::ToString($tree.Hash).Replace('-','') -ceq $expected.integrity) 'INSTALLED_BASELINE_REQUIRES_REVIEW'
  } finally {$hash.Dispose();$tree.Dispose()}
}
function Invoke-HourlyUpdateController([scriptblock]$OnPhase={}) {
  if($Action -eq 'Status'){return Get-HourlySafeStatus}
  if($Action -eq 'Recover'){return Invoke-HourlyInstallRecovery $OnPhase}
  Assert-HourlyQuiet
  $inspection=Get-HourlyInstallationInspection
  Assert-HourlyUpdate ($inspection.state -eq 'idle') 'INSTALLATION_REQUIRES_RECOVERY_REVIEW'
  $state=Get-HourlyInstalledState
  Assert-HourlyUpdate ($state -in @('checkpoint-v4-installed','cpu-v5-installed')) 'INSTALLED_BASELINE_REQUIRES_REVIEW'
  $target=Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'
  $expectedPointer=if($state -eq 'checkpoint-v4-installed'){Join-Path $PSScriptRoot 'baseline\previous-launcher.mjs'}else{Join-Path $PSScriptRoot 'runtime\hourly-complete-launcher.mjs'}
  $pinnedPredecessor=Get-HourlyLauncherImage $target ([IO.File]::ReadAllBytes($expectedPointer))
  Assert-HourlyPreviousRelease
  Assert-HourlyInstalledSource
  if($Action -eq 'Preflight'){
    Assert-HourlyRelease (Join-Path $PSScriptRoot 'release')
    $null=Get-HourlyDefinitionSnapshot
    return [pscustomobject]@{status='preflight-passed';installation=$state;configurationChanged=$false;taskDefinitionsChanged=$false;productionEntryInvoked=$false;guardBudgetMs=12000;newRecoveryEnabled=$false}
  }
  & $OnPhase 'preflight-validated'
  Assert-HourlyUpdate ([bool]$ReleaseApproved) 'RELEASE_APPROVAL_REQUIRED'
  $transactionId=[guid]::NewGuid().ToString('N')
  $lock=Open-HourlyInstallLock $transactionId $Action $pinnedPredecessor.Permissions
  $transactionContext=@{Id=$transactionId;Direction=$Action;Owner=$lock.Owner;Lock=@{identity=$lock.Identity;digest=(Get-HourlyInstallDigest $lock.Bytes);sddl=$lock.Permissions}}
  try{
    $before=Get-HourlyDefinitionSnapshot
    $target=Join-Path $script:HourlySecure 'hourly-complete-launcher.mjs'
    if($Action -eq 'Update'){
      if($state -eq 'cpu-v5-installed'){
        Assert-HourlyRelease (Join-Path $script:HourlySecure $script:HourlyReleaseName)
        $installedHandle=[Hourly004LockedFile]::new($target)
        try{Assert-HourlyLauncherImage $installedHandle $target $pinnedPredecessor}finally{$installedHandle.Dispose()}
        Close-HourlyInstallLock $lock;$lock=$null
        return Get-HourlySafeStatus
      }
      $source=Join-Path $PSScriptRoot 'release';Assert-HourlyRelease $source
      $release=Join-Path $script:HourlySecure $script:HourlyReleaseName
      Assert-HourlyUpdate (-not(Test-Path -LiteralPath $release)) 'EXISTING_RELEASE_REQUIRES_REVIEW'
      $watch=[Diagnostics.Stopwatch]::StartNew()
      $null=New-Item -ItemType Directory -Path $release
      $stagingObserved=$false
      foreach($file in @(Get-ChildItem -LiteralPath $source -File -Recurse -Force)){
        Assert-HourlyUpdate ($watch.Elapsed.TotalSeconds -lt 90) 'STAGING_BUDGET_EXHAUSTED'
        $relative=$file.FullName.Substring($source.Length).TrimStart('\');$destination=Join-Path $release $relative
        $null=New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force
        [IO.File]::Copy($file.FullName,$destination,$false)
        if(-not $stagingObserved){$stagingObserved=$true;& $OnPhase 'staging'}
      }
      Assert-HourlyRelease $release;Assert-HourlyQuiet
      $candidate=Join-Path $PSScriptRoot 'runtime\hourly-complete-launcher.mjs'
      & $OnPhase 'before-switch'
      Invoke-HourlyLauncherTransaction $target $candidate (Join-Path $script:HourlySecure $script:HourlyPointerBackup) {Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot)} {Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot)} -ExpectedImage $pinnedPredecessor -OnPhase $OnPhase -TransactionContext $transactionContext
    }else{
      Assert-HourlyUpdate ($state -eq 'cpu-v5-installed') 'ROLLBACK_REFUSED_NOT_OWN_INSTALLATION'
      $original=Join-Path $script:HourlySecure $script:HourlyPointerBackup
      Assert-HourlyUpdate (Test-HourlyBytes ([IO.File]::ReadAllBytes($original)) ([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'baseline\previous-launcher.mjs')))) 'ORIGINAL_BACKUP_UNVERIFIED'
      & $OnPhase 'rollback-candidate-validated'
      & $OnPhase 'before-switch'
      Invoke-HourlyLauncherTransaction $target $original (Join-Path $script:HourlySecure ('cpu-v5-rollback-'+$transactionId+'.mjs')) {Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot)} {Assert-HourlyDefinitionsEqual $before (Get-HourlyDefinitionSnapshot)} -ExpectedImage $pinnedPredecessor -OnPhase $OnPhase -TransactionContext $transactionContext
    }
    Close-HourlyInstallLock $lock;$lock=$null
    return Get-HourlySafeStatus
  }finally{Close-HourlyInstallLock $lock}
}
. (Join-Path $PSScriptRoot 'hourly004-install-recovery.ps1')
if($MyInvocation.InvocationName -ne '.'){
  try{Invoke-HourlyUpdateController | ConvertTo-Json -Depth 8}
  catch{
    $allowed=@('HOST_OR_TIMEZONE_MISMATCH','EXISTING_ADMIN_REQUIRED','PATH_TYPE_UNEXPECTED','PROTECTED_STATE_CHANGED','PROTECTED_PERMISSIONS_CHANGED','TASK_DEFINITION_OR_PERMISSIONS_CHANGED','FULL_SYNC_NOT_QUIET','HOURLY_NOT_QUIET','HOURLY_PRINCIPAL_OR_LIMIT_CHANGED','PROCESS_IDENTITY_UNREADABLE','EXISTING_AGENT_WORK','OUTBOX_LOCK_HELD','GUARD_CHILD_REQUIRES_REVIEW','CPU_NOT_VERIFIED_BELOW_70','BACKUP_ALREADY_EXISTS','PENDING_UPDATE_REQUIRES_REVIEW','ACTIVATION_VERIFY_FAILED','ROLLBACK_REFUSED_FOREIGN_CHANGE','ROLLBACK_VERIFY_FAILED','RELEASE_MANIFEST_INVALID','RELEASE_INTEGRITY_FAILED','RELEASE_FILE_SET_CHANGED','INSTALLED_BASELINE_REQUIRES_REVIEW','INSTALLED_SOURCE_REQUIRES_REVIEW','RELEASE_APPROVAL_REQUIRED','EXISTING_RELEASE_REQUIRES_REVIEW','STAGING_BUDGET_EXHAUSTED','ROLLBACK_REFUSED_NOT_OWN_INSTALLATION','ORIGINAL_BACKUP_UNVERIFIED','PREDECESSOR_CHANGED','PREDECESSOR_PIN_REQUIRED','TRANSACTION_RENAME_REFUSED','TRANSACTION_FILE_BUSY','TRANSACTION_FILE_UNAVAILABLE')
    $exception=$_.Exception;$reason=$null
    while($null -ne $exception){if($exception.Message -in ($allowed+@('ACCESS_DENIED','PATH_NOT_FOUND'))){$reason=$exception.Message};$exception=$exception.InnerException}
    if($null -eq $reason){$reason=Get-HourlyInstallSafeReason $_;if($reason -eq 'INSTALL_EVIDENCE_UNAVAILABLE'){$reason=if($_.Exception -is [IO.FileNotFoundException] -or $_.Exception -is [Management.Automation.ItemNotFoundException]){'PATH_NOT_FOUND'}elseif($_.Exception.Message -in @('RECOVERY_EVIDENCE_UNVERIFIED','INSTALLATION_REQUIRES_RECOVERY_REVIEW')){$_.Exception.Message}else{'UPDATE_UNAVAILABLE_DETAILS_WITHHELD'}}}
    [pscustomobject]@{status='stopped';reason=$reason;detailsWithheld=$true;productionEntryInvoked=$false}|ConvertTo-Json -Compress
    exit 1
  }
}
