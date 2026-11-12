'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const probe=path.join(__dirname,'../scripts/Inspect-Hourly004TaskNamespaceAccess.ps1'),source=fs.readFileSync(probe,'utf8');
test('namespace audit has a fixed context and no permission, identity or business mutation surface',()=>{
 assert.match(source,/SERVER004\\CodexSandboxOffline/);assert.match(source,/\[Environment\]::MachineName/);assert.match(source,/CONTEXT_GATE/);assert.match(source,/\$r\.adminToken -or \$r\.threadImpersonationDetected\)/);assert.match(source,/tokenBasis='process-primary'/);assert.match(source,/INTEROP_SIGNATURE_UNVERIFIED/);
 assert.match(source,/\[Type\[\]\]\$parameterTypes/);assert.doesNotMatch(source,/\[Type\[\]\]\$args/);
 assert.doesNotMatch(source,/Add-Type|DefineDynamicModule\([^)]*,|ImpersonateLoggedOnUser|SetThreadToken|AdjustTokenPrivileges|SetSecurityDescriptor|SetSecurityInfo|SetAccessControl|Set-ExecutionPolicy|WriteAllText|WriteAllBytes|New-LocalUser|Register-ScheduledTask|Invoke-Command|\.Run\(/i);
 assert.deepEqual([...source.matchAll(/^AddNative '([^']+)'/gm)].map(x=>x[1]),['OpenProcessToken','DuplicateToken','IsTokenRestricted','AccessCheck','MapGenericMask']);
});
test('native PS5.1 reproduces legacy zero-parameter bug and checks fixed query-only bindings',{skip:process.platform!=='win32'},()=>{
 const exe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const r=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(__dirname,'hourly-namespace-access-native.ps1'),'-Probe',probe],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:65536});
 let v;try{v=JSON.parse(r.stdout.trim())}catch{assert.fail('Native fixture result unavailable')}
 assert.equal(r.status,0);assert.equal(v.passed,true);assert.equal(v.legacyOpenProcessTokenParameterCount,0);assert.equal(v.fixedOpenProcessTokenParameterCount,3);assert.equal(v.signatureCount,5);assert.equal(v.syntheticChecks.length,8);assert.equal(v.impersonationPerformed,false);assert.equal(v.permissionChanges,0);assert.equal(v.sourceReads,0);assert.equal(v.taskRuns,0);assert.equal(v.sourceFileWrites,0);assert.equal(v.compilerUsed,false);console.log(JSON.stringify(v));
 if(process.env.COMPUTERNAME?.toUpperCase()!=='SERVER004'){
  const wrong=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',probe],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:16384});const gate=JSON.parse(wrong.stdout.trim());assert.equal(gate.status,'BLOCKED');assert.equal(gate.failedStage,'context');assert.equal(gate.hostVerified,false);assert.equal(gate.permissionChanges,0);assert.equal(gate.nativeReadAdmissionEstablished,false);assert.equal(gate.isTokenRestricted,null);
 }
});
