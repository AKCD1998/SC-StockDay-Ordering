import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHourlyGuard, safeHourlyGuardSummary } from "../src/hourlyGuardProcess.js";

function fixture(extra = {}) {
  const child = new EventEmitter();child.stdout = new PassThrough();child.stderr = new PassThrough();
  let kills = 0, duration = 0, deadline, timer, spawns = 0;
  child.kill = () => { kills++;queueMicrotask(() => child.emit("close", null));return true; };
  const guard = createHourlyGuard({ platform: "win32", executable: "fixture", script: "fixture.ps1", observerProcessId: 321,
    now: () => duration, setTimer: (callback, ms) => { deadline = ms;timer = callback;return 1; }, clearTimer: () => {},
    spawnProcess: (exe, args, options) => { spawns++;assert.equal(exe, "fixture");assert.ok(args.includes("321"));assert.equal(options.windowsHide, true);return child; }, ...extra,
  });
  return { child, guard, advance: ms => { duration += ms; }, deadline: () => deadline, expire: () => timer(), kills: () => kills, spawns: () => spawns,
    send: value => child.stdout.write(JSON.stringify({ schemaVersion: "hourly-source-guard-v2", elapsedMs: duration, ...value }) + "\r\n"),
    ready: (extra = {}) => child.stdout.write(JSON.stringify({ schemaVersion: "hourly-source-guard-v2", kind: "result", stage: "complete", elapsedMs: duration,
      status: "ready", hostVerified: true, existingWorkQuiet: true, cpuBelowThreshold: true, systemCpuPercent: 5, ...extra }) + "\r\n"),
  };
}
const reasonIs = reason => error => error.code === "HOURLY_SOURCE_GUARD_UNAVAILABLE" && error.guardSummary?.reason === reason;

test("diagnostics preserve the installed twelve-second deadline and reject slow startup", async () => {
  const f = fixture(), promise = f.guard();assert.equal(f.deadline(), 12000);
  f.advance(12000);f.expire();
  await assert.rejects(promise,error=>reasonIs("DEADLINE")(error)&&error.guardSummary.stage==="starting");assert.equal(f.spawns(),1);assert.equal(f.kills(),1);
  const g=fixture(),q=g.guard();g.advance(1000);g.send({kind:"progress",stage:"host"});g.advance(1800);g.ready();g.child.emit("close",0);
  assert.equal((await q).guardElapsedMs,2800);
});
test("remaining collection budget wins over the guard ceiling; expired budget never spawns", async () => {
  const f=fixture(), promise=f.guard({remainingMs:950});assert.equal(f.deadline(),950);f.send({kind:"progress",stage:"cpu"});f.advance(950);f.expire();
  await assert.rejects(promise,error=>reasonIs("DEADLINE")(error)&&error.guardSummary.stage==="cpu");assert.equal(f.spawns(),1);assert.equal(f.kills(),1);
  const g=fixture();await assert.rejects(g.guard({remainingMs:0}),reasonIs("BUDGET_EXHAUSTED"));assert.equal(g.spawns(),0);
});
for (const [stage,reason] of [["host","HOST_UNVERIFIED"],["tasks","FULL_SYNC_BUSY"],["processes","PROCESS_UNREADABLE"],["processes","ACCESS_DENIED"],["cpu","CPU_LIMIT"],["cpu","CPU_UNREADABLE"],["cpu","CPU_UNAVAILABLE"],["cpu","PROVIDER_TIMEOUT"]]) {
  test(`${reason} stops once without retry or raw output`,async()=>{
    const f=fixture(), promise=f.guard();f.send({kind:"progress",stage});f.send({kind:"result",stage,status:"guard-stopped",reason,privateMessage:"DO-NOT-OUTPUT"});f.child.emit("close",1);
    await assert.rejects(promise,error=>{assert.ok(!JSON.stringify(error).includes("DO-NOT-OUTPUT"));return reasonIs(reason)(error);});assert.equal(f.spawns(),1);
  });
}
test("startup error and child exit are distinguished from a valid guard result",async()=>{
  const f=fixture(),p=f.guard();f.child.emit("error",new Error("SECRET"));await assert.rejects(p,reasonIs("START_FAILED"));
  const g=fixture(),q=g.guard();g.child.emit("close",1);await assert.rejects(q,reasonIs("CHILD_EXIT"));
});
test("a child that does not close still aborts after the bounded termination grace",async()=>{
  const f=fixture();f.child.kill=()=>false;const p=f.guard({remainingMs:100});
  f.send({kind:"progress",stage:"processes"});f.advance(100);f.expire();assert.equal(f.deadline(),2000);f.advance(2000);f.expire();
  await assert.rejects(p,reasonIs("DEADLINE"));assert.equal(f.spawns(),1);
});
test("malformed, oversized, duplicate and incomplete output fail closed",async()=>{
  for(const variant of ["invalid","null","primitive","array","stream-error","large","duplicate","incomplete"]) {
    const f=fixture(),promise=f.guard();
    if(variant==="invalid") f.child.stdout.write("DO-NOT-OUTPUT\n");
    if(variant==="null") f.child.stdout.write("null\n");
    if(variant==="primitive") f.child.stdout.write("1\n");
    if(variant==="array") f.child.stdout.write("[]\n");
    if(variant==="stream-error") f.child.stdout.emit('error',new Error('DO-NOT-OUTPUT'));
    if(variant==="large") f.child.stdout.write("x".repeat(8193));
    if(variant==="duplicate"){f.ready();f.ready();}
    if(variant==="incomplete") f.send({kind:"progress",stage:"cpu"});
    f.child.emit("close",0);
    await assert.rejects(promise,reasonIs(variant==="large"?"OUTPUT_LIMIT":variant==="incomplete"?"READY_UNVERIFIED":"INVALID_OUTPUT"));
  }
});
test('a kill permission error retains the bounded cleanup timer and never approves or retries the child',async()=>{
  const f=fixture();f.child.pid=444;f.child.kill=()=>{queueMicrotask(()=>f.child.emit('error',new Error('DO-NOT-OUTPUT')));return false;};
  const p=f.guard({remainingMs:100});let finished=false;p.catch(()=>{finished=true;});f.advance(100);f.expire();await Promise.resolve();assert.equal(finished,false);
  f.advance(2000);f.expire();await assert.rejects(p,reasonIs('DEADLINE'));assert.equal(f.spawns(),1);
});
test("flags alone cannot approve a missing, nonfinite or high CPU measurement",async()=>{
  for(const cpu of [null,-1,70,100]) {
    const f=fixture(),p=f.guard();f.ready({systemCpuPercent:cpu});f.child.emit("close",0);await assert.rejects(p,reasonIs("READY_UNVERIFIED"));
  }
});
test("stderr is discarded and fragmented JSON lines remain readable",async()=>{
  const f=fixture(),p=f.guard();f.child.stderr.write("PRIVATE COMMAND LINE");
  f.child.stdout.write('{"schemaVersion":"hourly-source-guard-v2","kind":"progress","stage":"cpu",');
  f.child.stdout.write('"elapsedMs":100}\n');f.ready();f.child.emit("close",0);assert.equal((await p).status,"ready");
});
test("summary whitelist rejects invented reasons and strips arbitrary fields",()=>{
  assert.equal(safeHourlyGuardSummary({stage:"cpu",reason:"SECRET",elapsedMs:1,budgetMs:1}),null);
  assert.deepEqual(safeHourlyGuardSummary({stage:"cpu",reason:"DEADLINE",elapsedMs:2,budgetMs:1,raw:"secret"}),
    {stage:"cpu",reason:"DEADLINE",elapsedMs:2,budgetMs:1,timeout:true,retryAttempted:false});
});
test("native Windows PowerShell 5.1 provider fixtures preserve guard boundaries",{skip:process.platform!=="win32"},()=>{
  const executable=path.join(process.env.SystemRoot,"System32","WindowsPowerShell","v1.0","powershell.exe");
  const harness=fileURLToPath(new URL("./hourly-guard-native-fixture.ps1",import.meta.url));
  const result=spawnSync(executable,["-NoProfile","-NonInteractive","-ExecutionPolicy","RemoteSigned","-File",harness],{encoding:"utf8",timeout:20000,windowsHide:true});
  assert.equal(result.status,0,result.stdout+result.stderr);const summary=JSON.parse(result.stdout.replace(/^\uFEFF/,""));assert.equal(summary.simulation,true);assert.equal(summary.failed,0);assert.ok(summary.passed>=14);assert.equal(summary.productionQueries,0);
});
test("startup and provider time are measured separately without retaining raw child fields",async()=>{
  const events=[],f=fixture({onDiagnostic:event=>events.push(event)}),p=f.guard();
  f.advance(1100);f.send({kind:'progress',stage:'host',message:'DO-NOT-OUTPUT'});f.advance(200);f.send({kind:'progress',stage:'tasks'});f.advance(300);f.send({kind:'progress',stage:'processes'});f.advance(400);f.send({kind:'progress',stage:'cpu'});f.advance(500);f.ready();f.child.emit('close',0);await p;
  assert.ok(events.some(e=>e.stage==='powershell-startup'&&e.kind==='success'&&e.durationMs===1100));
  assert.ok(events.some(e=>e.stage==='cpu-provider'&&e.durationMs===500));assert.ok(!JSON.stringify(events).includes('DO-NOT-OUTPUT'));
});
test("native PowerShell slow startup and stalled provider abort with one child and bounded termination",{skip:process.platform!=="win32"},async()=>{
  const executable=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const script=fileURLToPath(new URL('./hourly-guard-child-fixture.ps1',import.meta.url));
  for(const mode of ['slow-start','stalled-provider']){
    let children=0,pid,closed=false;
    const guard=createHourlyGuard({executable,script,platform:'win32',spawnProcess:(exe,args,options)=>{children++;const child=spawn(exe,[...args,'-Fixture',mode],options);pid=child.pid;child.once('close',()=>{closed=true;});return child;}});
    await assert.rejects(guard({remainingMs:mode==='slow-start'?1000:5000}),error=>reasonIs('DEADLINE')(error)&&error.guardSummary.stage===(mode==='slow-start'?'starting':'cpu'));
    assert.equal(children,1);assert.equal(closed,true);assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
  }
});
