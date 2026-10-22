import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function assertHourlyCompleteCohortGuard({ remainingMs = 12000 } = {}) {
  if (process.platform !== "win32") throw Object.assign(new Error("Hourly source guard is unavailable."), { code: "HOURLY_SOURCE_GUARD_UNAVAILABLE" });
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = fileURLToPath(new URL("./hourlyCompleteCohortGuard.ps1", import.meta.url));
  const result = await new Promise(resolve => {
    const child = spawn(executable, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", script, "-ObserverProcessId", String(process.pid)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", ended = false;
    const finish = value => { if (ended) return; ended = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(null); }, Math.max(1, Math.min(12000, remainingMs)));
    child.stdout.on("data", data => { stdout += data; if (stdout.length > 8192) { child.kill(); finish(null); } });
    child.stderr.resume();child.once("error", () => finish(null));
    child.once("close", code => { if (code !== 0) return finish(null); try { finish(JSON.parse(stdout)); } catch { finish(null); } });
  }).catch(() => null);
  if (result?.status !== "ready" || result.cpuBelowThreshold !== true || result.existingWorkQuiet !== true || result.hostVerified !== true) {
    throw Object.assign(new Error("Hourly source guard stopped before another batch."), { code: "HOURLY_SOURCE_GUARD_UNAVAILABLE" });
  }
}
