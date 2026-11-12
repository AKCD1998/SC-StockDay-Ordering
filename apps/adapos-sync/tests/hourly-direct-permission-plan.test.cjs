'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
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
 assert.equal(plan.queue.path,base+String.raw`\hourly-evidence-outbox\004`);assert.equal(plan.queue.directoryMask,0xA1);assert.equal(plan.queue.directoryInheritance,'None');assert.equal(plan.queue.childMetadataMask,0x80);assert.equal(plan.queue.childMetadataMask&1,0);assert.equal(plan.queue.childMetadataMask&2,0);assert.equal(plan.queue.childInheritance,'ContainerInherit,ObjectInherit,InheritOnly');assert.equal(plan.queue.payloadReadGranted,false);
 assert.equal(plan.ancestorMetadataMask,0xA0);assert.equal(plan.ancestorMetadataMask&1,0);assert.equal(plan.ancestorInheritance,'None');assert.equal(plan.metadataDirectories.length,4);assert.ok(plan.metadataDirectories.every(p=>p.startsWith(String.raw`C:\ProgramData\SC-StockDay-Ordering`)));assert.ok(!JSON.stringify(plan).includes('*'));
});
