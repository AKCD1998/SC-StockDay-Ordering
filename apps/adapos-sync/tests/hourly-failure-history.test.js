import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createHourlyStatusStore,readHourlyDurableState,inspectHourlyStatus,STATUS_BOUNDS} from '../src/hourlyStatusStore.js';
import {FAILURE_HISTORY_BOUNDS,boundedFailureHistory,safeHistoricalFailure} from '../src/hourlyFailureHistory.js';
const at=(hour,minute=0)=>new Date(Date.UTC(2026,9,28,hour-7,minute)).toISOString();
const slot=hour=>String(hour).padStart(2,'0')+':00';
const success={status:'captured-and-acknowledged',slot:'08:00',expectedProducts:6835,observedProducts:6835,readBatchCount:35,backendAcceptedRecords:6835,outboxPending:0,finishedAt:at(8,2)};
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hourly-history-'));t.after(()=>{const p=path.resolve(dir);assert.ok(p.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(p).startsWith('hourly-history-'));fs.rmSync(p,{recursive:true,force:true});});return path.join(dir,'status.json');}
async function failed(file,hour,extras={}){const store=createHourlyStatusStore(file,{now:()=>at(hour,2)});store.begin({slot:slot(hour),startedAt:at(hour)});const result=await store.finish({slot:slot(hour),inspectionTime:at(hour),finishedAt:at(hour,1),status:'launch-stopped',failure:{code:'HOURLY_SOURCE_GUARD_UNAVAILABLE',guard:{stage:'cpu',reason:'CPU_UNAVAILABLE',elapsedMs:9905,budgetMs:12000,...extras}},diagnostics:{events:[{stage:'cpu-provider',kind:'failure'}]}});await store.close();return result;}
async function succeeded(file,hour,viewIo){const store=createHourlyStatusStore(file,{now:()=>at(hour,2),...(viewIo?{viewIo}:{})});store.begin({slot:slot(hour),startedAt:at(hour)});const capturedAt=at(hour,1);store.acknowledge({ack:{accepted:6835,branchCode:'004',capturedAt},payload:{branchCode:'004',records:Array.from({length:6835},()=>({})),plannedSlot:slot(hour),capturedAt,idempotencyKey:'a'.repeat(64)},remainingMs:60000});const result=await store.finish({...success,slot:slot(hour),inspectionTime:at(hour),finishedAt:at(hour,2)});await store.close();return result;}

test('failed guard survives a later successful run and restart without confusing history with current status',async t=>{
 const file=fixture(t);await failed(file,9);const result=await succeeded(file,11);assert.equal(result.status,'captured-and-acknowledged');assert.equal(result.recentFailures[0].slot,'09:00');
 const status=inspectHourlyStatus(file,{now:at(11,3),latestTaskStartedAt:at(11),taskRunning:false});assert.equal(status.latestAttempt.status,'captured-and-acknowledged');assert.equal(status.guardReason,null);assert.equal(status.failureHistory.records[0].guard.reason,'CPU_UNAVAILABLE');assert.equal(status.failureHistory.availability,'verified');assert.equal(status.failureHistory.coversAllAttempts,false);assert.equal(status.lastSuccess.slot,'11:00');
});
test('two earlier failures remain readable when the latest attempt is running or its display is unreadable',async t=>{
 const file=fixture(t);await failed(file,9);await failed(file,10);const result=await succeeded(file,11,{...fs.promises,rename:async()=>{throw Object.assign(new Error('PRIVATE'),{code:'EACCES'});}});assert.equal(result.status,'status-unavailable');
 const status=inspectHourlyStatus(file,{now:at(11,3),latestTaskStartedAt:at(11),taskRunning:false});assert.equal(status.latestAttempt.status,'unknown');assert.deepEqual(status.failureHistory.records.map(x=>x.slot),['09:00','10:00']);assert.equal(status.lastSuccess.slot,'11:00');
});
test('native error codes are whitelisted and private error fields never enter durable history',async t=>{
 const file=fixture(t);await failed(file,9,{providerFailure:{exceptions:[{type:'Microsoft.Management.Infrastructure.CimException',hresult:-2146233088,cimStatusCode:1,message:'PRIVATE',TargetObject:'PRIVATE'}],category:'OperationTimeout',qualifiedErrorIdParts:['HRESULT 0x80338029','PRIVATE'],raw:'PRIVATE'},raw:'PRIVATE'});
 const status=inspectHourlyStatus(file,{now:at(10)}),record=status.failureHistory.records[0];assert.equal(record.guard.providerFailure.exceptions[0].hresult,-2146233088);assert.deepEqual(record.guard.providerFailure.qualifiedErrorIdParts,['HRESULT 0x80338029']);assert.ok(!JSON.stringify(status).includes('PRIVATE'));for(const name of fs.readdirSync(path.dirname(file)))if(name.includes('.receipt-'))assert.ok(!fs.readFileSync(path.join(path.dirname(file),name),'utf8').includes('PRIVATE'));
});
test('history is bounded inside both receipt and display limits and keeps the newest retained failures',async t=>{
 const file=fixture(t);for(let h=9;h<=19;h++)await failed(file,h);const values=readHourlyDurableState(file).state.recentFailures;assert.equal(values.length,8);assert.equal(values[0].slot,'12:00');assert.equal(values.at(-1).slot,'19:00');assert.ok(Buffer.byteLength(JSON.stringify(values))<=FAILURE_HISTORY_BOUNDS.bytes);for(const suffix of ['.receipt-0.json','.receipt-1.json'])assert.ok(fs.statSync(file+suffix).size<=STATUS_BOUNDS.receiptBytes);
});
test('a torn inactive receipt preserves the earlier verified history and never claims full history coverage',async t=>{
 const file=fixture(t);await failed(file,9);await failed(file,10);const before=readHourlyDurableState(file);fs.writeFileSync(file+'.receipt-'+before.index+'.json','{');const after=readHourlyDurableState(file);assert.ok(after.state);assert.equal(after.state.recentFailures[0].slot,'09:00');const status=inspectHourlyStatus(file,{now:at(11)});assert.equal(status.failureHistory.availability,'unknown');assert.deepEqual(status.failureHistory.records,[]);
});
test('legacy v4 receipts do not invent missing historical causes',async t=>{
 const file=fixture(t);await failed(file,9);for(const suffix of ['.receipt-0.json','.receipt-1.json']){const target=file+suffix;const envelope=JSON.parse(fs.readFileSync(target,'utf8')),body=JSON.parse(envelope.body);delete body.recentFailures;delete body.failureHistoryIncomplete;envelope.body=JSON.stringify(body);envelope.digest=createHash('sha256').update(envelope.body).digest('hex');fs.writeFileSync(target,JSON.stringify(envelope));}
 const status=inspectHourlyStatus(file,{now:at(10)});assert.equal(status.failureHistory.availability,'not-recorded-by-predecessor');assert.deepEqual(status.failureHistory.records,[]);
});
test('unsafe or malformed historical records cannot turn into stock certification or leak arbitrary values',()=>{
 assert.equal(safeHistoricalFailure({slot:'09:00',raw:'PRIVATE'}),null);assert.deepEqual(boundedFailureHistory({message:'PRIVATE'}),[]);const record=safeHistoricalFailure({sequence:1,slot:'09:00',startedAt:at(9),finishedAt:at(9,1),status:'launch-stopped',code:'PRIVATE',raw:'PRIVATE',observedProducts:null});assert.equal(record.code,'HOURLY_OPERATION_FAILED_DETAILS_WITHHELD');assert.equal(record.observedProducts,undefined);assert.ok(!JSON.stringify(record).includes('PRIVATE'));
});
test('maximum bounded native error chains fit the existing receipt budget even after a later ACK',async t=>{
 const file=fixture(t),providerFailure={exceptions:Array.from({length:4},()=>({type:'Microsoft.Management.Infrastructure.CimException',hresult:-2146233088,cimStatusCode:1,nativeErrorCode:2147749894})),category:'OperationTimeout',qualifiedErrorIdParts:Array.from({length:4},()=> 'Microsoft.Management.Infrastructure.CimCmdlets.GetCimInstanceCommand'),additionalInnerException:true,validation:'CPU_SAMPLE_STALE'};
 for(let h=9;h<=16;h++)await failed(file,h,{providerFailure});await succeeded(file,17);const state=readHourlyDurableState(file).state;assert.equal(state.lastSuccess.slot,'17:00');assert.ok(state.recentFailures.length>0&&state.recentFailures.length<=8);assert.equal(state.recentFailures.at(-1).slot,'16:00');for(const suffix of ['.receipt-0.json','.receipt-1.json'])assert.ok(fs.statSync(file+suffix).size<=STATUS_BOUNDS.receiptBytes);
});
