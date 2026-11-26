import sql from "mssql";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

import { syncConfig as defaultSyncConfig, validateSyncConfig } from "./config.js";
import {
  isActiveHourlyStockBranch,
  scanHourlyStockEvidence,
} from "./delta/hourlyStockEvidence.js";
import { runHourlyStockShadow as defaultRunHourlyStockShadow } from "./delta/hourlyStockShadow.js";
import { readHourlyDerivedStock } from "./hourlyStockDerivedSource.js";
import { buildHourlyIntradayPayload, derivedObservationDiagnostics } from "./hourlyDerivedObservation.js";
import { connectSqlWithRetry } from "./sqlConnection.js";
import { buildSqlServerConfig } from "./sqlServerConfig.js";
import {
  uploadHourlyEvidence as defaultUploadHourlyEvidence,
} from "./hourlyStockEvidenceClient.js";
import { enqueueHourlyEvidence, flushHourlyEvidenceOutbox, withHourlyCaptureLock, hourlyEvidenceDeliveryBounds } from "./hourlyEvidenceStorage.js";
import { readHourlyCompleteCohort } from "./hourlyCompleteCohort.js";
import { resolveHourlyCohortConfig } from "./hourlyCohortManifest.js";
import { assertHourlyCompleteCohortGuard } from "./hourlyCompleteCohortGuard.js";
import { HOURLY_COMPLETE_COHORT_MAX_RECORDS } from "./hourlyCohortCoverage.js";
import { hourlyStage, emitHourlyDiagnostic } from "./hourlyAttemptDiagnostics.js";

export async function runHourlyStockIntraday(dependencies = {}) {
  const observe = dependencies.onDiagnostic;
  const originalConfig = dependencies.syncConfig ?? defaultSyncConfig;
  const config = originalConfig.hourlyStockEvidence?.enabled === true && originalConfig.hourlyStockEvidence.completeCohortEnabled === true
    ? { ...originalConfig, hourlyStockEvidence: resolveHourlyCohortConfig(originalConfig.hourlyStockEvidence) } : originalConfig;
  if (config.hourlyStockEvidence?.enabled !== true) {
    return { status: "skipped", reason: "feature-disabled" };
  }
  validateSyncConfig(config);
  if (!isActiveHourlyStockBranch(config.branchCode)) {
    const error = new Error(`Hourly stock evidence excludes branch ${config.branchCode}.`);
    error.code = "HOURLY_STOCK_BRANCH_NOT_ACTIVE";
    throw error;
  }
  const evidenceConfig = config.hourlyStockEvidence;
  if (typeof evidenceConfig.uploadToken !== "string" || evidenceConfig.uploadToken.trim().length < 32
      || evidenceConfig.uploadToken !== evidenceConfig.uploadToken.trim()) {
    throw Object.assign(new Error("Hourly evidence branch token is required."), { code: "CONFIG_ERROR" });
  }
  if (!Array.isArray(evidenceConfig.productCodes) || evidenceConfig.productCodes.length < 1) {
    throw Object.assign(new Error("Hourly evidence product cohort is required."), { code: "CONFIG_ERROR" });
  }
  if (!evidenceConfig.observationKind || !evidenceConfig.plannedSlot) {
    throw Object.assign(new Error("Hourly evidence observation kind and planned slot are required."), { code: "CONFIG_ERROR" });
  }
  if (evidenceConfig.observationKind !== "intraday") {
    throw Object.assign(new Error("Morning anchors must be captured by a successful Full Sync, not this runner."), { code: "HOURLY_EVIDENCE_ANCHOR_REQUIRES_FULL_SYNC" });
  }
  if (!/^(09|1[0-9]):00$/.test(evidenceConfig.plannedSlot)) {
    throw Object.assign(new Error("Intraday planned slot must be 09:00-19:00."), { code: "CONFIG_ERROR" });
  }
  if (evidenceConfig.productCodes.length > (evidenceConfig.completeCohortEnabled === true ? HOURLY_COMPLETE_COHORT_MAX_RECORDS : 500) || new Set(evidenceConfig.productCodes).size !== evidenceConfig.productCodes.length) {
    throw Object.assign(new Error("Hourly cohort must contain 1-500 unique products."), { code: "CONFIG_ERROR" });
  }

  const connectSql = dependencies.connectSql ?? ((connectionConfig) => sql.connect(connectionConfig));
  const getRows = dependencies.getHourlyStockEvidenceRows ?? (evidenceConfig.completeCohortEnabled === true
    ? (pool, codes, options) => readHourlyCompleteCohort(pool, codes, { ...options, scope: evidenceConfig.cohortScope,
      guard: dependencies.completeCohortGuard ?? assertHourlyCompleteCohortGuard }) : readHourlyDerivedStock);
  const runShadow = dependencies.runHourlyStockShadow ?? defaultRunHourlyStockShadow;
  const uploadEvidence = dependencies.uploadHourlyEvidence ?? defaultUploadHourlyEvidence;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const retryOptions = dependencies.sqlConnectRetryOptions ?? {};
  const callerOnRetry = retryOptions.onRetry;
  let sqlConnectionRetryCount = 0;
  let pool;

  const captureLock = dependencies.withHourlyCaptureLock ?? withHourlyCaptureLock;
  const captured = await hourlyStage(observe, "capture-lock", () => captureLock({
    cacheDir: evidenceConfig.cacheDir, branchCode: config.branchCode,
  }, async () => {
    try {
      pool = await hourlyStage(observe, "sql-connect", () => connectSqlWithRetry({
        ...retryOptions,
        connect: connectSql,
        config: dependencies.sqlServerConfig ?? buildSqlServerConfig(config),
        onRetry: (event) => {
          sqlConnectionRetryCount += 1;
          emitHourlyDiagnostic(observe, { stage: "sql-connect", kind: "retry", retryCount: sqlConnectionRetryCount });
          callerOnRetry?.(event);
        },
      }));

      const queryStartedAt = performance.now();
      const snapshot = await getRows(pool, evidenceConfig.productCodes, { branchCode: config.branchCode, ...(observe ? { onDiagnostic: observe } : {}) });
      const rows = Array.isArray(snapshot) ? snapshot : snapshot.rows;
      const sourceRead = Array.isArray(snapshot) ? null : snapshot.sourceRead;
      const derivedObservation = Array.isArray(snapshot) ? null : snapshot.derivedObservation;
      const sourceClockDiagnostics = Array.isArray(snapshot) ? null : snapshot.sourceClockDiagnostics;
      const queryDurationMs = Math.ceil(performance.now() - queryStartedAt);
      const observedAt = now();
      const scanned = scanHourlyStockEvidence(rows, config.branchCode);
      const { body } = await hourlyStage(observe, "payload", () => buildHourlyIntradayPayload({
        branchCode: config.branchCode,
        observationKind: evidenceConfig.observationKind,
        plannedSlot: evidenceConfig.plannedSlot,
        capturedAt: observedAt,
        rows,
        cohortCoverage: Array.isArray(snapshot) ? null : snapshot.cohortCoverage,
        clientMeta: {
          agentVersion: "hourly-evidence-candidate-v1",
          queryDurationMs,
          sqlConnectionAttempts: sqlConnectionRetryCount + 1,
          sqlConnectionRetryCount,
          ...(sourceRead ? { sourceRead } : {}),
        },
      }, derivedObservation), { readProducts: rows.length });
      await hourlyStage(observe, "outbox-enqueue", () => (dependencies.enqueueHourlyEvidence ?? enqueueHourlyEvidence)({ cacheDir: evidenceConfig.cacheDir, branchCode: config.branchCode, body,
        ...(dependencies.persistAcknowledgement ? {durableReceiptRequired:true} : {}) }));
      let shadow;
      try { shadow = runShadow({
        branchCode: config.branchCode,
        rows,
        cacheDir: config.hourlyStockEvidence.cacheDir,
        contentCaptureBranches: config.hourlyStockEvidence.contentCaptureBranches,
        observationKind: evidenceConfig.observationKind,
        observedAt,
        acknowledgement: {
          sourceReadComplete: true,
          acceptedRecords: scanned.size,
        },
      }); } catch { shadow = { shadowStatus: "failed" }; }

      return {
        status: "captured",
        queryDurationMs,
        sqlConnectionAttempts: sqlConnectionRetryCount + 1,
        sqlConnectionRetryCount,
        plannedSlot: evidenceConfig.plannedSlot,
        ...(sourceClockDiagnostics ? { sourceClockDiagnostics } : {}),
        derivedObservationDiagnostics: derivedObservationDiagnostics(derivedObservation,
          rows.map(row => ({ productCode: row.product_code, latestEstimatedOnHand: row.latest_estimated_on_hand })), observedAt,
          { completeCohort: evidenceConfig.completeCohortEnabled === true }),
        sourceFreshness: {
          status: sourceRead?.invalidRefreshProducts ? "invalid" : "unknown",
          qualifying: false,
          reason: "source-business-cutoff-unverified",
          businessCutoffAt: null,
          sourceRead,
        },
        ...shadow,
      };
    } finally {
      if (pool) await hourlyStage(observe, "sql-close", () => pool.close());
    }
  }));
  const upload = await flushHourlyEvidenceOutbox({
    cacheDir: evidenceConfig.cacheDir, branchCode: config.branchCode,
    apiBaseUrl: config.apiBaseUrl, token: evidenceConfig.uploadToken, uploadEvidence,
    ...hourlyEvidenceDeliveryBounds(evidenceConfig),
    ...(dependencies.persistAcknowledgement?{persistAcknowledgement:dependencies.persistAcknowledgement}:{}),
    ...(observe ? { onDiagnostic: observe } : {}),
  });
  return { ...captured, upload };
}

// Replay never reads SQL or rewrites the original capturedAt.
export async function replayHourlyEvidence(dependencies = {}) {
  const config = dependencies.syncConfig ?? defaultSyncConfig;
  if (config.hourlyStockEvidence?.enabled !== true) return { status: "skipped", reason: "feature-disabled" };
  if (String(config.hourlyStockEvidence.uploadToken || "").trim().length < 32) throw Object.assign(new Error("Hourly evidence branch token is required."), { code: "CONFIG_ERROR" });
  return flushHourlyEvidenceOutbox({
    cacheDir: config.hourlyStockEvidence.cacheDir, branchCode: config.branchCode,
    apiBaseUrl: config.apiBaseUrl, token: config.hourlyStockEvidence.uploadToken,
    uploadEvidence: dependencies.uploadHourlyEvidence ?? defaultUploadHourlyEvidence,
    ...hourlyEvidenceDeliveryBounds(config.hourlyStockEvidence),
    ...(dependencies.persistAcknowledgement?{persistAcknowledgement:dependencies.persistAcknowledgement}:{}),
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  (process.argv.includes("--replay-only") ? replayHourlyEvidence() : runHourlyStockIntraday())
    .then((result) => {
      if (result.upload?.pending > 0 || result.upload?.status === "busy" || result.status === "pending" || result.status === "busy") process.exitCode = 1;
      return result;
    })
    .then((result) => console.log(`[hourly-stock-intraday] ${JSON.stringify(result)}`))
    .catch((error) => {
      console.error(`Hourly stock intraday capture failed: ${error.message}`);
      if (error.code) console.error(`Code: ${error.code}`);
      process.exitCode = 1;
    });
}
