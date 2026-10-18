import sql from "mssql";

export const HOURLY_SOURCE_READ_VERSION = "adapos-stored-stock-read-v1";
export const HOURLY_SOURCE_COUNTERS = [
  "productCount", "missingEstimateProducts", "missingPendingProducts", "missingRefreshProducts",
  "invalidRefreshProducts", "nonMasterProducts", "nonzeroDayEndProducts", "nonzeroPendingNowProducts",
  "formulaMatchedProducts", "formulaMismatchProducts", "formulaUnknownProducts",
];

function fail(code, sourceSqlErrorNumber) {
  // Do not include source rows, product identities or SQL messages in errors.
  throw Object.assign(new Error("Hourly source evidence is incomplete or invalid."), { code },
    Number.isSafeInteger(sourceSqlErrorNumber) ? { sourceSqlErrorNumber } : {});
}

function finite(value) {
  return value != null && value !== "" && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1e12;
}

function timestamp(value) {
  if (typeof value !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toISOString() : null;
}

export function describeHourlyStoredSource(sourceRows, selected) {
  if (!Array.isArray(sourceRows) || sourceRows.length !== selected.length) fail("HOURLY_SOURCE_COHORT_INCOMPLETE");
  const expected = new Set(selected);
  const seen = new Set();
  const sourceRead = {
    schemaVersion: HOURLY_SOURCE_READ_VERSION,
    estimateBasis: "stored-master-day-end",
    ...Object.fromEntries(HOURLY_SOURCE_COUNTERS.map((key) => [key, 0])),
    readAt: null, oldestRefreshAt: null, newestRefreshAt: null,
  };
  const refreshTimes = [];
  const rows = sourceRows.map((row) => {
    const code = String(row.product_code ?? "").trim();
    if (!expected.has(code) || seen.has(code)) fail("HOURLY_SOURCE_COHORT_INCOMPLETE");
    seen.add(code);
    if (!finite(row.qty) || (row.latest_estimated_on_hand != null && !finite(row.latest_estimated_on_hand))) {
      fail("HOURLY_SOURCE_INVALID_QUANTITY");
    }
    const readAt = timestamp(row.source_read_at);
    if (!readAt || row.source_offset_minutes !== 420) fail("HOURLY_SOURCE_TIMEZONE_UNVERIFIED");
    if (!sourceRead.readAt || readAt > sourceRead.readAt) sourceRead.readAt = readAt;
    sourceRead.productCount++;
    if (row.latest_estimated_on_hand == null) sourceRead.missingEstimateProducts++;
    const isMaster = code === row.source_stock_code;
    if (!isMaster) sourceRead.nonMasterProducts++;
    const hasPending = row.source_pending_stock_code != null;
    if (!hasPending) sourceRead.missingPendingProducts++;
    if (finite(row.source_day_end) && Number(row.source_day_end) !== 0) sourceRead.nonzeroDayEndProducts++;
    if (finite(row.source_pending_now) && Number(row.source_pending_now) !== 0) sourceRead.nonzeroPendingNowProducts++;
    const refreshAt = timestamp(row.source_refresh_at);
    if (row.source_refresh_at == null) sourceRead.missingRefreshProducts++;
    else if (!refreshAt || refreshAt > readAt) sourceRead.invalidRefreshProducts++;
    else refreshTimes.push(refreshAt);

    // Verify the observed stored-writer formula only. Never add the current
    // pending component to the estimate or call a vendor update procedure.
    if (!isMaster || !hasPending || ![row.latest_estimated_on_hand, row.source_wholesale, row.source_day_end].every(finite)) {
      sourceRead.formulaUnknownProducts++;
    } else {
      const residual = Number(row.latest_estimated_on_hand) - Number(row.qty)
        - Number(row.source_wholesale) - Number(row.source_day_end);
      if (Math.abs(residual) <= 1e-6) sourceRead.formulaMatchedProducts++;
      else sourceRead.formulaMismatchProducts++;
    }
    // Strip all source components and identities before existing payload/shadow paths.
    return { product_code: code, qty: Number(row.qty), latest_estimated_on_hand:
      row.latest_estimated_on_hand == null ? null : Number(row.latest_estimated_on_hand) };
  });
  refreshTimes.sort();
  sourceRead.oldestRefreshAt = refreshTimes[0] ?? null;
  sourceRead.newestRefreshAt = refreshTimes.at(-1) ?? null;
  return { rows, sourceRead };
}

// Intraday-only source adapter. Full Sync and its morning-anchor projection
// keep their existing queries. The branch-specific contract is not approved
// outside 004, and no business cutoff is inferred from FDPdtDayEnd.
export async function readHourlyStoredStock(pool, productCodes, { branchCode, queryTimeoutMs = 10_000 } = {}) {
  if (branchCode !== "004") fail("HOURLY_SOURCE_BRANCH_NOT_APPROVED");
  if (!Array.isArray(productCodes) || !Number.isSafeInteger(queryTimeoutMs) || queryTimeoutMs < 1 || queryTimeoutMs > 10_000) fail("HOURLY_EVIDENCE_COHORT_REQUIRED");
  const selected = (productCodes ?? []).map((value) => String(value).trim());
  if (!selected.length || selected.length > 500 || selected.some((code) => !code || code.length > 80)
      || new Set(selected).size !== selected.length) fail("HOURLY_EVIDENCE_COHORT_REQUIRED");
  const request = pool.request();
  const placeholders = selected.map((code, index) => {
    request.input(`productCode${index}`, sql.VarChar(80), code);
    return `@productCode${index}`;
  });
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    try { request.cancel(); } catch { /* Query error is sanitized below. */ }
  }, queryTimeoutMs);
  let result;
  try { result = await request.query(`
    SELECT p.FTPdtCode AS product_code, p.FTPdtStkCode AS source_stock_code,
           p.FCPdtQtyRet AS qty, p.FCPdtQtyNow AS latest_estimated_on_hand,
           p.FCPdtQtyWhs AS source_wholesale, q.FTPdtStkCode AS source_pending_stock_code,
           q.FCPdtDayEnd AS source_day_end, q.FCPdtQtyNow AS source_pending_now,
           CONVERT(varchar(40), TODATETIMEOFFSET(q.FDPdtDayEnd, '+07:00'), 127) AS source_refresh_at,
           CONVERT(varchar(40), SYSDATETIMEOFFSET(), 127) AS source_read_at,
           DATEPART(TZOFFSET, SYSDATETIMEOFFSET()) AS source_offset_minutes
      FROM TCNMPdt p
      LEFT JOIN TCNTPdtQtyNotApv q ON q.FTPdtStkCode = p.FTPdtStkCode
     WHERE p.FTPdtStaActive = 1 AND p.FTPdtCode IN (${placeholders.join(", ")})
     ORDER BY p.FTPdtCode
  `); } catch (error) {
    const denied = [229, 916, 18452, 18456, 4060].includes(error.number);
    fail(expired ? "HOURLY_SOURCE_TIMEOUT" : denied ? "HOURLY_SOURCE_ACCESS_DENIED" : "HOURLY_SOURCE_READ_FAILED", error.number);
  } finally { clearTimeout(timer); }
  if (expired) fail("HOURLY_SOURCE_TIMEOUT");
  return describeHourlyStoredSource(result.recordset, selected);
}
