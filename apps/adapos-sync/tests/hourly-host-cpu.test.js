import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {safeProviderFailure,validCpuMeasurement,safeCpuEvidence,safeCpuObservation} from '../src/hourlyGuardEvidence.js';
import {safeHourlyGuardSummary} from '../src/hourlyGuardProcess.js';
import {safeHourlyDiagnostic,createHourlyAttemptDiagnostics} from '../src/hourlyAttemptDiagnostics.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const cpu=()=>({provider:'windows-system-times-v1',hostWide:true,rawSamples:2,groups:1,processors:4,PercentProcessorTime:5,startedMs:1000,endedMs:2000,windowMs:1000,ageMs:0});
test('CPU evidence requires fresh host scope, warm-up interval and the same clock after guard entry',()=>{
 assert.equal(validCpuMeasurement(cpu(),2000,5,1000),true);
 for(const fields of [{provider:'cim'},{hostWide:false},{rawSamples:1},{groups:2},{processors:0},{processors:65},{windowMs:999},{windowMs:1501},{startedMs:999},{startedMs:NaN},{endedMs:2001},{endedMs:0},{ageMs:1001},{ageMs:-1},{PercentProcessorTime:null},{PercentProcessorTime:Infinity},{PercentProcessorTime:-1},{PercentProcessorTime:101}])assert.equal(Boolean(validCpuMeasurement({...cpu(),...fields},2000,5,1000)),false);
 assert.equal(validCpuMeasurement(cpu(),3000,5,1000),true);assert.equal(validCpuMeasurement(cpu(),3001,5,1000),false);assert.equal(validCpuMeasurement(cpu(),2000,4,1000),false);
});
test('safe provider errors retain actual bounded codes and strip all arbitrary content',()=>{
 const raw={exceptions:Array.from({length:6},()=>({type:'Microsoft.Management.Infrastructure.CimException',hresult:-2146233088,nativeErrorCode:5,cimStatusCode:2,message:'DO-NOT-OUTPUT',stack:'DO-NOT-OUTPUT',TargetObject:'DO-NOT-OUTPUT'})),category:'PermissionDenied',qualifiedErrorIdParts:['HRESULT 0x80338029','Microsoft.Management.Infrastructure.CimCmdlets.GetCimInstanceCommand','DO-NOT-OUTPUT'],additionalInnerException:true,validation:'CPU_SAMPLE_INVALID',raw:'DO-NOT-OUTPUT'};
 const safe=safeProviderFailure(raw);assert.equal(safe.exceptions.length,4);assert.equal(safe.exceptions[0].hresult,-2146233088);assert.equal(safe.exceptions[0].nativeErrorCode,5);assert.equal(safe.exceptions[0].cimStatusCode,2);assert.equal(safe.qualifiedErrorIdParts.length,2);assert.equal(safe.additionalInnerException,true);assert.ok(!JSON.stringify(safe).includes('DO-NOT-OUTPUT'));
 assert.equal(safeProviderFailure({exceptions:[{type:'DO-NOT-OUTPUT',hresult:0}]}),null);
 assert.equal(safeProviderFailure({exceptions:[{type:'System.Exception',hresult:'DO-NOT-OUTPUT'}]}),null);
 const summary=safeHourlyGuardSummary({stage:'cpu',reason:'CPU_UNAVAILABLE',elapsedMs:10,budgetMs:12000,providerFailure:raw});assert.deepEqual(summary.providerFailure,safe);
 const event=safeHourlyDiagnostic({stage:'cpu-provider',kind:'failure',providerFailure:raw});assert.deepEqual(event.providerFailure,safe);
 const d=createHourlyAttemptDiagnostics();d.observe(event);const snap=d.snapshot();snap.events[0].providerFailure.exceptions[0].message='DO-NOT-OUTPUT';assert.ok(!JSON.stringify(d.snapshot()).includes('DO-NOT-OUTPUT'));
});
test('sampling metadata is safe historical evidence at the guard, not a reusable current CPU sample',()=>{
 const observation=safeCpuEvidence(cpu(),2100);assert.equal(observation.ageMsAtGuard,100);assert.equal(observation.windowMs,1000);assert.equal(observation.rawSamples,2);assert.equal(observation.startedMs,undefined);assert.equal(observation.endedMs,undefined);
 const event=safeHourlyDiagnostic({stage:'cpu-provider',kind:'success',cpuObservation:{...observation,raw:'DO-NOT-OUTPUT'}});assert.deepEqual(event.cpuObservation,observation);assert.ok(!JSON.stringify(event).includes('DO-NOT-OUTPUT'));
 assert.equal(safeCpuObservation({...observation,ageMsAtGuard:1001}),null);assert.equal(safeCpuObservation({...observation,provider:'cim'}),null);
 assert.equal(validCpuMeasurement(observation,2100,5),false);
});
test('native PS5.1 CPU math, timeout, invalid, stale, warm-up and budget fault fixtures use no real CPU reads',{skip:process.platform!=='win32'},t=>{
 const exe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const r=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(here,'hourly-host-cpu-native-fixture.ps1')],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,r.stdout||'Safe native fixture unavailable.');
 const report=JSON.parse(r.stdout.replace(/^\uFEFF/,''));assert.equal(report.failed,0);assert.equal(report.passed,33);assert.equal(report.productionCpuReads,0);assert.equal(report.productionQueries,0);t.diagnostic(JSON.stringify(report));
});
test('Windows Node hrtime and .NET Stopwatch share the child deadline clock without a CPU read',{skip:process.platform!=='win32'},()=>{
 const exe=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),start=Number(process.hrtime.bigint())/1e6,deadline=start+12000;
 const r=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(here,'hourly-qpc-child-fixture.ps1'),'-MonotonicDeadlineMs',String(deadline)],{encoding:'utf8',windowsHide:true,timeout:5000}),end=Number(process.hrtime.bigint())/1e6;
 assert.equal(r.status,0,'Safe clock fixture unavailable.');const value=JSON.parse(r.stdout.replace(/^\uFEFF/,''));assert.equal(value.highResolution,true);assert.ok(value.qpcMs>=start&&value.qpcMs<=end);assert.ok(Math.abs(value.deadlineMs-deadline)<0.001);
});
