import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHourlyGuard, safeHourlyGuardSummary } from "../src/hourlyGuardProcess.js";

function fixture() {
  const child = new EventEmitter();child.stdout = new PassThrough();child.stderr = new PassThrough();
  let kills = 0, duration = 0, deadline, timer, spawns = 0;
  child.kill = () => { kills++;queueMicrotask(() => child.emit("close", null));return true; };
  const guard = createHourlyGuard({ platform: "win32", executable: "fixture", script: "fixture.ps1", observerProcessId: 321,
    now: () => duration, setTimer: (callback, ms) => { deadline = ms;timer = callback;return 1; }, clearTimer: () => {},
    spawnProcess: (exe, args, options) => { spawns++;assert.equal(exe, "fixture");assert.ok(args.includes("321"));assert.equal(options.windowsHide, true);return child; },
  });
  return { child, guard, advance: ms => { duration += ms; }, deadline: () => deadline, expire: () => timer(), kills: () => kills, spawns: () => spawns,
    send: value => child.stdout.write(JSON.stringify({ schemaVersion: "hourly-source-guard-v2", elapsedMs: duration, ...value }) + "\r\n"),
    ready: (extra = {}) => child.stdout.write(JSON.stringify({ schemaVersion: "hourly-source-guard-v2", kind: "result", stage: "complete", elapsedMs: duration,
      status: "ready", hostVerified: true, existingWorkQuiet: true, cpuBelowThreshold: true, systemCpuPercent: 5, ...extra }) + "\r\n"),
  };
}
const reasonIs = reason => error => error.code === "HOURLY_SOURCE_GUARD_UNAVAILABLE" && error.guardSummary?.reason === reason;

test("cold guard startup can exceed the old 12 seconds within the bounded collection budget", async () => {
  const f = fixture(), promise = f.guard();assert.equal(f.deadline(), 30000);
  f.advance(13000);f.send({kind:"progress",stage:"host"});f.advance(1800);f.ready();f.child.emit("close", 0);
  const result = await promise;assert.equal(result.systemCpuPercent, 5);assert.equal(result.guardElapsedMs,14800);assert.equal(f.spawns(),1);assert.equal(f.kills(),0);
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
  for(const variant of ["invalid","large","duplicate","incomplete"]) {
    const f=fixture(),promise=f.guard();
    if(variant==="invalid") f.child.stdout.write("DO-NOT-OUTPUT\n");
    if(variant==="large") f.child.stdout.write("x".repeat(8193));
    if(variant==="duplicate"){f.ready();f.ready();}
    if(variant==="incomplete") f.send({kind:"progress",stage:"cpu"});
    f.child.emit("close",0);
    await assert.rejects(promise,reasonIs(variant==="large"?"OUTPUT_LIMIT":variant==="incomplete"?"READY_UNVERIFIED":"INVALID_OUTPUT"));
  }
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
