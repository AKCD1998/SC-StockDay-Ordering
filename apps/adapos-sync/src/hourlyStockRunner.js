import sql from "mssql";
import { pathToFileURL } from "node:url";

import { syncConfig as defaultSyncConfig, validateSyncConfig } from "./config.js";
import {
  isActiveHourlyStockBranch,
  scanHourlyStockEvidence,
} from "./delta/hourlyStockEvidence.js";
import { runHourlyStockShadow as defaultRunHourlyStockShadow } from "./delta/hourlyStockShadow.js";
import { getHourlyStockEvidenceRows as defaultGetHourlyStockEvidenceRows } from "./queries.js";
import { connectSqlWithRetry } from "./sqlConnection.js";
import { buildSqlServerConfig } from "./sqlServerConfig.js";
import {
  buildHourlyEvidencePayload,
  uploadHourlyEvidence as defaultUploadHourlyEvidence,
} from "./hourlyStockEvidenceClient.js";
import { enqueueHourlyEvidence, flushHourlyEvidenceOutbox, withHourlyCaptureLock } from "./hourlyEvidenceStorage.js";

export async function runHourlyStockIntraday(dependencies = {}) {
  const config = dependencies.syncConfig ?? defaultSyncConfig;
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
  if (evidenceConfig.productCodes.length > 500 || new Set(evidenceConfig.productCodes).size !== evidenceConfig.productCodes.length) {
    throw Object.assign(new Error("Hourly cohort must contain 1-500 unique products."), { code: "CONFIG_ERROR" });
  }

  const connectSql = dependencies.connectSql ?? ((connectionConfig) => sql.connect(connectionConfig));
  const getRows = dependencies.getHourlyStockEvidenceRows ?? defaultGetHourlyStockEvidenceRows;
  const runShadow = dependencies.runHourlyStockShadow ?? defaultRunHourlyStockShadow;
  const uploadEvidence = dependencies.uploadHourlyEvidence ?? defaultUploadHourlyEvidence;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const retryOptions = dependencies.sqlConnectRetryOptions ?? {};
  const callerOnRetry = retryOptions.onRetry;
  let sqlConnectionRetryCount = 0;
  let pool;

  const captureLock = dependencies.withHourlyCaptureLock ?? withHourlyCaptureLock;
  const captured = await captureLock({
    cacheDir: evidenceConfig.cacheDir, branchCode: config.branchCode,
  }, async () => {
    try {
      pool = await connectSqlWithRetry({
        ...retryOptions,
        connect: connectSql,
        config: dependencies.sqlServerConfig ?? buildSqlServerConfig(config),
        onRetry: (event) => {
          sqlConnectionRetryCount += 1;
          callerOnRetry?.(event);
        },
      });

      const queryStartedAt = Date.now();
      const rows = await getRows(pool, evidenceConfig.productCodes);
      const queryDurationMs = Date.now() - queryStartedAt;
      const observedAt = now();
      const scanned = scanHourlyStockEvidence(rows, config.branchCode);
      const { body } = buildHourlyEvidencePayload({
        branchCode: config.branchCode,
        observationKind: evidenceConfig.observationKind,
        plannedSlot: evidenceConfig.plannedSlot,
        capturedAt: observedAt,
        rows,
        clientMeta: {
          agentVersion: "hourly-evidence-candidate-v1",
          queryDurationMs,
          sqlConnectionAttempts: sqlConnectionRetryCount + 1,
          sqlConnectionRetryCount,
        },
      });
      enqueueHourlyEvidence({ cacheDir: evidenceConfig.cacheDir, branchCode: config.branchCode, body });
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
        ...shadow,
      };
    } finally {
      if (pool) await pool.close();
    }
  });
  const upload = await flushHourlyEvidenceOutbox({
    cacheDir: evidenceConfig.cacheDir, branchCode: config.branchCode,
    apiBaseUrl: config.apiBaseUrl, token: evidenceConfig.uploadToken, uploadEvidence,
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
