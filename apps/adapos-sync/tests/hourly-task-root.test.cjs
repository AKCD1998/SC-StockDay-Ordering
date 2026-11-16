'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const script=path.join(__dirname,'../scripts/Set-Hourly004TaskRootRead.ps1'),source=fs.readFileSync(script,'utf8');
test('root-only permission operator has no task, identity, business or descendant mutation surface',()=>{
 assert.match(source,/ValidateSet\('Plan','Apply','Status','Rollback'\)/);assert.match(source,/EXPLICIT_ROOT_READ_APPROVAL_REQUIRED/);assert.match(source,/NATIVE_PS51_X64_REQUIRED/);assert.match(source,/SERVER004\\CodexSandboxOffline/);
 assert.match(source,/\$missing=129 -band/);assert.match(source,/AceFlags\]::None/);assert.match(source,/write\?0x02000000u:0x20080u/);assert.match(source,/SetSecurityInfo\(handle,1,4,/);assert.match(source,/ROOT_PERMISSION_READBACK_DIFFER/);assert.match(source,/FOREIGN_ROOT_PERMISSION_CHANGE/);
 assert.doesNotMatch(source,/SetSecurityDescriptor\(|RegisterTask|Register-ScheduledTask|\.RunEx?\(|\.Stop\(|Set-ExecutionPolicy|Invoke-Command|New-LocalUser|Add-LocalGroupMember|AdjustTokenPrivileges|SetThreadToken|ImpersonateLoggedOnUser|Start-Service|Set-Service|mssql|Invoke-Sqlcmd|SetNamedSecurityInfo|TreeSet|TreeReset/i);
});
test('native PS5.1 root Apply Status Rollback, faults and actual disposable directory API',{skip:process.platform!=='win32'},()=>{
 const exe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const run=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(__dirname,'hourly-task-root-native.ps1'),'-Setup',script],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:200000});
 let result;try{result=JSON.parse(run.stdout.trim())}catch{assert.fail('Root fixture result unavailable')}
 assert.equal(run.status,0,JSON.stringify(result));assert.equal(result.failed,0);assert.ok(result.passed>=27);assert.equal(result.productionPermissionWrites,0);assert.equal(result.taskRuns,0);console.log(JSON.stringify(result));
 if(process.env.COMPUTERNAME?.toUpperCase()!=='SERVER004'){
  const gate=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',script,'-Action','Apply','-ApproveReadScope'],{encoding:'utf8',windowsHide:true,timeout:5000});const v=JSON.parse(gate.stdout.trim());assert.equal(v.status,'STOPPED_BEFORE_ROOT_PERMISSION_WRITE');assert.equal(v.errorCode,'WRONG_EXECUTION_HOST');assert.equal(v.permissionWriteAttempted,false);
 }
});
