// Operational clock evidence only. No timestamp correction, freshness verdict,
// NTP claim, or change to the uploaded capture contract.
export function describeHourlySourceClock(samples, { observerHost, sourceHost } = {}) {
  const context = typeof observerHost === "string" && typeof sourceHost === "string"
    ? observerHost.toUpperCase() === sourceHost.toUpperCase() ? "source-host" : "remote-observer" : "unknown";
  const base = { observerContext: context, qualifying: false, businessCutoffAt: null };
  if (!Array.isArray(samples) || !samples.length) return { ...base, status: "missing", reason: "clock-measurement-missing" };
  const intervals = [];
  for (const sample of samples) {
    const { startedAtMs, completedAtMs, elapsedMs, sourceAt } = sample ?? {};
    if (![startedAtMs, completedAtMs, elapsedMs].every(Number.isFinite) || completedAtMs < startedAtMs || elapsedMs < 0
        || typeof sourceAt !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(sourceAt) || !Number.isFinite(Date.parse(sourceAt))) {
      return { ...base, status: "invalid", reason: "invalid-clock-measurement" };
    }
    // Include timestamp quantization and the observed wall/monotonic discrepancy
    // in the uncertainty. This is not a permitted business clock-skew threshold.
    const discrepancy = Math.abs(completedAtMs - startedAtMs - elapsedMs);
    const uncertainty = Math.ceil(discrepancy) + 2;
    intervals.push({ lower: Date.parse(sourceAt) - completedAtMs - uncertainty,
      upper: Date.parse(sourceAt) - startedAtMs + uncertainty, elapsedMs, discrepancy });
  }
  const lower = Math.max(...intervals.map(value => value.lower));
  const upper = Math.min(...intervals.map(value => value.upper));
  const consistent = lower <= upper;
  return { ...base, status: consistent ? "observed-unverified" : "inconsistent", reason: consistent
    ? context === "remote-observer" ? "remote-clock-offset-is-not-agent-clock-offset" : "clock-interval-is-not-business-freshness"
    : "clock-intervals-do-not-overlap", sampleCount: intervals.length,
    sqlMinusObserverLowerMs: consistent ? lower : null, sqlMinusObserverUpperMs: consistent ? upper : null,
    maxRoundTripMs: Math.ceil(Math.max(...intervals.map(value => value.elapsedMs))),
    maxWallMonotonicDifferenceMs: Math.ceil(Math.max(...intervals.map(value => value.discrepancy))) };
}
