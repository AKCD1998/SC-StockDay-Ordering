import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createHourlyStatusStore,inspectHourlyStatus as inspectStatus,readHourlyDurableState,STATUS_BOUNDS} from '../src/hourlyStatusStore.js';
const inspectHourlyStatus=(file,options={})=>inspectStatus(file,{now:'2026-10-24T08:03:00.000Z',taskRunning:false,...options});
import {createHourlyAttemptDiagnostics} from '../src/hourlyAttemptDiagnostics.js';
import {createHourlyGuard,HOURLY_GUARD_BUDGET_MS} from '../src/hourlyGuardProcess.js';
import {EventEmitter} from 'node:events';

const here=path.dirname(fileURLToPath(import.meta.url));
const prior={status:'captured-and-acknowledged',expectedProducts:6835,observedProducts:6835,readBatchCount:35,backendAcceptedRecords:6835,outboxPending:0,slot:'14:00',finishedAt:'2026-10-24T07:02:08.830Z'};
const start='2026-10-24T08:00:02.000Z',end='2026-10-24T08:02:00.000Z';
const summary={...prior,slot:'15:00',inspectionTime:start,finishedAt:end};
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hourly-checkpoint-'));t.after(()=>{const absolute=path.resolve(dir);assert.ok(absolute.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(absolute).startsWith('hourly-checkpoint-'));fs.rmSync(absolute,{recursive:true,force:true});});const file=path.join(dir,'status.json');fs.writeFileSync(file,JSON.stringify(prior));return {dir,file};}
const ack={accepted:6835,branchCode:'004',capturedAt:'2026-10-24T08:01:59.000Z',captureId:'1',duplicate:false};
const payload={branchCode:'004',records:Array.from({length:6835},()=>({})),plannedSlot:'15:00',capturedAt:ack.capturedAt,idempotencyKey:'a'.repeat(64)};
function acknowledge(store){store.acknowledge({ack,payload,remainingMs:60000});}
function ioFault(stage,code,failCount=Infinity){let calls=0;return {...fs.promises,[stage]:async(...args)=>{calls++;if(calls<=failCount)throw Object.assign(new Error('DO-NOT-OUTPUT'),{code,path:'DO-NOT-OUTPUT'});return fs.promises[stage](...args);},calls:()=>calls};}

test('transient rename failure retries the same display operation and clears current failure after success',async t=>{
  const f=fixture(t),io=ioFault('rename','EPERM',1),store=createHourlyStatusStore(f.file,{viewIo:io});store.begin({slot:'15:00',startedAt:start});acknowledge(store);
  const result=await store.finish(summary);await store.close();
  assert.equal(result.status,'captured-and-acknowledged');assert.equal(io.calls(),2);assert.equal(result.statusPersistence.currentlyUnavailable,false);assert.equal(result.statusPersistence.everFailed,true);assert.equal(result.statusPersistence.retryCount,1);assert.equal(result.statusPersistence.lastFailure.code,'EPERM');assert.equal(result.statusPersistence.lastFailure.category,'rename-access-or-contention');
  const disk=JSON.parse(fs.readFileSync(f.file,'utf8'));assert.equal(disk.statusPersistence.currentlyUnavailable,false);assert.ok(!JSON.stringify(result).includes('DO-NOT-OUTPUT'));
});
test('permanent rename failure is bounded, reports unknown current view, and retains a genuine durable success',async t=>{
  const f=fixture(t),io=ioFault('rename','EPERM'),store=createHourlyStatusStore(f.file,{viewIo:io});store.begin({slot:'15:00',startedAt:start});acknowledge(store);const result=await store.finish(summary);await store.close();
  assert.equal(io.calls(),STATUS_BOUNDS.attempts);assert.equal(result.status,'status-unavailable');assert.equal(result.captureOutcome,'captured-and-acknowledged');assert.equal(result.lastAttemptComplete,false);assert.ok(result.statusPersistence.spentMs<STATUS_BOUNDS.totalIoMs);
  const status=inspectHourlyStatus(f.file,{latestTaskStartedAt:start,taskRunning:false});assert.equal(status.latestAttempt.status,'unknown');assert.equal(status.latestAttempt.backendAcceptedRecords,null);assert.equal(status.lastSuccess.slot,'15:00');assert.equal(status.lastSuccess.status,'captured-and-acknowledged');assert.ok(!JSON.stringify(status).includes(payload.idempotencyKey));
});
for(const code of ['ENOSPC','EACCES'])test(`display ${code} disables only display writes and does not retry a permanent storage error`,async t=>{
  const f=fixture(t),io=ioFault('open',code),store=createHourlyStatusStore(f.file,{viewIo:io});store.begin({slot:'15:00',startedAt:start});acknowledge(store);const result=await store.finish(summary);await store.close();assert.equal(io.calls(),1);assert.equal(result.captureOutcome,'captured-and-acknowledged');assert.equal(result.status,'status-unavailable');assert.equal(result.statusPersistence.lastFailure.code,code);assert.equal(result.statusPersistence.retryCount,0);
});
test('retry delay and storage time spend the same total budget and never cause an extra attempt after exhaustion',async t=>{
  const f=fixture(t);let clock=0,calls=0;const store=createHourlyStatusStore(f.file,{monotonic:()=>clock,remainingMs:()=>300-clock,wait:async ms=>{clock+=ms},viewIo:{lstat:async()=>({isFile:()=>true,isSymbolicLink:()=>false,nlink:1}),open:async()=>({writeFile:async()=>{},sync:async()=>{},close:async()=>{}}),rename:async()=>{calls++;clock+=150;throw Object.assign(new Error('fixture'),{code:'EPERM'});}}});
  store.begin({slot:'15:00',startedAt:start});acknowledge(store);const result=await store.finish(summary);await store.close();assert.equal(calls,2);assert.equal(result.statusPersistence.retryCount,1);assert.equal(result.status,'status-unavailable');assert.equal(clock,310);
});
test('diagnostic checkpoint failure is current state, with a separate historical failure count',()=>{
  let attempts=0;const d=createHourlyAttemptDiagnostics({checkpoint:()=>{if(++attempts===1)throw new Error('fixture')}});d.observe({stage:'sql-batch',kind:'start'});assert.equal(d.snapshot().persistenceFailed,true);d.observe({stage:'sql-batch',kind:'success'});assert.equal(d.snapshot().persistenceFailed,false);assert.equal(d.snapshot().everPersistenceFailed,true);assert.equal(d.snapshot().checkpointFailures,1);
});
test('restart after unfinished attempt retains prior success and rejects a stale completed display',async t=>{
  const f=fixture(t),first=createHourlyStatusStore(f.file);first.begin({slot:'15:00',startedAt:start});await first.close();
  const second=createHourlyStatusStore(f.file);second.begin({slot:'16:00',startedAt:'2026-10-24T09:00:02.000Z'});const view=inspectHourlyStatus(f.file,{latestTaskStartedAt:'2026-10-24T09:00:02.000Z',taskRunning:true});assert.equal(view.latestAttempt.status,'unknown');assert.equal(view.lastSuccess.slot,'14:00');await second.close();
});
test('a torn inactive receipt snapshot cannot erase the last committed success across restart',async t=>{
  const f=fixture(t),first=createHourlyStatusStore(f.file);first.begin({slot:'15:00',startedAt:start});acknowledge(first);await first.finish(summary);await first.close();
  const handles=new Set();const broken={...fs,openSync:(file,...args)=>{const fd=fs.openSync(file,...args);if(/\.receipt-[01]\.json$/.test(file))handles.add(fd);return fd;},writeFileSync:(fd,data,...args)=>{if(handles.has(fd)){fs.writeSync(fd,Buffer.from(data).subarray(0,20));throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'EIO'});}return fs.writeFileSync(fd,data,...args);}};
  const failed=createHourlyStatusStore(f.file,{io:broken});assert.throws(()=>failed.begin({slot:'16:00',startedAt:'2026-10-24T09:00:02.000Z'}),{code:'HOURLY_RECEIPT_PERSISTENCE_FAILED'});await failed.close();
  const restored=createHourlyStatusStore(f.file);restored.begin({slot:'16:00',startedAt:'2026-10-24T09:00:02.000Z'});assert.equal(readHourlyDurableState(f.file).state.lastSuccess.slot,'15:00');await restored.close();
});
test('receipt access denial stops before collection; no identity change or retry is attempted',async t=>{
  const f=fixture(t);let denied=0;const io={...fs,openSync:(file,...args)=>{if(/\.receipt-[01]\.json$/.test(file)){denied++;throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'EACCES'});}return fs.openSync(file,...args);}};
  const store=createHourlyStatusStore(f.file,{io});assert.throws(()=>store.begin({slot:'15:00',startedAt:start}),error=>error.code==='HOURLY_RECEIPT_PERSISTENCE_FAILED'&&error.storageFailure.code==='EACCES'&&error.storageFailure.stage==='receipt-open');assert.equal(denied,1);await store.close();
});

test('an unreadable old display does not stop critical work or overwrite an unseen historical success',async t=>{
  const f=fixture(t),original=fs.readFileSync(f.file),io={...fs,readFileSync:(file,...args)=>{if(file===f.file)throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'EACCES'});return fs.readFileSync(file,...args);}};
  const store=createHourlyStatusStore(f.file,{io});store.begin({slot:'15:00',startedAt:start});acknowledge(store);const result=await store.finish(summary);await store.close();assert.equal(result.captureOutcome,'captured-and-acknowledged');assert.equal(result.status,'status-unavailable');assert.equal(result.statusPersistence.lastFailure.stage,'status-read');assert.deepEqual(fs.readFileSync(f.file),original);assert.equal(inspectHourlyStatus(f.file,{latestTaskStartedAt:start}).lastSuccess.slot,'15:00');
});

test('a final critical receipt failure stops safely and never manufactures a completed current view',async t=>{
  const f=fixture(t),handles=new Set();let syncs=0;const io={...fs,openSync:(file,...args)=>{const fd=fs.openSync(file,...args);if(/\.receipt-[01]\.json$/.test(file))handles.add(fd);return fd;},closeSync:fd=>{handles.delete(fd);return fs.closeSync(fd);},fsyncSync:fd=>{if(handles.has(fd)&&++syncs===3)throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'ENOSPC'});return fs.fsyncSync(fd);}};
  const store=createHourlyStatusStore(f.file,{io});store.begin({slot:'15:00',startedAt:start});acknowledge(store);await assert.rejects(store.finish(summary),error=>error.code==='HOURLY_RECEIPT_PERSISTENCE_FAILED'&&error.storageFailure.stage==='receipt-sync'&&error.storageFailure.code==='ENOSPC');await store.close();assert.equal(inspectHourlyStatus(f.file,{latestTaskStartedAt:start}).latestAttempt.status,'unknown');assert.equal(JSON.parse(fs.readFileSync(f.file,'utf8')).slot,'14:00');
});
test('duplicate acknowledgement does not create a second durable acknowledgement generation',async t=>{
  const f=fixture(t),store=createHourlyStatusStore(f.file);store.begin({slot:'15:00',startedAt:start});acknowledge(store);const generation=readHourlyDurableState(f.file).state.generation;acknowledge(store);assert.equal(readHourlyDurableState(f.file).state.generation,generation);await store.close();
});

test('Status rejects stale, future, mismatched and unverified legacy attempt evidence without borrowing durable labels',async t=>{
  const f=fixture(t),store=createHourlyStatusStore(f.file);store.begin({slot:'15:00',startedAt:start});acknowledge(store);await store.finish(summary);await store.close();
  const success={...summary,slot:'16:00',inspectionTime:'2026-10-24T09:00:12.000Z',finishedAt:'2026-10-24T09:02:00.000Z'};fs.writeFileSync(f.file,JSON.stringify(success));
  const options={legacyMode:true,now:'2026-10-24T09:03:00.000Z',latestTaskStartedAt:'2026-10-24T09:00:02.000Z',taskRunning:false};const valid=inspectHourlyStatus(f.file,options);assert.equal(valid.latestAttempt.slot,'16:00');assert.equal(valid.latestAttempt.finishedAt,success.finishedAt);assert.equal(valid.lastSuccess.slot,'16:00');
  for(const override of [{now:'2026-10-24T11:03:00.000Z'},{now:'2026-10-24T09:01:00.000Z'},{latestTaskStartedAt:null},{taskRunning:null},{latestTaskStartedAt:'2026-10-24T10:00:02.000Z'}]){const view=inspectHourlyStatus(f.file,{...options,...override});assert.equal(view.latestAttempt.status,'unknown');assert.equal(view.latestAttempt.slot,null);assert.equal(view.latestAttempt.finishedAt,null);assert.equal(view.latestAttempt.backendAcceptedRecords,null);}
  fs.writeFileSync(f.file,JSON.stringify({...success,slot:'17:00'}));assert.equal(inspectHourlyStatus(f.file,options).latestAttempt.status,'unknown');
});
test('a blocked asynchronous display operation does not postpone the guard deadline',async t=>{
  const f=fixture(t);let releaseRename,entered;const enteredPromise=new Promise(resolve=>{entered=resolve});const pending=new Promise(resolve=>{releaseRename=resolve});const store=createHourlyStatusStore(f.file,{viewIo:{...fs.promises,rename:async(...args)=>{entered();await pending;return fs.promises.rename(...args);}}});store.begin({slot:'15:00',startedAt:start});store.offer({status:'starting',slot:'15:00',inspectionTime:start});await enteredPromise;
  const child=new EventEmitter();child.pid=123;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stderr.resume=()=>{};child.kill=()=>{setImmediate(()=>child.emit('close',1));return true};
  const guard=createHourlyGuard({platform:'win32',executable:'fixture',script:'fixture',spawnProcess:()=>child});const started=performance.now();await assert.rejects(guard({remainingMs:40}),error=>error.guardSummary.reason==='DEADLINE'&&error.guardSummary.budgetMs===40);assert.ok(performance.now()-started<1000);assert.equal(HOURLY_GUARD_BUDGET_MS,12000);releaseRename();await store.close();
});

test('a stalled native display operation reaches its deadline, starts no further I/O, and retains its lease until settled',async t=>{
  const f=fixture(t);let unblock,calls=0;const blocked=new Promise(resolve=>{unblock=resolve});
  const store=createHourlyStatusStore(f.file,{viewIo:{...fs.promises,open:async(...args)=>{calls++;await blocked;return fs.promises.open(...args);}}});
  store.begin({slot:'15:00',startedAt:start});acknowledge(store);const started=performance.now();const result=await store.finish(summary);await store.close();
  assert.ok(performance.now()-started<3500);assert.equal(result.status,'status-unavailable');assert.equal(result.statusPersistence.lastFailure.code,'STATUS_IO_DEADLINE');assert.equal(result.statusPersistence.retryCount,0);assert.equal(result.statusPersistence.ioPending,1);assert.equal(calls,1);assert.ok(fs.existsSync(f.file+'.receipt-lock'));
  assert.equal(inspectHourlyStatus(f.file,{latestTaskStartedAt:start}).latestAttempt.status,'unknown');
  unblock();for(let i=0;i<100&&store.snapshot().ioPending;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(store.snapshot().ioPending,0);assert.ok(!fs.existsSync(f.file+'.receipt-lock'));assert.equal(JSON.parse(fs.readFileSync(f.file,'utf8')).slot,'14:00');
});

function readyChild(child){return new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(new Error('Fixture child readiness unavailable.')),5000);child.stdout.on('data',data=>{text+=data;if(text.includes('READY')){clearTimeout(timeout);resolve();}});child.once('error',()=>{clearTimeout(timeout);reject(new Error('Fixture child unavailable.'));});child.once('exit',()=>{clearTimeout(timeout);if(!text.includes('READY'))reject(new Error('Fixture exited before ready.'));});});}
function childClosed(child){return child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>child.once('close',resolve));}
for(const deleteSharing of [false,true])test(`Windows native held reader, delete sharing ${deleteSharing}: bounded writer and truthful current status`,{skip:process.platform!=='win32'},async t=>{
  const f=fixture(t),script=path.join(f.dir,'reader.ps1');fs.writeFileSync(script,`param([string]$TargetPath)\n$share=[IO.FileShare]::ReadWrite\n${deleteSharing?'$share=$share -bor [IO.FileShare]::Delete':''}\n$stream=[IO.File]::Open($TargetPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,$share)\ntry{[Console]::Out.WriteLine('READY');[Console]::Out.Flush();while(-not [IO.File]::Exists($TargetPath+'.release')){[Threading.Thread]::Sleep(25)}}finally{$stream.Dispose()}\n`);
  const reader=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',script,'-TargetPath',f.file],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  let released=false;t.after(async()=>{if(!released){const done=childClosed(reader);fs.writeFileSync(f.file+'.release','1');await done;}});await readyChild(reader);
  const store=createHourlyStatusStore(f.file);store.begin({slot:'15:00',startedAt:start});acknowledge(store);const started=performance.now();const result=await store.finish(summary);await store.close();assert.ok(performance.now()-started<3500);assert.ok(result.statusPersistence.retryCount<=2);assert.equal(result.lastSuccess.slot,'15:00');
  if(!deleteSharing)assert.equal(result.status,'status-unavailable');
  const view=inspectHourlyStatus(f.file,{latestTaskStartedAt:start,taskRunning:false});assert.equal(view.latestAttempt.status,result.status==='status-unavailable'?'unknown':'captured-and-acknowledged');
  if(result.status==='status-unavailable'){assert.equal(result.statusPersistence.lastFailure.stage,'status-rename');assert.ok(['EPERM','EBUSY','EACCES'].includes(result.statusPersistence.lastFailure.code));}
  t.diagnostic(JSON.stringify({simulation:true,nativeHeldReader:true,deleteSharing,status:result.status,renameFailure:result.statusPersistence.lastFailure?.code??null,retryCount:result.statusPersistence.retryCount}));
  const done=childClosed(reader);fs.writeFileSync(f.file+'.release','1');await done;released=true;
});

test('a real process restart reclaims only its confirmed-dead receipt lease and preserves the previous success',async t=>{
  const f=fixture(t),module=pathToFileURL(path.resolve(here,'../src/hourlyStatusStore.js')).href;
  const script=`import {createHourlyStatusStore} from ${JSON.stringify(module)};const store=createHourlyStatusStore(${JSON.stringify(f.file)});store.begin({slot:'15:00',startedAt:${JSON.stringify(start)}});console.log('READY');process.stdin.resume();`;
  const child=spawn(process.execPath,['--input-type=module','-e',script],{windowsHide:true,stdio:['pipe','pipe','ignore']});await readyChild(child);
  const busy=createHourlyStatusStore(f.file);assert.throws(()=>busy.begin({slot:'16:00',startedAt:'2026-10-24T09:00:02.000Z'}),{code:'HOURLY_RECEIPT_BUSY'});await busy.close();
  const closed=childClosed(child);child.kill();await closed;
  const restarted=createHourlyStatusStore(f.file);restarted.begin({slot:'16:00',startedAt:'2026-10-24T09:00:02.000Z'});assert.equal(readHourlyDurableState(f.file).state.lastSuccess.slot,'14:00');assert.equal(inspectHourlyStatus(f.file,{latestTaskStartedAt:'2026-10-24T09:00:02.000Z'}).latestAttempt.status,'unknown');await restarted.close();
});

test('the real pointer exits only its fixture child on a critical error with outstanding display I/O',t=>{
  const f=fixture(t),source=path.resolve(here,'../installer/hourly004/runtime/hourly-complete-launcher.mjs');
  const helpers=pathToFileURL(path.resolve(here,'../src/hourlyAttemptDiagnostics.js')).href,storage=pathToFileURL(path.resolve(here,'../src/hourlyStatusStore.js')).href;
  const pointer=fs.readFileSync(source,'utf8').replace("'./stability-20261024-checkpoint-v4/installer/hourly004/runtime/hourly-runtime.mjs'","'./runtime-stub.mjs'").replace("'./stability-20261024-checkpoint-v4/src/hourlyAttemptDiagnostics.js'",JSON.stringify(helpers)).replace("'./stability-20261024-checkpoint-v4/src/hourlyStatusStore.js'",JSON.stringify(storage));
  fs.writeFileSync(path.join(f.dir,'pointer.mjs'),pointer);fs.writeFileSync(path.join(f.dir,'runtime-stub.mjs'),`export async function main(){setInterval(()=>{},1000);throw Object.assign(new Error('DO-NOT-OUTPUT'),{code:'HOURLY_RECEIPT_PERSISTENCE_FAILED',hourlyDisplayIoPending:true,storageFailure:{code:'ENOSPC',stage:'receipt-sync'}})}`);
  const child=spawnSync(process.execPath,[path.join(f.dir,'pointer.mjs')],{encoding:'utf8',windowsHide:true,timeout:3000});assert.equal(child.status,1);assert.equal(child.signal,null);const result=JSON.parse(child.stdout);assert.equal(result.status,'launch-stopped');assert.equal(result.failure.code,'HOURLY_RECEIPT_PERSISTENCE_FAILED');assert.equal(result.failure.storageFailure.code,'ENOSPC');assert.ok(!child.stdout.includes('DO-NOT-OUTPUT'));
});

function makeControllerFixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hourly-controller-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(dir).startsWith('hourly-controller-'));fs.rmSync(dir,{recursive:true,force:true});});
  const source=path.resolve(here,'../installer/hourly004'),pkg=path.join(dir,'package');fs.mkdirSync(pkg,{recursive:true});
  const put=(relative,contents)=>{const name=path.join(dir,relative);fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,contents);};
  for(const name of ['hourly004-update.ps1','hourly004-install-recovery.ps1','baseline/hourly-complete-launcher.mjs','baseline/runtime-core.mjs','baseline/runtime-guard.ps1','baseline/previous-launcher.mjs','runtime/hourly-complete-launcher.mjs'])put('package/'+name,fs.readFileSync(path.join(source,name)));
  put('app/.env','FIXTURE_ONLY=1');put('app/package-lock.json','{"fixture":true}');put('app/src/fixture.js','// fixture source');
  const hash=data=>createHash('sha256').update(data).digest('hex').toUpperCase();
  put('package/baseline/installed-source-manifest.json',JSON.stringify({files:[{path:'fixture.js',integrity:hash('// fixture source')}]}));
  for(const secure of ['secure','fault-secure']){
    put(secure+'/hourly-complete-launcher.mjs',fs.readFileSync(path.join(source,'baseline/previous-launcher.mjs')));
    for(const name of ['runtime-core.mjs','runtime-guard.ps1'])put(secure+'/'+name,fs.readFileSync(path.join(source,'baseline',name)));
    put(secure+'/approved-cohort-fixture.json','{"fixture":true}');put(secure+'/latest-slot-result.json',JSON.stringify({...prior,inspectionTime:'2026-10-24T07:00:02.000Z'}));put(secure+'/stability-20261024/marker.txt','old release fixture');
  }
  const previous=hash('marker.txt\0'+hash('old release fixture')+'\n');put('package/baseline/previous-release-integrity.json',JSON.stringify({files:1,integrity:previous}));
  for(const name of ['hourly-status.mjs'])put('package/release/installer/hourly004/runtime/'+name,fs.readFileSync(path.join(source,'runtime',name)));
  put('package/release/src/hourlyStatusStore.js',fs.readFileSync(path.join(here,'../src/hourlyStatusStore.js')));
  put('package/release/installer/hourly004/runtime/hourly-runtime.mjs',`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(path.join(dir,'capture-entry-executed'))},'unexpected');throw new Error('FIXTURE_CAPTURE_FORBIDDEN');`);
  for(let i=0;i<10;i++)put('package/release/marker-'+i+'.txt','fixture');
  const entries=[];function walk(root){for(const item of fs.readdirSync(root,{withFileTypes:true})){const name=path.join(root,item.name);if(item.isDirectory())walk(name);else entries.push({path:path.relative(path.join(pkg,'release'),name).replaceAll('\\','/'),integrity:hash(fs.readFileSync(name))});}}walk(path.join(pkg,'release'));put('package/release-manifest.json',JSON.stringify({files:entries}));
  fs.mkdirSync(path.join(dir,'cache/hourly-evidence-outbox/004'),{recursive:true});
  put('seed-receipt.mjs',`import path from 'node:path';import {createHourlyStatusStore} from './package/release/src/hourlyStatusStore.js';const store=createHourlyStatusStore(path.join(process.argv[2],'latest-slot-result.json'));store.begin({slot:'15:00',startedAt:${JSON.stringify(start)}});store.acknowledge({ack:${JSON.stringify(ack)},payload:{...${JSON.stringify({...payload,records:undefined})},records:Array.from({length:6835},()=>({}))},remainingMs:60000});await store.finish(${JSON.stringify(summary)});await store.close();`);
  return dir;
}
test('Windows PowerShell 5.1 real controller Preflight/Update/Status/Rollback uses isolated filesystem and fixture providers',{skip:process.platform!=='win32'},t=>{
  const dir=makeControllerFixture(t),exe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(here,'hourly-controller-native-fixture.ps1'),'-FixtureRoot',dir],{encoding:'utf8',windowsHide:true,timeout:40000});
  assert.equal(result.status,0,result.stdout||'Native fixture unavailable; details withheld.');const report=JSON.parse(result.stdout.replace(/^\uFEFF/,''));assert.equal(report.realControllerInvoked,true);assert.equal(report.passed,10);assert.equal(report.productionQueries,0);assert.equal(report.productionFilesChanged,0);assert.equal(report.taskRuns,0);
  t.diagnostic(JSON.stringify({simulation:true,nativeController:true,nativePowerShell:report.nativePowerShell,passed:report.passed,failed:report.failed,realControllerInvoked:true,productionQueries:0,productionFilesChanged:0,taskRuns:0}));
});

test('native controller rejects concurrent foreign changes and keeps post-rollback Status in one runtime attempt',{skip:process.platform!=='win32'},t=>{
  const dir=makeControllerFixture(t),exe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(here,'hourly-controller-acceptance-native-fixture.ps1'),'-FixtureRoot',dir],{encoding:'utf8',windowsHide:true,timeout:90000});
  assert.equal(result.status,0,result.stdout||'Native acceptance fixture unavailable; details withheld.');const report=JSON.parse(result.stdout.replace(/^\uFEFF/,''));assert.equal(report.failed,0);assert.equal(report.passed,29);assert.equal(report.nativeHandleRenameInvoked,true);assert.equal(report.productionFilesChanged,0);t.diagnostic(JSON.stringify(report));
});

test('native controller survives its own fixture child crash and recovers only proven installation objects',{skip:process.platform!=='win32'},t=>{
  const dir=makeControllerFixture(t),exe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const seed=spawnSync(process.execPath,[path.join(dir,'seed-receipt.mjs'),path.join(dir,'secure')],{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(seed.status,0,'Synthetic durable receipt seed unavailable.');
  const result=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(here,'hourly-controller-crash-native-fixture.ps1'),'-FixtureRoot',dir],{encoding:'utf8',windowsHide:true,timeout:300000});
  assert.equal(result.status,0,result.stdout||'Native crash fixture unavailable; details withheld.');
  const report=JSON.parse(result.stdout.replace(/^\uFEFF/,''));assert.equal(report.failed,0);assert.ok(report.passed>=31);assert.ok(report.abruptChildProcessTerminations>=25);assert.equal(report.realAbruptChildCrashes,true);assert.equal(report.productionFilesChanged,0);assert.equal(report.taskRuns,0);t.diagnostic(JSON.stringify(report));
});
