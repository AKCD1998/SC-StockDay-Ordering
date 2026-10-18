import sql from "mssql";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { describeHourlyStoredSource } from "./hourlyStockSource.js";
import { DERIVED_VERSION, DERIVED_BASIS } from "./hourlyDerivedObservation.js";
import { describeHourlySourceClock } from "./hourlySourceClock.js";

export const ORDINARY_COMPONENTS = ["SAL", "PosSaleTmp", "CSM", "PI", "PT", "SI", "ST", "TNF41", "TNF42", "TNF31", "TNF32", "TNF7", "TNF8", "ChkStkSale", "ChkStkStop", "PICK"];
function fail(code, number, sourceReadStage) {
  throw Object.assign(new Error("Hourly derived source read failed."), { code },
    Number.isSafeInteger(number) ? { sourceSqlErrorNumber: number } : {}, sourceReadStage ? { sourceReadStage } : {});
}
const finite = value => value != null && value !== "" && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1e12;
const FIELDS = ["source_stock_code", "qty", "latest_estimated_on_hand", "source_wholesale", "source_pending_stock_code", "source_day_end", "source_pending_now", "source_refresh_at"];

function sample(raw, selected) {
  const products = new Map();
  for (const row of raw ?? []) {
    const code = String(row.product_code ?? "").trim();
    if (!selected.includes(code)) fail("HOURLY_SOURCE_COHORT_INCOMPLETE");
    let entry = products.get(code);
    if (!entry) { entry = { source: row, components: new Map() }; products.set(code, entry); }
    if (FIELDS.some(key => entry.source[key] !== row[key]) || entry.components.has(row.component)) fail("HOURLY_SOURCE_COHORT_INCOMPLETE");
    if (row.component != null && !ORDINARY_COMPONENTS.includes(row.component)) fail("HOURLY_SOURCE_INVALID_COMPONENT");
    entry.components.set(row.component, row.component == null ? null : {
      net: row.net_quantity, count: row.movement_rows, invalid: row.invalid_rows, outside: row.outside_branch_rows,
    });
  }
  const stored = describeHourlyStoredSource([...products.values()].map(entry => entry.source), selected);
  return { products, stored };
}

// Repeated reads detect observed posting transitions, not dirty-read/ABA safety.
export function describeHourlyDerivedSamples(firstRows, secondRows, selected, readStartedAt,
  { firstClosingRows, secondClosingRows } = {}) {
  const first = sample(firstRows, selected), second = sample(secondRows, selected);
  const closing = rows => rows == null ? null : sample(rows.map(row => ({ ...row, component: null })), selected);
  const firstClosing = closing(firstClosingRows), secondClosing = closing(secondClosingRows);
  const masterFingerprint = entry => JSON.stringify(FIELDS.map(key => entry.source[key]));
  const records = selected.map(code => {
    const a = first.products.get(code), b = second.products.get(code);
    const fingerprint = entry => JSON.stringify([FIELDS.map(key => entry.source[key]), ORDINARY_COMPONENTS.map(key => entry.components.get(key) ?? null)]);
    let reason = "observed-unverified";
    if (fingerprint(a) !== fingerprint(b)
        || (firstClosing && masterFingerprint(a) !== masterFingerprint(firstClosing.products.get(code)))
        || (secondClosing && masterFingerprint(b) !== masterFingerprint(secondClosing.products.get(code)))) reason = "changed-between-reads";
    else if (b.source.source_stock_code !== code) reason = "non-master-stock-code";
    else if ([...b.components.values()].some(value => value?.outside > 0)) reason = "outside-branch-movement";
    else if (!finite(b.source.source_wholesale) || [...b.components.values()].some(value => value &&
      (!finite(value.net) || !Number.isSafeInteger(value.count) || value.count < 1 || value.invalid !== 0 || value.outside !== 0))) reason = "invalid-source-component";
    const pending = [...b.components.values()].reduce((total, value) => total + Number(value?.net ?? 0), 0);
    const quantity = Number(b.source.qty) + Number(b.source.source_wholesale) + pending;
    if (!Number.isFinite(quantity) || Math.abs(quantity) > 1e12) reason = "invalid-source-component";
    return { productCode: code, derivedOnHand: reason === "observed-unverified" ? quantity : null, reason };
  });
  return { ...second.stored, derivedObservation: {
    schemaVersion: DERIVED_VERSION, estimateBasis: DERIVED_BASIS, sampleCount: 2,
    consistency: "unverified", qualifying: false, businessCutoffAt: null,
    readStartedAt, readCompletedAt: second.stored.sourceRead.readAt,
    records: records.sort((a, b) => a.productCode.localeCompare(b.productCode)),
  } };
}

export async function readHourlyDerivedStock(pool, productCodes, { branchCode, queryTimeoutMs = 10_000 } = {}) {
  if (branchCode !== "004") fail("HOURLY_SOURCE_BRANCH_NOT_APPROVED");
  if (!Array.isArray(productCodes) || !Number.isSafeInteger(queryTimeoutMs) || queryTimeoutMs < 1 || queryTimeoutMs > 10_000) fail("HOURLY_EVIDENCE_COHORT_REQUIRED");
  const selected = productCodes.map(value => String(value).trim());
  if (!selected.length || selected.length > 500 || selected.some(code => !code || code.length > 80) || new Set(selected).size !== selected.length) fail("HOURLY_EVIDENCE_COHORT_REQUIRED");
  const deadline = performance.now() + queryTimeoutMs;
  const clockSamples = [];
  async function query(text, bind = false, stage = "metadata") {
    if (performance.now() >= deadline) fail("HOURLY_SOURCE_TIMEOUT", undefined, stage);
    const request = pool.request();
    if (bind) selected.forEach((code, index) => request.input(`productCode${index}`, sql.VarChar(80), code));
    const remainingMs = deadline - performance.now();
    if (remainingMs <= 0) fail("HOURLY_SOURCE_TIMEOUT", undefined, stage);
    let expired = false;
    const timer = setTimeout(() => { expired = true; try { request.cancel(); } catch {} }, remainingMs);
    const startedAtMs = Date.now(), startedMonotonic = performance.now();
    try {
      const result = await request.query(text);
      const completedAtMs = Date.now(), elapsedMs = performance.now() - startedMonotonic;
      if (expired || performance.now() > deadline) fail("HOURLY_SOURCE_TIMEOUT");
      const sourceAt = stage === "metadata" ? result.recordset?.[0]?.read_started_at : result.recordsets?.[3]?.[0]?.read_completed_at;
      clockSamples.push({ startedAtMs, completedAtMs, elapsedMs, sourceAt });
      return result;
    } catch (error) {
      fail(expired || error.code === "HOURLY_SOURCE_TIMEOUT" ? "HOURLY_SOURCE_TIMEOUT" :
        [229, 916, 18452, 18456, 4060].includes(error.number) ? "HOURLY_SOURCE_ACCESS_DENIED" : "HOURLY_SOURCE_READ_FAILED", error.number, stage);
    } finally { clearTimeout(timer); }
  }
  const metadata = (await query(`SELECT CONVERT(varchar(128), SERVERPROPERTY('MachineName')) AS machine_name,
    DB_NAME() AS database_name, CONVERT(varchar(40), SYSDATETIMEOFFSET(), 127) AS read_started_at,
    DATEPART(TZOFFSET, SYSDATETIMEOFFSET()) AS offset_minutes`)).recordset[0];
  if (metadata?.machine_name?.toUpperCase() !== "SERVER004" || metadata.database_name !== "AdaAcc" || metadata.offset_minutes !== 420) fail("HOURLY_SOURCE_IDENTITY_UNVERIFIED");
  const start = new Date(metadata.read_started_at);
  if (!/(Z|[+-]\d\d:\d\d)$/.test(metadata.read_started_at) || !Number.isFinite(start.getTime())) fail("HOURLY_SOURCE_TIMEZONE_UNVERIFIED");
  const placeholders = selected.map((_, index) => `@productCode${index}`).join(", ");
  const cohort = selected.map((_, index) => `SELECT @productCode${index} AS product_code`).join(" UNION ALL ");
  const union = ORDINARY_COMPONENTS.map(component => `SELECT '${component}' AS component, v.FTPdtStkCode,
      SUM(v.FCStkQty) AS net_quantity, COUNT(*) AS movement_rows,
      SUM(CASE WHEN v.FCStkQty IS NULL THEN 1 ELSE 0 END) AS invalid_rows,
      SUM(CASE WHEN ${component === "PosSaleTmp" ? "1=0" : "ISNULL(v.FTBchCode,'')<>'004'"} THEN 1 ELSE 0 END) AS outside_branch_rows
    FROM dbo.VCN_${component}QtyNowNotApv v
    WHERE EXISTS (SELECT 1 FROM scope s WHERE s.source_stock_code = v.FTPdtStkCode)
    GROUP BY v.FTPdtStkCode`).join(" UNION ALL ");
  // SELECT only; the vendor views themselves contain NOLOCK. No isolation or
  // database option changes, vendor EXEC, locks/hints or source writes.
  const stockText = `
    SELECT p.FTPdtCode AS product_code, p.FTPdtStkCode AS source_stock_code,
      p.FCPdtQtyRet AS qty, p.FCPdtQtyNow AS latest_estimated_on_hand, p.FCPdtQtyWhs AS source_wholesale,
      q.FTPdtStkCode AS source_pending_stock_code, q.FCPdtDayEnd AS source_day_end, q.FCPdtQtyNow AS source_pending_now,
      CONVERT(varchar(40), TODATETIMEOFFSET(q.FDPdtDayEnd, '+07:00'), 127) AS source_refresh_at,
        CONVERT(varchar(40), SYSDATETIMEOFFSET(), 127) AS source_read_at,
        DATEPART(TZOFFSET, SYSDATETIMEOFFSET()) AS source_offset_minutes
    FROM dbo.TCNMPdt p LEFT JOIN dbo.TCNTPdtQtyNotApv q ON q.FTPdtStkCode = p.FTPdtStkCode
    WHERE p.FTPdtStaActive = 1 AND p.FTPdtCode IN (${placeholders});`;
  // Bracket each movement read with the original stock/cache projection.
  // A changed bookend suppresses derived values; unchanged bookends still do
  // not turn the vendor's NOLOCK movement views into a consistent snapshot.
  const text = `${stockText}
  WITH cohort AS (${cohort}), scope AS (SELECT p.FTPdtStkCode AS source_stock_code FROM cohort c
    JOIN dbo.TCNMPdt p ON p.FTPdtCode = c.product_code WHERE p.FTPdtStaActive = 1)
  ${union} ORDER BY component, FTPdtStkCode;
  ${stockText}
  SELECT CONVERT(varchar(40), SYSDATETIMEOFFSET(), 127) AS read_completed_at`;
  const first = await query(text, true, "first-sample");
  const second = await query(text, true, "second-sample");
  function joinSample(result) {
    const movements = result.recordsets?.[1];
    if (!Array.isArray(movements)) fail("HOURLY_SOURCE_INVALID_COMPONENT");
    const expectedStocks = new Set(result.recordset.map(row => row.source_stock_code));
    if (movements.some(row => !expectedStocks.has(row.FTPdtStkCode))) fail("HOURLY_SOURCE_COHORT_INCOMPLETE");
    return result.recordset.flatMap(row => {
      const matching = movements.filter(movement => movement.FTPdtStkCode === row.source_stock_code);
      return matching.length ? matching.map(movement => ({ ...row, ...movement })) : [{ ...row, component: null }];
    });
  }
  if (!Array.isArray(first.recordsets?.[2]) || !Array.isArray(second.recordsets?.[2])) fail("HOURLY_SOURCE_COHORT_INCOMPLETE");
  const result = describeHourlyDerivedSamples(joinSample(first), joinSample(second), selected, start.toISOString(),
    { firstClosingRows: first.recordsets[2], secondClosingRows: second.recordsets[2] });
  const completedAt = second.recordsets?.[3]?.[0]?.read_completed_at;
  if (typeof completedAt !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(completedAt) || !Number.isFinite(Date.parse(completedAt))) fail("HOURLY_SOURCE_CLOCK_UNVERIFIED");
  result.derivedObservation.readCompletedAt = new Date(completedAt).toISOString();
  if (result.derivedObservation.readCompletedAt < result.sourceRead.readAt) fail("HOURLY_SOURCE_CLOCK_UNVERIFIED");
  const duration = Date.parse(result.derivedObservation.readCompletedAt) - start.getTime();
  if (duration < 0 || duration > queryTimeoutMs) fail("HOURLY_SOURCE_CLOCK_UNVERIFIED");
  result.sourceClockDiagnostics = describeHourlySourceClock(clockSamples, { observerHost: os.hostname(), sourceHost: metadata.machine_name });
  return result;
}
