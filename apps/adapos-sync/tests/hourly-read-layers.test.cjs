'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const script=path.join(__dirname,'../scripts/Inspect-Hourly004TaskReadLayers.ps1'),source=fs.readFileSync(script,'utf8');
test('Task read layers probe has fixed identity, rights and no permission/profile/business mutation',()=>{
 assert.match(source,/SERVER004\\CodexSandboxOffline/);assert.match(source,/\$r\.threadImpersonation -or -not\$r\.ps64Bit/);assert.match(source,/OpenReadOnly\(\$Path,\$Mask,\[ref\]\$errorCode\)/);
 assert.deepEqual([...source.matchAll(/mask=\[uint32\](\d+)/g)].map(x=>Number(x[1])),[129,8,2147483648]);
 assert.doesNotMatch(source,/SetSecurity|SetAccessControl|Set-ExecutionPolicy|New-LocalUser|ImpersonateLoggedOnUser|SetThreadToken|AdjustTokenPrivileges|Add-Type|\.ReadFile\(|ReadAllBytes|ReadAllText|EnumerateFileSystemEntries|GetTasks\(|GetFolders\(|\.Run\(|RegisterTask|Invoke-Command/i);
 assert.match(source,/GetFolder\(\[string\]\[char\]92\)/);assert.match(source,/taskAdmissionEstablished=\$false/);
 assert.match(source,/\[switch\]\$EvaluateServiceRootRead/);
 assert.match(source,/RegistryRights\]::QueryValues/);assert.match(source,/GetValue\('SD'/);
 assert.doesNotMatch(source,/SetValue\(|CreateSubKey\(|RegistryRights\]::(FullControl|WriteKey)|RegistryKeyPermissionCheck\]::ReadWriteSubTree/);
 assert.match(source,/candidateMask=1/);assert.match(source,/not-RPC-server-token/);
});
test('native PS5.1 bindings/open/close/error are tested on a local disposable directory only',{skip:process.platform!=='win32'},()=>{
 const exe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const run=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(__dirname,'hourly-read-layers-native.ps1'),'-Probe',script],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:16384});
 let value;try{value=JSON.parse(run.stdout.trim())}catch{assert.fail('Read-layer fixture unavailable')}
 assert.equal(run.status,0,JSON.stringify(value));assert.equal(value.signaturesVerified,5);assert.equal(value.serviceRamDecisions,24);assert.equal(value.registryQueries,0);assert.equal(value.checks.length,3);assert.equal(value.missingErrorRetained,true);assert.equal(value.permissionChanges,0);assert.equal(value.compilerUsed,false);
 if(process.env.COMPUTERNAME?.toUpperCase()!=='SERVER004'){
  const wrong=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',script],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:16384});const gate=JSON.parse(wrong.stdout.trim());assert.equal(gate.hostMatched,false);assert.equal(gate.failedStage,'context');assert.equal(gate.rootMetadataRead,false);assert.equal(gate.comCreated,false);assert.equal(gate.permissionChanges,0);
 }
});
