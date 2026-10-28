import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readHourlyCompleteCohort} from '../src/hourlyCompleteCohort.js';
import {HOURLY_SOURCE_COUNTERS} from '../src/hourlyStockSource.js';
import {runHourlyStockIntraday,replayHourlyEvidence} from '../src/hourlyStockRunner.js';
import {createHourlyAttemptDiagnostics,safeHourlyDiagnostic} from '../src/hourlyAttemptDiagnostics.js';
import {createHourlyUploadRecovery} from '../src/hourlyUploadRecovery.js';
import {createHourlyGuardLease} from '../src/hourlyGuardLease.js';
import {createStatusWriter,runObservedHourly004,pendingCount} from '../installer/hourly004/runtime/hourly-runtime.mjs';
import {inspectHourlyStatus,readHourlyDurableState} from '../src/hourlyStatusStore.js';
import {enqueueHourlyEvidence} from '../src/hourlyEvidenceStorage.js';

function fixture(t,{missing=0,fault}={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hourly-stability-'));
  t.after(()=>{if(!dir.startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('Unsafe fixture path');fs.rmSync(dir,{recursive:true,force:true});});
  const codes=Array.from({length:6835},(_,i)=>'SYNTHETIC-'+i),manifest=path.join(dir,'manifest.json');
  fs.writeFileSync(manifest,JSON.stringify({schemaVersion:'hourly-approved-cohort-v1',scope:'explicit',productCodes:codes}));
  const config={branchCode:'004',sqlServerUser:'readonly_pilot',apiBaseUrl:'https://example.test',hourlyStockEvidence:{enabled:true,completeCohortEnabled:true,cohortFile:manifest,cacheDir:dir,uploadToken:'synthetic-token'.repeat(4),contentCaptureBranches:new Set()}};
  let elapsed=0,queries=0,reads=0,uploads=0,connects=0,closes=0;
  const now=()=>Date.parse('2026-10-24T04:00:00.000Z')+elapsed;
  const pool={close:async()=>{closes++;},request(){const bound=[];return {input(_k,_t,value){bound.push(value);},cancel(){},async query(text){
    queries++;elapsed++;
    if(text.includes('sys.dm_exec_sessions'))return {recordset:[{session_id:1,cpu_time:queries,reads:queries,writes:0,logical_reads:queries}]};
    if(text.includes(' AS is_admin'))return {recordset:[{machine_name:'SERVER004',database_name:'AdaAcc',database_status:'ONLINE',is_admin:0,is_owner:0,is_writer:0,can_insert:0,can_update:fault==='readonly'?1:0,can_delete:0}]};
    if(text.includes(' AS source_available'))return {recordset:bound.map(product_code=>({product_code,source_available:missing&&product_code===codes.at(-1)?0:1}))};
    assert.fail('The fixture never permits a real product query or unrecognized SQL.');
  }};}};
  const dependencies=observe=>({config,runner:options=>runHourlyStockIntraday({...options,sqlServerConfig:{},runHourlyStockShadow:()=>({}),
    ...(fault==='outbox-full'?{enqueueHourlyEvidence:options=>enqueueHourlyEvidence({...options,io:{...fs,writeFileSync:()=>{throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'ENOSPC',path:'DO-NOT-OUTPUT'});}}})}:{})}),
    connectSql:async()=>{connects++;if(fault==='connect')throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'ELOGIN'});return pool;},
    guard:async()=>{if(fault==='guard')throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'HOST_CPU_AT_OR_ABOVE_70_PERCENT'});return {systemCpuPercent:5};},
    collector:(p,c,options)=>readHourlyCompleteCohort(p,c,{...options,now,monotonic:()=>elapsed,readBatch:async(_p,selected)=>{
      reads++;elapsed++;
      if(fault==='partial'&&reads===2)throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'HOURLY_SOURCE_TIMEOUT'});
      const rows=selected.map(product_code=>({product_code,qty:10,latest_estimated_on_hand:8}));
      return {rows,sourceRead:{...Object.fromEntries(HOURLY_SOURCE_COUNTERS.map(key=>[key,0])),productCount:rows.length,formulaMatchedProducts:rows.length},derivedObservation:{readStartedAt:new Date(now()).toISOString(),readCompletedAt:new Date(now()).toISOString(),records:selected.map(productCode=>({productCode,derivedOnHand:8,reason:'observed-unverified'}))}};
    }}),upload:async({body,maxAttempts})=>{uploads++;assert.equal(maxAttempts,1);const p=JSON.parse(body);if(fault==='upload')throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'ECONNRESET'});return {accepted:p.records.length,branchCode:'004',capturedAt:p.capturedAt,captureId:'1',duplicate:false};}});
  return {dir,config,dependencies,now:()=>new Date(now()).toISOString(),counts:()=>({queries,reads,uploads,connects,closes})};
}

test('protected runtime and real collector/runner produce one complete acknowledged capture with safe stage evidence',async t=>{
  const f=fixture(t),file=path.join(f.dir,'latest-slot-result.json');
  const result=await runObservedHourly004({slot:'11:00',load:async observe=>f.dependencies(observe),writeStatus:createStatusWriter(file),now:f.now,readPending:()=>pendingCount(f.dir)});
  assert.equal(result.status,'captured-and-acknowledged',result.failure?.code);assert.equal(result.observedProducts,6835);assert.equal(result.readBatchCount,35);assert.equal(result.backendAcceptedRecords,6835);assert.equal(result.lastSuccess.observedProducts,6835);assert.equal(result.outboxPending,0);
  assert.deepEqual(f.counts(),{queries:38,reads:35,uploads:1,connects:1,closes:1});
  const stages=new Set(result.diagnostics.events.map(e=>e.stage));for(const name of ['capture-lock','sql-connect','readonly-boundary','sql-batch','payload','outbox-enqueue','upload','acknowledgement'])assert.ok(stages.has(name),name);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC-'));assert.equal(result.recovery.newUploadRecoveryEnabled,false);
});
for(const fault of ['guard','readonly','partial','connect','upload'])test(`protected runtime fault ${fault}: no partial publication and previous success survives`,async t=>{
  const f=fixture(t,{fault}),file=path.join(f.dir,'latest-slot-result.json');
  const prior={status:'captured-and-acknowledged',expectedProducts:6835,observedProducts:6835,readBatchCount:35,backendAcceptedRecords:6835,outboxPending:0,finishedAt:'2026-10-24T03:01:00.000Z',slot:'10:00'};
  fs.writeFileSync(file,JSON.stringify(prior));
  const result=await runObservedHourly004({slot:'11:00',load:async observe=>f.dependencies(observe),writeStatus:createStatusWriter(file,{now:f.now}),now:f.now,readPending:()=>pendingCount(f.dir)});
  assert.equal(result.lastSuccess.slot,'10:00');assert.ok(result.lastSuccess.ageMs>0);assert.equal(result.lastAttemptComplete,false);
  if(fault!=='upload'){assert.equal(f.counts().uploads,0);assert.equal(result.outboxPending,0);assert.equal(result.backendAcceptedRecords,null);}else{assert.equal(result.outboxPending,1);assert.equal(result.acknowledgements,0);}
  if(fault==='connect')assert.equal(f.counts().connects,1);
  const persisted=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(persisted.lastSuccess.slot,'10:00');assert.ok(!JSON.stringify(persisted).includes('DO-NOT-OUTPUT'));
});
test('missing source item is never published by the protected runtime',async t=>{
  const f=fixture(t,{missing:1});const r=await runObservedHourly004({slot:'11:00',load:async observe=>f.dependencies(observe),writeStatus:createStatusWriter(path.join(f.dir,'result.json')),now:f.now,readPending:()=>pendingCount(f.dir)});
  assert.equal(r.status,'stopped-no-partial-capture');assert.equal(f.counts().uploads,0);assert.equal(r.lastSuccess,null);assert.equal(r.outboxPending,0);
});
test('lost acknowledgement and restarted worker keep exactly one payload identity and never reread SQL',async t=>{
  const f=fixture(t,{fault:'upload'});await runObservedHourly004({slot:'11:00',load:async observe=>f.dependencies(observe),writeStatus:createStatusWriter(path.join(f.dir,'result.json')),now:f.now,readPending:()=>pendingCount(f.dir)});
  const folder=path.join(f.dir,'hourly-evidence-outbox','004'),queued=fs.readdirSync(folder).find(n=>n.endsWith('.json')),original=fs.readFileSync(path.join(folder,queued),'utf8');
  let acceptedIdentities=new Set([JSON.parse(original).idempotencyKey]);
  const restarted=createStatusWriter(path.join(f.dir,'result.json'));restarted.begin({slot:'11:00',startedAt:f.now()});
  const r=await replayHourlyEvidence({syncConfig:f.config,persistAcknowledgement:options=>restarted.acknowledge(options),uploadHourlyEvidence:async({body})=>{assert.equal(body,original);const p=JSON.parse(body);acceptedIdentities.add(p.idempotencyKey);return {accepted:6835,branchCode:'004',capturedAt:p.capturedAt,captureId:'1',duplicate:true};}});
  assert.equal(r.pending,0);assert.equal(f.counts().reads,35);assert.equal(acceptedIdentities.size,1);assert.equal(readHourlyDurableState(path.join(f.dir,'result.json')).state.lastAck.key,JSON.parse(original).idempotencyKey);await restarted.close();
});

for(const code of ['ENOSPC','EACCES'])test(`critical acknowledgement receipt ${code} retains the exact outbox body and cannot report success`,async t=>{
  const f=fixture(t),file=path.join(f.dir,'result.json');const handles=new Set();let syncs=0;
  const io={...fs,openSync:(name,...args)=>{const fd=fs.openSync(name,...args);if(/\.receipt-[01]\.json$/.test(name))handles.add(fd);return fd;},closeSync:fd=>{handles.delete(fd);return fs.closeSync(fd);},fsyncSync:fd=>{if(handles.has(fd)&&++syncs===2)throw Object.assign(new Error('DO-NOT-OUTPUT'),{code,path:'DO-NOT-OUTPUT'});return fs.fsyncSync(fd);}};
  const result=await runObservedHourly004({slot:'11:00',load:async observe=>f.dependencies(observe),writeStatus:createStatusWriter(file,{io}),now:f.now,readPending:()=>pendingCount(f.dir)});
  assert.equal(result.status,'pending-or-incomplete');assert.equal(result.lastAttemptComplete,false);assert.equal(result.lastSuccess,null);assert.equal(result.outboxPending,1);assert.equal(result.deliveryFailure.code,'HOURLY_RECEIPT_PERSISTENCE_FAILED');assert.equal(result.deliveryFailure.storageFailure.code,code);assert.equal(result.deliveryFailure.storageFailure.stage,'receipt-sync');assert.equal(f.counts().closes,1);assert.equal(f.counts().uploads,1);
  const folder=path.join(f.dir,'hourly-evidence-outbox','004'),name=fs.readdirSync(folder).find(n=>/^[a-f0-9]{64}\.json$/.test(n)),original=fs.readFileSync(path.join(folder,name),'utf8');
  const restarted=createStatusWriter(file);restarted.begin({slot:'11:00',startedAt:f.now()});let duplicateUploads=0;
  const replay=await replayHourlyEvidence({syncConfig:f.config,persistAcknowledgement:options=>restarted.acknowledge(options),uploadHourlyEvidence:async({body})=>{duplicateUploads++;assert.equal(body,original);const p=JSON.parse(body);return {accepted:6835,branchCode:'004',capturedAt:p.capturedAt,captureId:'1',duplicate:true};}});
  assert.equal(replay.pending,0);assert.equal(duplicateUploads,1);assert.equal(f.counts().reads,35);assert.equal(readHourlyDurableState(file).state.lastAck.accepted,6835);await restarted.close();assert.ok(!JSON.stringify(result).includes('DO-NOT-OUTPUT'));
});

test('critical outbox disk full stops before upload, closes SQL, and exposes only typed stage/code',async t=>{
  const f=fixture(t,{fault:'outbox-full'}),result=await runObservedHourly004({slot:'11:00',load:async observe=>f.dependencies(observe),writeStatus:createStatusWriter(path.join(f.dir,'result.json')),now:f.now,readPending:()=>pendingCount(f.dir)});
  assert.equal(result.status,'stopped-no-partial-capture');assert.equal(result.failure.code,'HOURLY_OUTBOX_PERSISTENCE_FAILED');assert.equal(result.failure.storageFailure.code,'ENOSPC');assert.equal(result.failure.storageFailure.stage,'outbox-write');assert.equal(result.lastSuccess,null);assert.equal(result.outboxPending,0);assert.equal(f.counts().uploads,0);assert.equal(f.counts().closes,1);assert.ok(!JSON.stringify(result).includes('DO-NOT-OUTPUT'));
});

test('critical completion failure with stalled display I/O requests only an own-process exit after source cleanup',async t=>{
  const f=fixture(t),file=path.join(f.dir,'result.json'),handles=new Set();let syncs=0,unblock,entered;
  const started=new Promise(resolve=>{entered=resolve}),blocked=new Promise(resolve=>{unblock=resolve});
  const io={...fs,openSync:(name,...args)=>{const fd=fs.openSync(name,...args);if(/\.receipt-[01]\.json$/.test(name))handles.add(fd);return fd;},closeSync:fd=>{handles.delete(fd);return fs.closeSync(fd);},fsyncSync:fd=>{if(handles.has(fd)&&++syncs===3)throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'ENOSPC'});return fs.fsyncSync(fd);}};
  const store=createStatusWriter(file,{io,viewIo:{...fs.promises,open:async(...args)=>{entered();await blocked;return fs.promises.open(...args);}}});
  await assert.rejects(runObservedHourly004({slot:'11:00',load:async observe=>{await started;return f.dependencies(observe);},writeStatus:store,now:f.now,readPending:()=>pendingCount(f.dir)}),error=>error.code==='HOURLY_RECEIPT_PERSISTENCE_FAILED'&&error.storageFailure.code==='ENOSPC'&&error.hourlyDisplayIoPending===true);
  assert.equal(f.counts().closes,1);assert.equal(f.counts().uploads,1);assert.equal(pendingCount(f.dir),0);assert.equal(store.snapshot().ioPending,1);assert.equal(inspectHourlyStatus(file,{latestTaskStartedAt:f.now()}).latestAttempt.status,'unknown');
  unblock();for(let i=0;i<100&&store.snapshot().ioPending;i++)await new Promise(resolve=>setTimeout(resolve,10));await store.close();assert.equal(store.snapshot().ioPending,0);
});
test('diagnostics are bounded, preserve unknown values and never retain arbitrary child/error/payload fields',()=>{
  let time=0,last;const d=createHourlyAttemptDiagnostics({monotonic:()=>time,maxEvents:3,checkpoint:value=>{last=value;}});
  for(let i=0;i<20;i++){time++;d.observe({stage:'sql-batch',kind:'failure',code:'SECRET',message:'DO-NOT-OUTPUT',records:[{qty:12}],pending:null});}
  assert.equal(d.snapshot().events.length,3);assert.equal(d.snapshot().droppedEvents,17);assert.equal(last.events.length,3);
  assert.equal('pending'in last.events[0],false);assert.equal(safeHourlyDiagnostic({stage:'secret',kind:'failure'}),null);assert.ok(!JSON.stringify(last).includes('DO-NOT-OUTPUT'));
  d.observe({stage:'sql-batch',kind:'start',remainingMs:700});assert.equal(d.snapshot().events.at(-1).remainingMs,700);assert.ok(d.snapshot().events.at(-1).taskRemainingMs>700);
});
test('launch and SQL connection time consume the same fifteen-minute collection budget',async t=>{
  const f=fixture(t);let time=0;
  const r=await runObservedHourly004({slot:'11:00',monotonic:()=>time,now:f.now,writeStatus:createStatusWriter(path.join(f.dir,'result.json')),readPending:()=>pendingCount(f.dir),load:async observe=>{time=900000;return f.dependencies(observe);}});
  assert.equal(r.status,'stopped-no-partial-capture');assert.equal(r.failure.code,'HOURLY_COMPLETE_COHORT_WINDOW_EXCEEDED');assert.equal(f.counts().connects,0);assert.equal(f.counts().uploads,0);
});
test('verified handoff receipt survives an already-overwritten old failure and never replaces newer local success',async t=>{
  const f=fixture(t),file=path.join(f.dir,'status.json');
  const receipt={status:'captured-and-acknowledged',expectedProducts:6835,observedProducts:6835,readBatchCount:35,backendAcceptedRecords:6835,outboxPending:0,slot:'11:00',finishedAt:'2026-10-24T04:01:49.705Z'};
  fs.writeFileSync(file,JSON.stringify({status:'stopped-no-partial-capture'}));
  const write=createStatusWriter(file,{handoffReceipt:receipt,now:()=> '2026-10-24T05:00:00.000Z'});
  write.begin({slot:'12:00',startedAt:'2026-10-24T05:00:00.000Z'});
  const failed=await write.finish({status:'launch-stopped',slot:'12:00',finishedAt:'2026-10-24T05:00:00.000Z'});await write.close();assert.equal(failed.lastSuccess.slot,'11:00');assert.equal(failed.lastSuccess.status,'captured-and-acknowledged');assert.ok(failed.lastSuccess.ageMs>0);
  fs.writeFileSync(file,JSON.stringify({...receipt,slot:'13:00',finishedAt:'2026-10-24T06:01:00.000Z'}));
  const next=createStatusWriter(file,{handoffReceipt:receipt,now:()=> '2026-10-24T05:00:00.000Z'});next.begin({slot:'14:00',startedAt:'2026-10-24T05:00:00.000Z'});const newer=await next.finish({status:'launch-stopped',slot:'14:00',finishedAt:'2026-10-24T05:00:00.000Z'});await next.close();
  assert.equal(newer.lastSuccess.slot,'13:00');assert.equal(newer.lastSuccess.ageMs,null);assert.equal(newer.lastSuccess.timestampInFuture,true);
});
test('a denied display checkpoint does not abort capture and cannot claim the current view is successful',async t=>{
  const f=fixture(t),file=path.join(f.dir,'status.json'),write=createStatusWriter(file,{viewIo:{...fs.promises,rename:async()=>{throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'EACCES'});}}});
  const result=await runObservedHourly004({slot:'11:00',now:f.now,readPending:()=>pendingCount(f.dir),load:async observe=>f.dependencies(observe),writeStatus:write});
  assert.equal(result.status,'status-unavailable');assert.equal(result.captureOutcome,'captured-and-acknowledged');assert.equal(result.lastAttemptComplete,false);assert.equal(f.counts().closes,1);assert.equal(f.counts().reads,35);assert.equal(f.counts().uploads,1);assert.equal(result.statusPersistence.lastFailure.code,'EACCES');
  const status=inspectHourlyStatus(file,{latestTaskStartedAt:'2026-10-24T04:00:00.000Z',taskRunning:false});assert.equal(status.latestAttempt.status,'unknown');assert.equal(status.lastSuccess.slot,'11:00');assert.equal(status.lastSuccess.backendAcceptedRecords,6835);
});
test('an initial guard failure retains its whitelisted stage and failed CPU sample without raw details',async t=>{
  const f=fixture(t);const result=await runObservedHourly004({slot:'11:00',now:f.now,readPending:()=>pendingCount(f.dir),writeStatus:createStatusWriter(path.join(f.dir,'status.json')),load:async()=>{throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'HOURLY_SOURCE_GUARD_UNAVAILABLE',guardSummary:{stage:'cpu',reason:'CPU_LIMIT',elapsedMs:1000,budgetMs:12000,cpuPercent:70,raw:'DO-NOT-OUTPUT'}});}});
  assert.equal(result.failure.guard.cpuPercent,70);assert.equal(result.failure.guard.reason,'CPU_LIMIT');assert.equal(f.counts().connects,0);assert.ok(!JSON.stringify(result).includes('DO-NOT-OUTPUT'));
});
test('review-only recovery retries one explicit reset with original bytes and includes guard/wait in the same budget',async()=>{
  let time=0,calls=0,guards=0;const bodies=[];
  const upload=createHourlyUploadRecovery({enabled:true,monotonic:()=>time,wait:async ms=>{time+=ms;},guard:async()=>{guards++;time+=100;},upload:async options=>{bodies.push(options.body);calls++;if(calls===1){time+=100;throw Object.assign(new Error('private'),{code:'ECONNRESET'});}assert.equal(options.timeoutMs,29300);assert.equal(options.maxAttempts,1);return {accepted:1};}});
  await upload({body:'exact-original',timeoutMs:30000,maxAttempts:1});assert.equal(calls,2);assert.equal(guards,1);assert.deepEqual(bodies,['exact-original','exact-original']);
});
test('disabled recovery, timeout alone, access denial, exhausted budget and CPU stop never cause a second upload',async()=>{
  for(const code of ['HOURLY_EVIDENCE_TIMEOUT','EACCES','HOURLY_EVIDENCE_ACK_INVALID','HOURLY_EVIDENCE_HTTP_ERROR']){let calls=0;const upload=createHourlyUploadRecovery({enabled:true,guard:()=>assert.fail(),upload:async()=>{calls++;throw Object.assign(new Error('private'),{code});}});await assert.rejects(upload({timeoutMs:30000,maxAttempts:1}));assert.equal(calls,1);}
  for(const enabled of [false,true]){let calls=0,time=0;const upload=createHourlyUploadRecovery({enabled,monotonic:()=>time,wait:async()=>{},guard:async()=>{throw Object.assign(new Error('stop'),{code:'HOST_CPU_AT_OR_ABOVE_70_PERCENT'});},upload:async()=>{calls++;throw Object.assign(new Error('private'),{code:'ECONNRESET'});}});await assert.rejects(upload({timeoutMs:30000,maxAttempts:1}));assert.equal(calls,1);}
  let calls=0,time=0;const upload=createHourlyUploadRecovery({enabled:true,monotonic:()=>time,guard:()=>assert.fail(),upload:async()=>{calls++;time=30000;throw Object.assign(new Error('private'),{code:'ECONNRESET'});}});await assert.rejects(upload({timeoutMs:30000,maxAttempts:1}));assert.equal(calls,1);
});
test('guard child lease blocks a live or uncertain orphan across restarts; it only reclaims confirmed dead PIDs',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hourly-lease-'));t.after(()=>{if(!dir.startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('Unsafe fixture path');fs.rmSync(dir,{recursive:true,force:true});});
  const file=path.join(dir,'guard-child.lock'),lease=createHourlyGuardLease(file,{pidAlive:()=>true}).acquire();lease.setChild(123);
  assert.throws(()=>createHourlyGuardLease(file,{pidAlive:()=>true}).acquire(),{code:'CHILD_STILL_RUNNING'});
  assert.throws(()=>createHourlyGuardLease(file,{pidAlive:()=>null}).acquire(),{code:'CHILD_STILL_RUNNING'});
  const recovered=createHourlyGuardLease(file,{pidAlive:()=>false}).acquire();recovered.release();assert.equal(fs.existsSync(file),false);
  fs.writeFileSync(file,'incomplete');assert.throws(()=>createHourlyGuardLease(file).acquire(),{code:'GUARD_LEASE_UNVERIFIED'});
});
test('native Windows PowerShell 5.1 activation, interrupted install, rollback, access denial and foreign-change fixtures',{skip:process.platform!=='win32'},()=>{
  const exe=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const harness=fileURLToPath(new URL('./hourly-update-native-fixture.ps1',import.meta.url));
  const r=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',harness],{encoding:'utf8',windowsHide:true,timeout:20000});
  assert.equal(r.status,0,r.stdout||'Native offline update fixture failed.');const result=JSON.parse(r.stdout.replace(/^\uFEFF/,''));assert.ok(result.passed>=20);assert.equal(result.productionFilesChanged,0);assert.equal(result.taskRuns,0);
});
