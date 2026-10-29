import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {reconcileHourlyDelivery,sanitizeControllerObservation} from '../src/hourlyCloudInspection.js';

function fixture(){
 const expectedSlot='2026-10-29T08:00:00.000Z',now='2026-10-29T08:25:00.000Z';
 const controller={schemaVersion:'hourly004-update-status-v3',installation:'cpu-v5-installed',guardBudgetMs:12000,newRecoveryEnabled:false,installationTransaction:{state:'idle'},availability:'published',sourceObservation:{schemaVersion:'hourly004-source-observation-v1',observedAt:now,hostVerified:true,timeZoneVerified:true,taskAccessVerified:true,task:{startedAt:'2026-10-29T08:00:01.000Z',running:false,enabled:true,lastResult:0,definitionVerified:true},sqlQueries:0,taskRuns:0,configurationChanges:0},latestAttempt:{status:'captured-and-acknowledged',slot:'15:00',startedAt:'2026-10-29T08:00:01.000Z',finishedAt:'2026-10-29T08:02:15.000Z',observedProducts:6835,backendAcceptedRecords:6835,outboxPending:0},lastSuccess:{status:'captured-and-acknowledged',slot:'14:00',finishedAt:'2026-10-29T07:02:13.000Z',observedProducts:6835,backendAcceptedRecords:6835,outboxPending:0},queueNow:{pending:0,checkedAt:now}};
 return {expectedSlot,now,controller,deviceAccessVerified:true,central:{readOnlyVerified:true,branchCode:'004',observedAt:now,slot:expectedSlot,captures:1,declaredRecords:6835,actualRows:6835,distinctProducts:6835},journalPersisted:true};
}
test('natural source Task, exact ACK and independent central counts agree; business freshness stays unqualified',()=>{
 const f=fixture(),before=JSON.stringify(f),r=reconcileHourlyDelivery(f);assert.equal(r.status,'PASS');assert.equal(r.reason,'SOURCE_ACK_TASK_AND_CENTRAL_COUNTS_AGREE');assert.equal(r.currentStockCertified,false);assert.equal(r.sourceFreshnessQualified,false);assert.equal(r.clockSynchronizationVerified,false);assert.equal(r.recoveryEnabled,false);assert.equal(JSON.stringify(f),before);
});
test('storage failure does not suppress independent delivery evidence',()=>{const f=fixture();f.journalPersisted=false;const r=reconcileHourlyDelivery(f);assert.equal(r.status,'PASS');assert.equal(r.journalPersisted,false);});
test('cloud device authorization is independent of a payload claiming correct host and task access',()=>{
 for(const centralKnown of [true,false]){const f=fixture();f.deviceAccessVerified=false;if(!centralKnown)f.central=null;const r=reconcileHourlyDelivery(f);assert.equal(r.status,'PARTIAL');assert.equal(r.source.accessReason,'not-authorized');assert.equal(r.source.latestAttempt,null);assert.equal(r.central.captures,centralKnown?1:null);}
});
test('source errors preserve UNKNOWN instead of manufacturing zero captures or quantities',()=>{
 for(const reason of ['access-denied','offline','network-unavailable','not-found','timeout']){const f=fixture();f.controller=null;f.sourceAccessReason=reason;f.central=null;const r=reconcileHourlyDelivery(f);assert.equal(r.status,'PARTIAL');assert.equal(r.central.captures,null);assert.equal(r.source.queuePending,null);}
});
test('fresh read time, host, timezone, controller schema and zero-operation evidence are required',()=>{
 for(const mutate of [f=>f.controller.sourceObservation.observedAt='2026-10-29T08:22:59.999Z',f=>f.controller.sourceObservation.observedAt='2026-10-29T08:25:02.001Z',f=>f.controller.sourceObservation.hostVerified=false,f=>f.controller.sourceObservation.timeZoneVerified=false,f=>f.controller.schemaVersion='unknown',f=>f.controller.sourceObservation.taskRuns=1,f=>f.controller.sourceObservation.sqlQueries=1]){const f=fixture();mutate(f);assert.equal(reconcileHourlyDelivery(f).status,'PARTIAL');}
});
test('last successful slot remains historical and cannot certify a new failed or absent attempt',()=>{
 const f=fixture();f.controller.latestAttempt.status='launch-stopped';f.controller.latestAttempt.observedProducts=null;f.controller.latestAttempt.backendAcceptedRecords=null;f.controller.sourceObservation.task.lastResult=1;f.central={...f.central,captures:0,declaredRecords:0,actualRows:0,distinctProducts:0};const r=reconcileHourlyDelivery(f);assert.equal(r.status,'BLOCKED');assert.equal(r.source.lastSuccess.historicalOnly,true);assert.equal(r.source.latestAttempt.observedProducts,null);assert.equal(r.reason,'SOURCE_ATTEMPT_FAILED');
 f.controller.sourceObservation.task.startedAt='2026-10-29T07:00:01.000Z';assert.equal(reconcileHourlyDelivery(f).reason,'EXPECTED_SOURCE_ATTEMPT_NOT_OBSERVED');
});
test('same-hour evidence from another day, partial rows, stale queue and unknown Task state cannot PASS',()=>{
 for(const mutate of [f=>f.controller.sourceObservation.task.startedAt='2026-10-28T08:00:01.000Z',f=>f.controller.latestAttempt.observedProducts=1400,f=>f.controller.queueNow.pending=1,f=>f.controller.queueNow.pending=null,f=>f.controller.queueNow.checkedAt='2026-10-29T08:22:59.000Z',f=>f.controller.sourceObservation.taskAccessVerified=false,f=>f.controller.sourceObservation.task.running=null,f=>f.controller.availability='unknown']){const f=fixture();mutate(f);assert.notEqual(reconcileHourlyDelivery(f).status,'PASS');}
});
test('Task definition/enablement, guard12 and recovery OFF changes are surfaced without altering them',()=>{
 for(const mutate of [f=>f.controller.sourceObservation.task.definitionVerified=false,f=>f.controller.sourceObservation.task.enabled=false,f=>f.controller.guardBudgetMs=30000,f=>f.controller.newRecoveryEnabled=true]){const f=fixture();mutate(f);const before=JSON.stringify(f);assert.equal(reconcileHourlyDelivery(f).status,'BLOCKED');assert.equal(JSON.stringify(f),before);}
});
test('v4 success is delivery evidence but does not prove installation or natural v5 acceptance',()=>{const f=fixture();f.controller.installation='checkpoint-v4-installed';const r=reconcileHourlyDelivery(f);assert.equal(r.status,'PARTIAL');assert.equal(r.reason,'CPU_V5_NOT_INSTALLED');});
test('running Task waits within20min; overtime blocks without demanding another run or stop',()=>{
 const f=fixture();f.controller.sourceObservation.task.running=true;f.now='2026-10-29T08:10:00.000Z';f.controller.sourceObservation.observedAt=f.now;f.controller.queueNow.checkedAt=f.now;assert.equal(reconcileHourlyDelivery(f).status,'WAITING');f.now='2026-10-29T08:25:00.000Z';f.controller.sourceObservation.observedAt=f.now;const r=reconcileHourlyDelivery(f);assert.equal(r.reason,'SOURCE_TASK_OVERTIME');assert.equal(r.taskRunRequested,false);assert.equal(r.action,'report-only');
});
test('central duplicates and count mismatches cannot be hidden by summing several captures',()=>{
 for(const mutate of [f=>f.central.captures=2,f=>f.central.actualRows=6800,f=>f.central.distinctProducts=6834,f=>f.central.declaredRecords=0,f=>f.central.captures=0]){const f=fixture();mutate(f);assert.equal(reconcileHourlyDelivery(f).status,'BLOCKED');}
});
test('query access, exact slot and integer counts are required; database failure leaves source evidence visible',()=>{
 for(const mutate of [f=>f.central.readOnlyVerified=false,f=>f.central.slot='2026-10-29T07:00:00.000Z',f=>f.central.actualRows='6835',f=>f.central=null]){const f=fixture();mutate(f);const r=reconcileHourlyDelivery(f);assert.equal(r.status,'PARTIAL');assert.equal(r.source.latestAttempt.observedProducts,6835);assert.equal(r.central.actualRows,null);}
});
test('raw diagnostics, credentials, document identities and unknown error text cannot escape the whitelist',()=>{
 const f=fixture(),secret='SYNTHETIC-PRIVATE-NOT-OUTPUT';f.controller.rawEnv=secret;f.controller.latestAttempt.rawLogs=secret;f.controller.failureCode=secret;f.controller.sourceObservation.task.arguments=secret;f.central.captureId=secret;const r=reconcileHourlyDelivery(f);assert.ok(!JSON.stringify(r).includes(secret));assert.equal(r.source.failureCode,'HOURLY_OPERATION_FAILED_DETAILS_WITHHELD');
});
test('invalid future or non-Hourly slot is rejected without a fallback schedule',()=>{
 for(const expectedSlot of ['2026-10-29T20:00:00+07:00','2026-10-29T15:01:00+07:00','2026-10-30T15:00:00+07:00','bad'])assert.throws(()=>reconcileHourlyDelivery({...fixture(),expectedSlot}),TypeError);
});
test('review regression: central branch and query observation time must be bound explicitly',()=>{
 for(const mutate of [f=>f.central.branchCode='001',f=>delete f.central.branchCode,f=>delete f.central.observedAt,f=>f.central.observedAt='2026-10-29T08:22:59.999Z',f=>f.central.observedAt='2026-10-29T08:25:02.001Z']){const f=fixture();mutate(f);assert.notEqual(reconcileHourlyDelivery(f).status,'PASS');}
});
test('review regression: a central snapshot taken before source completion requests a fresh read, not a missing-delivery verdict',()=>{
 const f=fixture();f.now='2026-10-29T08:03:00.000Z';f.controller.sourceObservation.observedAt=f.now;f.controller.queueNow.checkedAt=f.now;f.central.observedAt='2026-10-29T08:02:00.000Z';Object.assign(f.central,{captures:0,declaredRecords:0,actualRows:0,distinctProducts:0});
 const r=reconcileHourlyDelivery(f);assert.equal(r.status,'PARTIAL');assert.equal(r.reason,'CENTRAL_OBSERVATION_PRECEDES_SOURCE_COMPLETION');
 f.central.observedAt=f.now;Object.assign(f.central,{captures:1,declaredRecords:6835,actualRows:6835,distinctProducts:6835});assert.equal(reconcileHourlyDelivery(f).status,'PASS');
});
test('review regression: timezone-free source timestamps cannot inherit the checker timezone',()=>{
 const f=fixture(),d=new Date(f.now),pad=x=>String(x).padStart(2,'0');
 f.controller.sourceObservation.observedAt=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
 assert.notEqual(reconcileHourlyDelivery(f).status,'PASS');
});
test('review regression: an alleged success exceeding Task20min cannot be certified',()=>{
 const f=fixture();f.controller.latestAttempt.finishedAt='2026-10-29T08:23:00.000Z';assert.notEqual(reconcileHourlyDelivery(f).status,'PASS');
});
test('review regression: a successful status with a current failure code is contradictory evidence',()=>{
 const f=fixture();f.controller.failureCode='HOURLY_SOURCE_GUARD_UNAVAILABLE';assert.notEqual(reconcileHourlyDelivery(f).status,'PASS');
});
test('native PS5.1 timezone-explicit fractional timestamps remain accepted while normalized impossible dates are rejected',()=>{
 const f=fixture();f.controller.sourceObservation.observedAt='2026-10-29T08:25:00.0000000+00:00';f.controller.sourceObservation.task.startedAt='2026-10-29T08:00:01.0000000+00:00';f.controller.latestAttempt.startedAt='2026-10-29T15:00:01.0000000+07:00';f.controller.latestAttempt.finishedAt='2026-10-29T15:02:15.0000000+07:00';f.controller.queueNow.checkedAt='2026-10-29T15:25:00.0000000+07:00';assert.equal(reconcileHourlyDelivery(f).status,'PASS');
 assert.throws(()=>reconcileHourlyDelivery({...fixture(),expectedSlot:'2026-02-30T15:00:00+07:00',now:'2026-03-02T15:25:00+07:00'}),TypeError);
});
test('stdin adapter is bounded, handles invalid input safely and outputs no raw payload',()=>{
 const cli=fileURLToPath(new URL('../scripts/reconcile-hourly004-cloud.mjs',import.meta.url));
 const valid=spawnSync(process.execPath,[cli],{input:JSON.stringify(fixture()),encoding:'utf8'});assert.equal(valid.status,0);assert.equal(JSON.parse(valid.stdout).status,'PASS');
 for(const input of ['{PRIVATE-INVALID',JSON.stringify({private:'X'.repeat(70000)})]){const r=spawnSync(process.execPath,[cli],{input,encoding:'utf8'});assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).reason,'INPUT_UNVERIFIED');assert.ok(!r.stdout.includes('PRIVATE-INVALID'));}
});
test('native PowerShell5.1 Task projection checks real controller function with read-only simulated COM providers',{skip:process.platform!=='win32'},()=>{
 const script=fileURLToPath(new URL('./hourly-cloud-native-fixture.ps1',import.meta.url));
 const r=spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-ExecutionPolicy','RemoteSigned','-File',script],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout.trim());assert.equal(v.nativePowerShell51,true);assert.equal(v.productionChanges,false);assert.equal(v.taskRuns,0);assert.ok(v.checks>=40);
});
