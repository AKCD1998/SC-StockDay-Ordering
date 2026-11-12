import { spawn } from "node:child_process";
import { emitHourlyDiagnostic } from "./hourlyAttemptDiagnostics.js";
import {safeProviderFailure,validCpuMeasurement,safeCpuEvidence,safeCpuObservation} from './hourlyGuardEvidence.js';

// The installed production deadline is twelve seconds. Diagnostics do not
// authorize the thirty-second proposal from the original PR.
export const HOURLY_GUARD_BUDGET_MS = 12_000;
const stages = new Set(["starting", "host", "tasks", "processes", "cpu", "complete"]);
const reasons = new Set(["HOST_UNVERIFIED", "IDENTITY_UNVERIFIED", "FULL_SYNC_BUSY", "PROCESS_UNREADABLE", "CPU_UNREADABLE", "CPU_LIMIT", "PROVIDER_TIMEOUT", "ACCESS_DENIED", "TASKS_UNAVAILABLE", "PROCESSES_UNAVAILABLE", "CPU_UNAVAILABLE",'DEADLINE','BUDGET_EXHAUSTED']);
const integer = value => Number.isSafeInteger(value) && value >= 0;

// Never copy raw child output, exception messages, command lines or stderr into evidence.
export function safeHourlyGuardSummary(value) {
  if (!value || !stages.has(value.stage) || !integer(value.elapsedMs) || !integer(value.budgetMs)) return null;
  const parentReasons = ["PLATFORM_UNAVAILABLE", "BUDGET_EXHAUSTED", "START_FAILED", "DEADLINE", "OUTPUT_LIMIT", "INVALID_OUTPUT", "CHILD_EXIT", "READY_UNVERIFIED", "CHILD_STILL_RUNNING", "GUARD_LEASE_UNVERIFIED"];
  if (!reasons.has(value.reason) && !parentReasons.includes(value.reason)) return null;
  return { stage: value.stage, reason: value.reason, elapsedMs: value.elapsedMs, budgetMs: value.budgetMs,
    ...(typeof value.cpuPercent === 'number' && Number.isFinite(value.cpuPercent) && value.cpuPercent >= 0 && value.cpuPercent <= 100 ? { cpuPercent: value.cpuPercent } : {}),
    ...(safeProviderFailure(value.providerFailure)?{providerFailure:safeProviderFailure(value.providerFailure)}:{}),
    ...(safeCpuObservation(value.cpuObservation)?{cpuObservation:safeCpuObservation(value.cpuObservation)}:{}),
    timeout: value.reason === "DEADLINE", retryAttempted: false };
}

export function createHourlyGuard({ executable, script, spawnProcess = spawn, platform = process.platform,
  // On Windows libuv hrtime and .NET Stopwatch use the same QPC domain. Pass
  // that absolute deadline so child startup/preparation cannot buy extra time.
  observerProcessId = process.pid, now = () => Number(process.hrtime.bigint())/1e6, setTimer = setTimeout, clearTimer = clearTimeout, onDiagnostic, childLease } = {}) {
  return async function hourlyGuard({ remainingMs = HOURLY_GUARD_BUDGET_MS } = {}) {
    const start = now(), budgetMs = Number.isFinite(remainingMs) ? Math.max(0, Math.floor(Math.min(HOURLY_GUARD_BUDGET_MS, remainingMs))) : 0;
    const deadline = start + budgetMs, remaining = () => Math.max(0, deadline - now());
    let stage = "starting", stageStart = start, startupMs = null, cpuPercent = null, providerFailure=null,cpuObservation=null;
    const diagnosticStage = () => ({ starting: "powershell-startup", host: "host-identity", tasks: "task-scheduler", processes: "processes", cpu: "cpu-provider", complete: "cpu-provider" })[stage];
    const report = (kind, reason, extra = {}) => emitHourlyDiagnostic(onDiagnostic, { stage: diagnosticStage(), kind, ...(reason ? { code: reason } : {}), durationMs: Math.max(0, now() - stageStart), remainingMs: Math.max(0, budgetMs - (now() - start)), budgetMs, ...extra });
    const failure = reason => Object.assign(new Error("Hourly source guard stopped before another batch."), {
      code: "HOURLY_SOURCE_GUARD_UNAVAILABLE", guardSummary: safeHourlyGuardSummary({ stage, reason, elapsedMs: Math.max(0, Math.ceil(now() - start)), budgetMs, cpuPercent,providerFailure,cpuObservation }),
    });
    if (platform !== "win32") throw failure("PLATFORM_UNAVAILABLE");
    if (budgetMs < 1) throw failure("BUDGET_EXHAUSTED");
    let lease;
    try { lease = childLease?.acquire(); } catch (error) { throw failure(remaining()<=0?'DEADLINE':error.code === "CHILD_STILL_RUNNING" ? error.code : "GUARD_LEASE_UNVERIFIED"); }
    report("start");
    if(remaining()<=0){lease?.release();throw failure('DEADLINE');}
    return await new Promise((resolve, reject) => {
      let child, timer, killTimer, buffer = "", bytes = 0, terminal, ended = false, pendingFailure;
      const finish = (error, result, closed = false) => {
        if (ended) return; ended = true; clearTimer(timer); clearTimer(killTimer);
        if (closed || !child?.pid) lease?.release();
        if(!error&&remaining()<=0)error=failure('DEADLINE');
        if(!error&&!validCpuMeasurement(terminal?.cpuMeasurement,now(),terminal?.systemCpuPercent,start))error=failure('READY_UNVERIFIED');
        report(error ? "failure" : "success", error?.guardSummary?.reason, { ...(startupMs == null ? {} : { startupMs }), ...(cpuPercent == null ? {} : { cpuPercent }), ...(providerFailure?{providerFailure}:{}),...(cpuObservation?{cpuObservation}:{}),childTerminationConfirmed: closed || !child?.pid });
        if(!error&&remaining()<=0)error=failure('DEADLINE');
        if(!error&&!validCpuMeasurement(terminal?.cpuMeasurement,now(),terminal?.systemCpuPercent,start))error=failure('READY_UNVERIFIED');
        error ? reject(error) : resolve(result);
      };
      // An unresponsive child aborts collection. There is no retry, capture or upload after failure.
      const stop = reason => {
        if (ended || pendingFailure) return;
        pendingFailure = failure(reason);try { child.kill(); } catch {}
        if (!ended) killTimer = setTimer(() => {
          try { child.kill("SIGKILL"); } catch {}
          // Retain the lease until confirmed closure. Another invocation may
          // not spawn a second child while this PID remains alive or unknown.
          child.unref?.(); child.stdout.destroy?.(); child.stderr.destroy?.();
          finish(pendingFailure);
        }, 2000);
      };
      const line = text => {
        if (pendingFailure || ended) return;
        if(remaining()<=0){stop('DEADLINE');return;}
        let value; try { value = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { stop("INVALID_OUTPUT"); return; }
        if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== "hourly-source-guard-v2" || !stages.has(value.stage) || !integer(value.elapsedMs) || terminal) { stop("INVALID_OUTPUT"); return; }
        if (value.stage !== stage) {
          report("success");
          if (stage === "starting") startupMs = Math.max(0, Math.ceil(now() - start));
          stage = value.stage; stageStart = now(); report("start");
        }
        if (value.kind === "progress") return;
        if (value.kind !== "result") { stop("INVALID_OUTPUT"); return; }
        terminal = value;
        providerFailure=safeProviderFailure(value.providerFailure);
        if(validCpuMeasurement(value.cpuMeasurement,now(),value.systemCpuPercent,start))cpuObservation=safeCpuEvidence(value.cpuMeasurement,now());
        if (stage === 'cpu' && Number.isFinite(value.systemCpuPercent) && value.systemCpuPercent >= 0 && value.systemCpuPercent <= 100) cpuPercent = value.systemCpuPercent;
      };
      try {
        if(remaining()<=0)return finish(failure('DEADLINE'),null,true);
        child = spawnProcess(executable, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", script,
          "-ObserverProcessId", String(observerProcessId),'-MonotonicDeadlineMs',String(deadline)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        if (child.pid) lease?.setChild(child.pid);
        child.on("error", () => { if (child?.pid) { if (!pendingFailure) stop("START_FAILED"); } else finish(pendingFailure ?? failure("START_FAILED")); });
        child.stdout.on("error", () => stop("INVALID_OUTPUT"));
        child.stderr.on("error", () => stop("INVALID_OUTPUT"));
        child.stdout.on("data", data => {
          if (ended || pendingFailure) return;
          bytes += Buffer.byteLength(data); if (bytes > 8192) { stop("OUTPUT_LIMIT"); return; }
          buffer += data.toString("utf8"); let end;
          while ((end = buffer.indexOf("\n")) >= 0) { const next = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1); if (next) line(next); }
        });
        child.stderr.resume();
        child.once("close", code => {
          if (ended) { lease?.release(); return; }
          if (pendingFailure) return finish(pendingFailure, null, true);
          if(remaining()<=0)return finish(failure('DEADLINE'),null,true);
          if (buffer.trim()) line(buffer.trim());
          if (pendingFailure) return finish(pendingFailure, null, true);
          if (terminal?.status === "guard-stopped" && reasons.has(terminal.reason)) return finish(failure(terminal.reason), null, true);
          if (code !== 0) return finish(failure("CHILD_EXIT"), null, true);
          if (terminal?.status !== "ready" || terminal.stage !== "complete" || terminal.cpuBelowThreshold !== true
              || terminal.existingWorkQuiet !== true || terminal.hostVerified !== true || !Number.isFinite(terminal.systemCpuPercent)
              || terminal.systemCpuPercent < 0 || terminal.systemCpuPercent >= 70 || !validCpuMeasurement(terminal.cpuMeasurement,now(),terminal.systemCpuPercent,start)) return finish(failure("READY_UNVERIFIED"), null, true);
          cpuObservation=safeCpuEvidence(terminal.cpuMeasurement,now());
          emitHourlyDiagnostic(onDiagnostic, { stage: "cpu-provider", kind: "success", cpuPercent: terminal.systemCpuPercent,cpuObservation });
          if(remaining()<=0)return finish(failure('DEADLINE'),null,true);
          finish(null, { status: "ready", hostVerified: true, existingWorkQuiet: true, cpuBelowThreshold: true,
            systemCpuPercent: terminal.systemCpuPercent,cpuMeasurement:safeCpuEvidence(terminal.cpuMeasurement,now()),guardElapsedMs: Math.max(0, Math.ceil(now() - start)) }, true);
        });
        if(remaining()<=0)stop('DEADLINE');
        else timer = setTimer(() => stop("DEADLINE"), remaining());
      } catch { if (child) stop("START_FAILED"); else finish(failure("START_FAILED")); }
    });
  };
}
