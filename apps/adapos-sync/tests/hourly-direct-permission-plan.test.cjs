'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const plan=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/hourly004-direct-read-permissions-20261112.json'),'utf8'));
const base=String.raw`C:\ProgramData\SC-StockDay-Ordering\hourly-stock-evidence-004`;
const secure=base+String.raw`\complete-on-20261022`;
test('permission proposal is inert, bound to the existing native caller and preserves runtime policy',()=>{
 assert.equal(plan.state,'PROPOSED_NOT_APPLIED');assert.equal(plan.targetHost,'SERVER004');assert.equal(plan.existingIdentity,String.raw`SERVER004\CodexSandboxOffline`);assert.equal(plan.requireTrustedNativeSidBinding,true);assert.equal(plan.automaticApply,false);assert.equal(plan.automaticRetry,false);assert.equal(plan.runtimeChanges,false);assert.equal(plan.fullSyncTaskChanges,false);assert.equal(plan.taskFolderAclChanges,false);assert.equal(plan.hourlyGuardBudgetMs,12000);assert.equal(plan.uploadRecoveryEnabled,false);assert.equal(plan.evidenceProfile,'DurableReceipt');
});
test('file and Task grants exclude write execute delete and ownership permissions',()=>{
 const forbidden=2|4|16|32|64|256|65536|262144|524288;
 assert.equal(plan.fileReadMask,0x120089);assert.equal(plan.taskReadMask,0x120089);assert.equal(plan.fileReadMask&forbidden,0);assert.equal(plan.taskReadMask&forbidden,0);assert.equal(plan.fileInheritance,'None');
 assert.deepEqual(plan.readFiles,['latest-slot-result.json.receipt-0.json','latest-slot-result.json.receipt-1.json','hourly-complete-launcher.mjs'].map(n=>secure+'\\'+n));
 assert.deepEqual(plan.taskNames,Array.from({length:11},(_,i)=>`Hourly Stock Evidence (Branch 004) - ${String(i+9).padStart(2,'0')}00`));
});
test('queue grant lists only its own directory and inherits attributes without payload reads',()=>{
 assert.equal(plan.queue.path,base+String.raw`\hourly-evidence-outbox\004`);assert.equal(plan.queue.directoryMask,0x1000A1);assert.equal(plan.queue.directoryInheritance,'None');assert.equal(plan.queue.childMetadataMask,0x100080);assert.equal(plan.queue.childMetadataMask&1,0);assert.equal(plan.queue.childMetadataMask&2,0);assert.equal(plan.queue.childInheritance,'ContainerInherit,ObjectInherit,InheritOnly');assert.equal(plan.queue.payloadReadGranted,false);
 assert.equal(plan.ancestorMetadataMask,0x1000A0);assert.equal(plan.ancestorMetadataMask&1,0);assert.equal(plan.ancestorInheritance,'None');assert.equal(plan.metadataDirectories.length,4);assert.ok(plan.metadataDirectories.every(p=>p.startsWith(String.raw`C:\ProgramData\SC-StockDay-Ordering`)));assert.ok(!JSON.stringify(plan).includes('*'));
});
test('native PS5.1 allow-rule masks and inheritance round-trip in memory without changing an ACL',{skip:process.platform!=='win32'},()=>{
 const cases=[{mask:plan.fileReadMask,inherit:0,propagate:0},{mask:plan.ancestorMetadataMask,inherit:0,propagate:0},{mask:plan.queue.directoryMask,inherit:0,propagate:0},{mask:plan.queue.childMetadataMask,inherit:3,propagate:2}];
 const literal=cases.map(c=>`@{mask=${c.mask};inherit=${c.inherit};propagate=${c.propagate}}`).join(',');
 const script=`$ErrorActionPreference='Stop';$sid=[Security.Principal.SecurityIdentifier]::new('S-1-5-21-111-222-333-1001');$count=0;foreach($c in @(${literal})){$a=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]$c.mask,[Security.AccessControl.InheritanceFlags]$c.inherit,[Security.AccessControl.PropagationFlags]$c.propagate,[Security.AccessControl.AccessControlType]::Allow);if([long]$a.FileSystemRights -ne $c.mask -or [int]$a.InheritanceFlags -ne $c.inherit -or [int]$a.PropagationFlags -ne $c.propagate){throw 'RULE_MASK_CHANGED'};$count++};[pscustomobject]@{simulation=$true;rules=$count;aclWrites=0;sourceReads=0;taskRuns=0}|ConvertTo-Json -Compress`;
 const r=spawnSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(r.status,0,'Native rule fixture unavailable');const v=JSON.parse(r.stdout.trim());assert.equal(v.rules,4);assert.equal(v.aclWrites,0);assert.equal(v.taskRuns,0);
});
