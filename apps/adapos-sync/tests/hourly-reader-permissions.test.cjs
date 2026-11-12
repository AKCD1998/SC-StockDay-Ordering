'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const setup=path.join(__dirname,'../scripts/Set-Hourly004ReaderPermissions.ps1'),source=fs.readFileSync(setup,'utf8');
test('permission setup has only fixed local scope and no identity/security-policy or business action surface',()=>{
 assert.match(source,/ValidateSet\('Plan','Apply','Status','Rollback'\)/);assert.match(source,/\[switch\]\$ApproveReadScope/);assert.match(source,/WRONG_EXECUTION_HOST/);assert.match(source,/LOCAL_ADMINISTRATOR_REQUIRED/);
 assert.doesNotMatch(source,/Set-ExecutionPolicy|sandbox_permissions|danger-full-access|RunAs|New-LocalUser|Add-LocalGroupMember|RegisterTaskDefinition|Register-ScheduledTask|\.RunEx?\(|\.Stop\(|Invoke-Command|Start-Service|Set-Service|net use|Invoke-Sqlcmd|mssql|dotenv|Connect\([^)]*[^\s)]\)/i);
 assert.match(source,/SetSecurityDescriptor\(\$dacl,16\)/);assert.match(source,/SetSecurityInfo/);assert.match(source,/FileOptions\]::WriteThrough/);
});
test('native PS5.1 Apply Status Rollback and crash/error cases operate on fixtures only',{skip:process.platform!=='win32'},()=>{
 const exe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const r=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(__dirname,'hourly-reader-permissions-native.ps1'),'-Setup',setup],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1000000});
 let v;try{v=JSON.parse(r.stdout.trim())}catch{assert.fail('Safe permission fixture output unavailable')}
 assert.equal(r.status,0,JSON.stringify(v));assert.equal(v.failed,0);assert.ok(v.passed>=20);assert.equal(v.productionPermissionWrites,0);assert.equal(v.taskRuns,0);assert.equal(v.runtimePolicyChanges,0);console.log(JSON.stringify(v));
 if(process.env.COMPUTERNAME?.toUpperCase()!=='SERVER004'){
  const wrong=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',setup,'-Action','Apply','-ApproveReadScope'],{encoding:'utf8',windowsHide:true,timeout:5000});const p=JSON.parse(wrong.stdout.trim());assert.equal(p.status,'STOPPED_BEFORE_PERMISSION_CHANGE');assert.equal(p.errorCode,'WRONG_EXECUTION_HOST');
 }
});
