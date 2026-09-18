import {
  HOURLY_STOCK_EVIDENCE_CONTRACT_VERSION,
  isActiveHourlyStockBranch,
  reconcileHourlyWindowAtNextAnchor,
  scanHourlyStockEvidence,
} from "./hourlyStockEvidence.js";
import {
  readHourlyStockShadowCache,
  writeHourlyStockShadowCacheAtomic,
} from "./hourlyStockShadowCache.js";

export const HOURLY_STOCK_SHADOW_DATASET_TAG = "hourly_dual_stock_evidence";
export const HOURLY_STOCK_OBSERVATION_KINDS = new Set(["morning_anchor", "intraday"]);
const MAX_RETAINED_CALENDAR_DAYS = 3;
const MAX_OBSERVATIONS_PER_DAY = 24;

function round1(value) {
  return Math.round(value * 10) / 10;
}

// Bangkok is UTC+07 year-round. This avoids host-locale dependence on branch
// Windows machines while keeping the date boundary explicit.
export function bangkokDateKey(isoTimestamp) {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`Invalid hourly stock observedAt timestamp: ${isoTimestamp}`);
    error.code = "INVALID_HOURLY_STOCK_TIMESTAMP";
    throw error;
  }
  return new Date(parsed.getTime() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function snapshotDocuments(current) {
  return Object.fromEntries([...current].map(([key, entry]) => [key, entry.values]));
}

function boundedWindows(windows) {
  const dates = Object.keys(windows).sort();
  return Object.fromEntries(dates.slice(-MAX_RETAINED_CALENDAR_DAYS).map((date) => [date, windows[date]]));
}

function immediatelyPreviousDate(date) {
  const midnightUtc = new Date(`${date}T00:00:00.000Z`);
  midnightUtc.setUTCDate(midnightUtc.getUTCDate() - 1);
  return midnightUtc.toISOString().slice(0, 10);
}

function buildWindowUpdate({ previousWindows, current, captureContent, observedAt, observationKind }) {
  if (!captureContent) {
    return {
      windows: {},
      reconciliation: { status: "not-captured", reason: "content-capture-inactive" },
    };
  }

  const windows = JSON.parse(JSON.stringify(previousWindows ?? {}));
  const date = bangkokDateKey(observedAt);
  const snapshot = { observedAt, documents: snapshotDocuments(current) };
  let reconciliation = { status: "not-due", reason: "intraday-observation" };

  if (observationKind === "morning_anchor") {
    const previousDate = immediatelyPreviousDate(date);
    reconciliation = windows[previousDate]
      ? reconcileHourlyWindowAtNextAnchor({ previousWindow: windows[previousDate], currentDocuments: current })
      : Object.keys(windows).length === 0
        ? { status: "baseline-created", reason: "no-prior-calendar-window" }
        : { status: "skipped", reason: "immediately-prior-calendar-window-missing" };
    windows[date] = { anchor: snapshot, observations: [] };
  } else {
    const window = windows[date] ?? { anchor: null, observations: [] };
    const observations = Array.isArray(window.observations) ? window.observations : [];
    observations.push(snapshot);
    observations.sort((left, right) => String(left.observedAt).localeCompare(String(right.observedAt)));
    window.observations = observations.slice(-MAX_OBSERVATIONS_PER_DAY);
    windows[date] = window;
  }

  return { windows: boundedWindows(windows), reconciliation };
}

export function runHourlyStockShadow({
  branchCode,
  rows,
  cacheDir,
  contentCaptureBranches,
  observationKind,
  observedAt = new Date().toISOString(),
  acknowledgement,
}) {
  if (!isActiveHourlyStockBranch(branchCode)) {
    const error = new Error(`Hourly stock evidence is not permitted for branch ${String(branchCode ?? "")}.`);
    error.code = "HOURLY_STOCK_BRANCH_NOT_ACTIVE";
    throw error;
  }
  if (!HOURLY_STOCK_OBSERVATION_KINDS.has(observationKind)) {
    return {
      contractVersion: HOURLY_STOCK_EVIDENCE_CONTRACT_VERSION,
      datasetTag: HOURLY_STOCK_SHADOW_DATASET_TAG,
      branchCode,
      observationKind: observationKind || null,
      cacheWriteOk: null,
      cacheAdvanceSkippedReason: "observation-kind-required",
    };
  }

  const current = scanHourlyStockEvidence(rows ?? [], branchCode);
  const captureContent = (contentCaptureBranches ?? new Set()).has(String(branchCode ?? ""));
  let previous;
  try {
    previous = readHourlyStockShadowCache(cacheDir, branchCode);
  } catch (error) {
    previous = {
      documents: new Map(), windows: {}, state: "rebuilt", reason: `unexpected:${error.message}`,
    };
  }

  let unchangedCount = 0;
  let changedCount = 0;
  let newCount = 0;
  let contentMismatchCount = captureContent ? 0 : null;
  let contentBaselineMissingCount = captureContent ? 0 : null;
  for (const [key, entry] of current) {
    const prior = previous.documents.get(key);
    const isNew = prior?.fingerprint === undefined;
    const isUnchanged = !isNew && prior.fingerprint === entry.fingerprint;
    if (isNew) newCount++;
    else if (isUnchanged) unchangedCount++;
    else changedCount++;

    if (captureContent && isUnchanged) {
      if (prior.content == null) contentBaselineMissingCount++;
      else if (prior.content !== entry.content) contentMismatchCount++;
    }
  }

  let disappearedCount = 0;
  for (const key of previous.documents.keys()) {
    if (!current.has(key)) disappearedCount++;
  }

  const estimatedMissingCount = [...current.values()]
    .filter((entry) => entry.values.latestEstimatedOnHand == null).length;
  const { windows, reconciliation } = buildWindowUpdate({
    previousWindows: previous.windows,
    current,
    captureContent,
    observedAt,
    observationKind,
  });

  const acceptedRecords = acknowledgement?.acceptedRecords;
  const sourceReadIsComplete = acknowledgement?.authoritativeApplied === true
    || acknowledgement?.sourceReadComplete === true;
  const acknowledgementIsExact = sourceReadIsComplete
    && Number.isSafeInteger(acceptedRecords)
    && acceptedRecords === current.size;
  const documentsForCache = new Map([...current].map(([key, entry]) => [key, {
    fingerprint: entry.fingerprint,
    content: captureContent ? entry.content : null,
  }]));
  const writeResult = acknowledgementIsExact
    ? writeHourlyStockShadowCacheAtomic(cacheDir, branchCode, documentsForCache, windows)
    : { ok: null, error: "source-ack-missing-or-inexact" };

  return {
    contractVersion: HOURLY_STOCK_EVIDENCE_CONTRACT_VERSION,
    datasetTag: HOURLY_STOCK_SHADOW_DATASET_TAG,
    branchCode,
    observationKind,
    observedAt,
    scannedProducts: current.size,
    duplicateProductCount: Math.max(0, (rows?.length ?? 0) - current.size),
    unchangedCount,
    changedCount,
    newCount,
    disappearedCount,
    wouldSendCount: newCount + changedCount,
    estimatedRecordReductionPct: current.size === 0 ? 0 : round1((unchangedCount / current.size) * 100),
    estimatedMissingCount,
    cacheState: previous.state,
    cacheRebuildReason: previous.reason ?? null,
    cacheWriteOk: writeResult.ok,
    cacheAdvanceSkippedReason: acknowledgementIsExact ? null : writeResult.error,
    contentCaptureActive: captureContent,
    contentMismatchCount,
    contentBaselineMissingCount,
    reconciliation,
  };
}
