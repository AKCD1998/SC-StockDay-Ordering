import { performance } from "node:perf_hooks";
import { emitHourlyDiagnostic } from "./hourlyAttemptDiagnostics.js";

// Review candidate only. The protected launcher always supplies enabled:false.
// One reset of an established connection is eligible; timeout alone, access
// denial, SQL/guard failure, 429/5xx and invalid acknowledgements are not.
export function createHourlyUploadRecovery({ upload, guard, enabled = false, monotonic = () => performance.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)), onDiagnostic } = {}) {
  return async options => {
    if (!enabled) return upload(options);
    if (options.maxAttempts !== 1 || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30_000 || typeof guard !== "function") throw new TypeError("Recovery requires a single-layer bounded upload.");
    // Retain the original primitive delivery inputs before invoking a provider.
    // A reset after the server committed must resend the exact queued bytes,
    // even if a provider mutates its options object before throwing.
    if (typeof options.body !== "string" || !options.body.length) throw new TypeError("Recovery requires the original queued body.");
    const original = Object.freeze({ ...options });
    const deadline = monotonic() + original.timeoutMs;
    try { return await upload({ ...original }); } catch (error) {
      const plainReset = error?.code === "ECONNRESET";
      const wrappedReset = error?.code == null && error?.cause?.code === "ECONNRESET";
      // An inner transport cause never overrides an outer application/HTTP,
      // authorization, timeout or acknowledgement stop reason.
      if (error?.status != null || (!plainReset && !wrappedReset)) throw error;
      if (deadline - monotonic() < 1500) throw error;
      await wait(500);
      const remainingMs = Math.floor(deadline - monotonic());
      if (remainingMs < 1000) throw error;
      await guard({ remainingMs }); // CPU/Full/identity failures stop immediately.
      const timeoutMs = Math.floor(deadline - monotonic());
      if (timeoutMs < 1000) throw error;
      emitHourlyDiagnostic(onDiagnostic, { stage: "upload", kind: "retry", retryCount: 1, remainingMs: timeoutMs });
      return upload({ ...original, timeoutMs, maxAttempts: 1 });
    }
  };
}
