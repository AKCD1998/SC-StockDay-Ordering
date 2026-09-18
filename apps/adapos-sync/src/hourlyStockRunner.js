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
  if (!evidenceConfig.uploadToken) {
    throw Object.assign(new Error("Hourly evidence branch token is required."), { code: "CONFIG_ERROR" });
  }
  if (!Array.isArray(evidenceConfig.productCodes) || evidenceConfig.productCodes.length < 1) {
    throw Object.assign(new Error("Hourly evidence product cohort is required."), { code: "CONFIG_ERROR" });
  }
  if (!evidenceConfig.observationKind || !evidenceConfig.plannedSlot) {
    throw Object.assign(new Error("Hourly evidence observation kind and planned slot are required."), { code: "CONFIG_ERROR" });
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
    const shadow = runShadow({
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
    });

    const { payload, body } = buildHourlyEvidencePayload({
      branchCode: config.branchCode,
      observationKind: evidenceConfig.observationKind,
      plannedSlot: evidenceConfig.plannedSlot,
      capturedAt: observedAt,
      sourceEventAt: null,
      rows,
      clientMeta: {
        agentVersion: "hourly-evidence-candidate-v1",
        queryDurationMs,
        sqlConnectionAttempts: sqlConnectionRetryCount + 1,
        sqlConnectionRetryCount,
      },
    });
    const upload = await uploadEvidence({
      apiBaseUrl: config.apiBaseUrl,
      branchCode: config.branchCode,
      token: evidenceConfig.uploadToken,
      body,
    });

    return {
      status: "captured",
      queryDurationMs,
      sqlConnectionAttempts: sqlConnectionRetryCount + 1,
      sqlConnectionRetryCount,
      plannedSlot: evidenceConfig.plannedSlot,
      idempotencyKeyPrefix: payload.idempotencyKey.slice(0, 12),
      upload,
      ...shadow,
    };
  } finally {
    if (pool) await pool.close();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runHourlyStockIntraday()
    .then((result) => console.log(`[hourly-stock-intraday] ${JSON.stringify(result)}`))
    .catch((error) => {
      console.error(`Hourly stock intraday capture failed: ${error.message}`);
      if (error.code) console.error(`Code: ${error.code}`);
      process.exitCode = 1;
    });
}
