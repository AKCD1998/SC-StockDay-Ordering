import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

export const HOURLY_GUARD_BUDGET_MS = 30_000;
const stages = new Set(["starting", "host", "tasks", "processes", "cpu", "complete"]);
const reasons = new Set(["HOST_UNVERIFIED", "FULL_SYNC_BUSY", "PROCESS_UNREADABLE", "CPU_UNREADABLE", "CPU_LIMIT", "PROVIDER_TIMEOUT", "ACCESS_DENIED", "TASKS_UNAVAILABLE", "PROCESSES_UNAVAILABLE", "CPU_UNAVAILABLE"]);
const integer = value => Number.isSafeInteger(value) && value >= 0;

// Never copy raw child output, exception messages, command lines or stderr into evidence.
export function safeHourlyGuardSummary(value) {
  if (!value || !stages.has(value.stage) || !integer(value.elapsedMs) || !integer(value.budgetMs)) return null;
  const parentReasons = ["PLATFORM_UNAVAILABLE", "BUDGET_EXHAUSTED", "START_FAILED", "DEADLINE", "OUTPUT_LIMIT", "INVALID_OUTPUT", "CHILD_EXIT", "READY_UNVERIFIED"];
  if (!reasons.has(value.reason) && !parentReasons.includes(value.reason)) return null;
  return { stage: value.stage, reason: value.reason, elapsedMs: value.elapsedMs, budgetMs: value.budgetMs,
    timeout: value.reason === "DEADLINE", retryAttempted: false };
}

export function createHourlyGuard({ executable, script, spawnProcess = spawn, platform = process.platform,
  observerProcessId = process.pid, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return async function hourlyGuard({ remainingMs = HOURLY_GUARD_BUDGET_MS } = {}) {
    const start = now(), budgetMs = Number.isFinite(remainingMs) ? Math.max(0, Math.floor(Math.min(HOURLY_GUARD_BUDGET_MS, remainingMs))) : 0;
    let stage = "starting";
    const failure = reason => Object.assign(new Error("Hourly source guard stopped before another batch."), {
      code: "HOURLY_SOURCE_GUARD_UNAVAILABLE", guardSummary: safeHourlyGuardSummary({ stage, reason, elapsedMs: Math.max(0, Math.ceil(now() - start)), budgetMs }),
    });
    if (platform !== "win32") throw failure("PLATFORM_UNAVAILABLE");
    if (budgetMs < 1) throw failure("BUDGET_EXHAUSTED");
    return await new Promise((resolve, reject) => {
      let child, timer, killTimer, buffer = "", bytes = 0, terminal, ended = false, pendingFailure;
      const finish = (error, result) => { if (ended) return; ended = true; clearTimer(timer); clearTimer(killTimer); error ? reject(error) : resolve(result); };
      // An unresponsive child aborts collection. There is no retry, capture or upload after failure.
      const stop = reason => {
        if (ended || pendingFailure) return;
        pendingFailure = failure(reason);try { child.kill(); } catch {}
        killTimer = setTimer(() => finish(pendingFailure), 2000);
      };
      const line = text => {
        if (pendingFailure || ended) return;
        let value; try { value = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { stop("INVALID_OUTPUT"); return; }
        if (value.schemaVersion !== "hourly-source-guard-v2" || !stages.has(value.stage) || !integer(value.elapsedMs) || terminal) { stop("INVALID_OUTPUT"); return; }
        stage = value.stage;
        if (value.kind === "progress") return;
        if (value.kind !== "result") { stop("INVALID_OUTPUT"); return; }
        terminal = value;
      };
      try {
        child = spawnProcess(executable, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", script,
          "-ObserverProcessId", String(observerProcessId)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        child.once("error", () => finish(pendingFailure ?? failure("START_FAILED")));
        child.stdout.on("data", data => {
          if (ended || pendingFailure) return;
          bytes += Buffer.byteLength(data); if (bytes > 8192) { stop("OUTPUT_LIMIT"); return; }
          buffer += data.toString("utf8"); let end;
          while ((end = buffer.indexOf("\n")) >= 0) { const next = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1); if (next) line(next); }
        });
        child.stderr.resume();
        child.once("close", code => {
          if (ended) return;
          if (pendingFailure) return finish(pendingFailure);
          if (buffer.trim()) line(buffer.trim());
          if (pendingFailure) return finish(pendingFailure);
          if (terminal?.status === "guard-stopped" && reasons.has(terminal.reason)) return finish(failure(terminal.reason));
          if (code !== 0) return finish(failure("CHILD_EXIT"));
          if (terminal?.status !== "ready" || terminal.stage !== "complete" || terminal.cpuBelowThreshold !== true
              || terminal.existingWorkQuiet !== true || terminal.hostVerified !== true || !Number.isFinite(terminal.systemCpuPercent)
              || terminal.systemCpuPercent < 0 || terminal.systemCpuPercent >= 70) return finish(failure("READY_UNVERIFIED"));
          finish(null, { status: "ready", hostVerified: true, existingWorkQuiet: true, cpuBelowThreshold: true,
            systemCpuPercent: terminal.systemCpuPercent, guardElapsedMs: Math.max(0, Math.ceil(now() - start)) });
        });
        timer = setTimer(() => stop("DEADLINE"), budgetMs);
      } catch { if (child) stop("START_FAILED"); else finish(failure("START_FAILED")); }
    });
  };
}
