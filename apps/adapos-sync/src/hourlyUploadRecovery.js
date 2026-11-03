import { performance } from "node:perf_hooks";
import { emitHourlyDiagnostic } from "./hourlyAttemptDiagnostics.js";

// Review candidate only. The protected launcher always supplies enabled:false.
// One reset of an established connection is eligible; timeout alone, access
// denial, SQL/guard failure, 429/5xx and invalid acknowledgements are not.
export function createHourlyUploadRecovery({ upload, guard, enabled = false, monotonic = () => performance.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)), onDiagnostic } = {}) {
  return async options => {
    if (!enabled) return upload(options);
    if (options.maxAttempts !== 1 || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30_000 || typeof guard !== "function") throw new TypeError("Recovery requires a single-layer bounded upload.");
    const deadline = monotonic() + options.timeoutMs;
    try { return await upload(options); } catch (error) {
      if (error?.code !== "ECONNRESET" && error?.cause?.code !== "ECONNRESET") throw error;
      if (deadline - monotonic() < 1500) throw error;
      await wait(500);
      const remainingMs = Math.floor(deadline - monotonic());
      if (remainingMs < 1000) throw error;
      await guard({ remainingMs }); // CPU/Full/identity failures stop immediately.
      const timeoutMs = Math.floor(deadline - monotonic());
      if (timeoutMs < 1000) throw error;
      emitHourlyDiagnostic(onDiagnostic, { stage: "upload", kind: "retry", retryCount: 1, remainingMs: timeoutMs });
      return upload({ ...options, timeoutMs, maxAttempts: 1 });
    }
  };
}
