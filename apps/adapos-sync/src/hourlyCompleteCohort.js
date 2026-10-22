import sql from "mssql";
import { performance } from "node:perf_hooks";
import { readHourlyDerivedStock } from "./hourlyStockDerivedSource.js";
import { HOURLY_SOURCE_COUNTERS } from "./hourlyStockSource.js";
import { buildCohortCoverage, HOURLY_COMPLETE_COHORT_MAX_RECORDS, HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS,
  HOURLY_SOURCE_DEFAULT_BATCH_RECORDS, HOURLY_SOURCE_MAX_BATCH_RECORDS } from "./hourlyCohortCoverage.js";

const fail = code => { throw Object.assign(new Error("Hourly complete-cohort read stopped; details withheld."), { code }); };
export async function readHourlyCompleteCohort(pool, productCodes, { branchCode, scope = "explicit", batchSize = HOURLY_SOURCE_DEFAULT_BATCH_RECORDS,
  guard, readBatch = readHourlyDerivedStock, now = Date.now, monotonic = () => performance.now(), maxWindowMs = HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS } = {}) {
  if (branchCode !== "004" || !Array.isArray(productCodes) || !productCodes.length || productCodes.length > HOURLY_COMPLETE_COHORT_MAX_RECORDS
      || new Set(productCodes).size !== productCodes.length || productCodes.some(code => typeof code !== "string" || !code || code.trim() !== code || code.length > 80)
      || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > HOURLY_SOURCE_MAX_BATCH_RECORDS || typeof guard !== "function"
      || !Number.isSafeInteger(maxWindowMs) || maxWindowMs < 1 || maxWindowMs > HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS) fail("HOURLY_COHORT_COVERAGE_INVALID");
  const start = monotonic(), wall = now(), rows = [], missing = [], derivedRows = [], clockBatches = [];
  const summary = { ...Object.fromEntries(HOURLY_SOURCE_COUNTERS.map(key => [key, 0])), schemaVersion: "adapos-stored-stock-read-v1", estimateBasis: "stored-master-day-end", readAt: null, oldestRefreshAt: null, newestRefreshAt: null };
  let readStartedAt = null, readCompletedAt = null, verifiedBoundary = false;
  const sourceBatchTimings = [];
  const batches = Math.ceil(productCodes.length / batchSize);
  function check() {
    if (monotonic() - start >= maxWindowMs) fail("HOURLY_COMPLETE_COHORT_WINDOW_EXCEEDED");
    if (Math.abs(now() - wall - (monotonic() - start)) > 250) fail("HOURLY_OBSERVER_CLOCK_STEP_DETECTED");
  }
  async function query(text, codes, remaining) {
    const request = pool.request();
    codes.forEach((code, index) => request.input(`cohortCode${index}`, sql.VarChar(80), code));
    let expired = false;
    const timer = setTimeout(() => { expired = true; try { request.cancel(); } catch {} }, remaining);
    try {
      const result = await request.query(text);
      if (expired) fail("HOURLY_SOURCE_TIMEOUT");
      return result;
    } catch (error) {
      if (error.code === "HOURLY_SOURCE_TIMEOUT") throw error;
      fail(expired ? "HOURLY_SOURCE_TIMEOUT" : [229,916,18452,18456,4060].includes(error.number) ? "HOURLY_SOURCE_ACCESS_DENIED" : "HOURLY_SOURCE_READ_FAILED");
    } finally { clearTimeout(timer); }
  }
  for (let offset = 0, index = 0; offset < productCodes.length; offset += batchSize, index++) {
    check();await guard({ phase: "before", batchIndex: index, batches, remainingMs: maxWindowMs - (monotonic() - start) });check();
    const batchStart = monotonic(), deadline = batchStart + Math.min(60_000, maxWindowMs - (batchStart - start));
    const remaining = () => { check(); const ms = Math.floor(deadline - monotonic()); if (ms < 1) fail("HOURLY_SOURCE_TIMEOUT"); return ms; };
    if (!verifiedBoundary) {
      const id = (await query(`SELECT CONVERT(varchar(128),SERVERPROPERTY('MachineName')) AS machine_name,DB_NAME() AS database_name,
        CONVERT(varchar(32),DATABASEPROPERTYEX(DB_NAME(),'Status')) AS database_status,
        IS_SRVROLEMEMBER('sysadmin') AS is_admin,IS_MEMBER('db_owner') AS is_owner,IS_MEMBER('db_datawriter') AS is_writer,
        HAS_PERMS_BY_NAME('dbo.TCNMPdt','OBJECT','INSERT') AS can_insert,HAS_PERMS_BY_NAME('dbo.TCNMPdt','OBJECT','UPDATE') AS can_update,
        HAS_PERMS_BY_NAME('dbo.TCNMPdt','OBJECT','DELETE') AS can_delete`, [], remaining())).recordset?.[0];
      if (id?.machine_name !== "SERVER004" || id.database_name !== "AdaAcc" || id.database_status !== "ONLINE"
          || [id.is_admin,id.is_owner,id.is_writer,id.can_insert,id.can_update,id.can_delete].some(value => value !== 0)) fail("HOURLY_SOURCE_READONLY_BOUNDARY_UNVERIFIED");
      verifiedBoundary = true;
    }
    const codes = productCodes.slice(offset, offset + batchSize);
    const cohort = codes.map((_, i) => `SELECT @cohortCode${i} AS product_code`).join(" UNION ALL ");
    const available = (await query(`WITH cohort AS (${cohort}) SELECT c.product_code,
      CASE WHEN p.FTPdtStaActive = 1 THEN 1 ELSE 0 END AS source_available
      FROM cohort c LEFT JOIN dbo.TCNMPdt p ON p.FTPdtCode = c.product_code`, codes, remaining())).recordset;
    if (!Array.isArray(available) || available.length !== codes.length || new Set(available.map(row => row.product_code)).size !== codes.length
        || available.some(row => !codes.includes(row.product_code) || ![0, 1].includes(row.source_available))) fail("HOURLY_SOURCE_COHORT_INCOMPLETE");
    const present = available.filter(row => row.source_available === 1).map(row => row.product_code);
    missing.push(...available.filter(row => row.source_available === 0).map(row => row.product_code));
    if (present.length) {
      const snapshot = await readBatch(pool, present, { branchCode, queryTimeoutMs: remaining(), maxQueryTimeoutMs: 60_000 });
      check();remaining();
      if (!snapshot || snapshot.rows.length !== present.length || snapshot.derivedObservation.records.length !== present.length
          || new Set(snapshot.rows.map(row => row.product_code)).size !== present.length
          || snapshot.rows.some(row => !present.includes(row.product_code))) fail("HOURLY_SOURCE_COHORT_INCOMPLETE");
      if (snapshot.sourceRead.productCount !== present.length || snapshot.sourceRead.formulaMatchedProducts
          + snapshot.sourceRead.formulaMismatchProducts + snapshot.sourceRead.formulaUnknownProducts !== present.length) fail("HOURLY_SOURCE_COHORT_INCOMPLETE");
      rows.push(...snapshot.rows);derivedRows.push(...snapshot.derivedObservation.records);
      for (const key of HOURLY_SOURCE_COUNTERS) {
        const count = snapshot.sourceRead[key];
        if (!Number.isSafeInteger(count) || count < 0 || count > present.length) fail("HOURLY_SOURCE_COHORT_INCOMPLETE");
        summary[key] += count;
      }
      for (const key of ["readAt", "newestRefreshAt"]) if (snapshot.sourceRead[key] && (!summary[key] || snapshot.sourceRead[key] > summary[key])) summary[key] = snapshot.sourceRead[key];
      if (snapshot.sourceRead.oldestRefreshAt && (!summary.oldestRefreshAt || snapshot.sourceRead.oldestRefreshAt < summary.oldestRefreshAt)) summary.oldestRefreshAt = snapshot.sourceRead.oldestRefreshAt;
      const observed = snapshot.derivedObservation;
      clockBatches.push(snapshot.sourceClockDiagnostics);
      if (!readStartedAt || observed.readStartedAt < readStartedAt) readStartedAt = observed.readStartedAt;
      if (!readCompletedAt || observed.readCompletedAt > readCompletedAt) readCompletedAt = observed.readCompletedAt;
    }
    remaining();
    const durationMs = monotonic() - batchStart;
    sourceBatchTimings.push({ batchIndex: index, requestedProducts: codes.length, observedProducts: present.length,
      unavailableProducts: codes.length - present.length, durationMs, timeWarning: durationMs > 3000, warningThresholdMs: 3000 });
    await guard({ phase: "after", batchIndex: index, batches, remainingMs: maxWindowMs - (monotonic() - start) });
    check();
  }
  if (!rows.length) fail("HOURLY_COMPLETE_COHORT_NO_SOURCE_ROWS");
  const coverage = buildCohortCoverage({ expectedProductCodes: productCodes, rows, missingProductCodes: missing, scope,
    readBatchSize: batchSize, readBatchCount: batches, observationWindowMs: Math.ceil(monotonic() - start), observationKind: "intraday" });
  const validClockBatches = clockBatches.filter(value => value?.status === "observed-unverified"
    && Number.isFinite(value.sqlMinusObserverLowerMs) && Number.isFinite(value.sqlMinusObserverUpperMs));
  const lower = validClockBatches.length ? Math.max(...validClockBatches.map(value => value.sqlMinusObserverLowerMs)) : null;
  const upper = validClockBatches.length ? Math.min(...validClockBatches.map(value => value.sqlMinusObserverUpperMs)) : null;
  const clockStatus = clockBatches.some(value => value?.status === "invalid") ? "invalid"
    : clockBatches.some(value => value?.status === "inconsistent") || (lower != null && lower > upper) ? "inconsistent"
    : validClockBatches.length !== clockBatches.length ? "missing" : "observed-unverified";
  const maximumClockMetric = key => {
    const values = clockBatches.map(value => value?.[key]).filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  };
  return { rows, sourceRead: summary, cohortCoverage: coverage, sourceBatchTimings, derivedObservation: {
    schemaVersion: "adapos-ordinary16-derived-v1", estimateBasis: "retail-plus-wholesale-plus-ordinary16", sampleCount: 2,
    consistency: "unverified", qualifying: false, businessCutoffAt: null, readStartedAt, readCompletedAt,
    records: derivedRows.sort((a,b) => a.productCode.localeCompare(b.productCode)),
  }, sourceClockDiagnostics: { status: clockStatus, batchCount: batches, observedClockBatches: validClockBatches.length,
    sqlMinusObserverLowerMs: clockStatus === "observed-unverified" ? lower : null,
    sqlMinusObserverUpperMs: clockStatus === "observed-unverified" ? upper : null,
    maxRoundTripMs: maximumClockMetric("maxRoundTripMs"), maxWallMonotonicDifferenceMs: maximumClockMetric("maxWallMonotonicDifferenceMs"),
    reason: "batch-clock-observations-do-not-prove-time-synchronization", atomicSnapshotVerified: false, qualifying: false, businessCutoffAt: null } };
}
