import sql from "mssql";
import { performance } from "node:perf_hooks";
import { HOURLY_COMPLETE_COHORT_MAX_RECORDS, HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS } from "./hourlyCohortCoverage.js";

const invalid = code => { throw Object.assign(new Error("Hourly POS eligibility could not be verified; details withheld."), { code }); };
const isCode = value => typeof value === "string" && value.length > 0 && value.length <= 80 && value.trim() === value;

export function classifyHourlyPosEligibility(rows, webProductCodes) {
  if (!Array.isArray(webProductCodes) || !webProductCodes.length || webProductCodes.length > HOURLY_COMPLETE_COHORT_MAX_RECORDS
      || webProductCodes.some(value => !isCode(value)) || new Set(webProductCodes).size !== webProductCodes.length
      || !Array.isArray(rows) || rows.length !== webProductCodes.length) invalid("HOURLY_POS_ELIGIBILITY_INCOMPLETE");
  const expected = new Set(webProductCodes), byCode = new Map();
  for (const row of rows) {
    if (!row || !expected.has(row.product_code) || byCode.has(row.product_code) || ![0, 1].includes(row.master_exists)
        || ![0, 1].includes(row.source_active) || (row.master_exists === 0 && row.source_active !== 0)) invalid("HOURLY_POS_ELIGIBILITY_INCOMPLETE");
    byCode.set(row.product_code, row);
  }
  const productCodes = [], excludedNotActiveProductCodes = [], excludedMissingProductCodes = [];
  for (const code of webProductCodes) {
    const row = byCode.get(code);
    if (row.master_exists === 0) excludedMissingProductCodes.push(code);
    else if (row.source_active === 1) productCodes.push(code);
    else excludedNotActiveProductCodes.push(code);
  }
  return { productCodes, excludedNotActiveProductCodes, excludedMissingProductCodes };
}

export async function selectHourlyPosActiveCohort(pool, webProductCodes, {
  branchCode, guard, batchSize = 200, now = Date.now, monotonic = () => performance.now(),
} = {}) {
  if (branchCode !== "004" || typeof guard !== "function" || !Array.isArray(webProductCodes) || !webProductCodes.length
      || webProductCodes.length > HOURLY_COMPLETE_COHORT_MAX_RECORDS || webProductCodes.some(value => !isCode(value))
      || new Set(webProductCodes).size !== webProductCodes.length || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 200) invalid("HOURLY_POS_ELIGIBILITY_INVALID");
  const start = monotonic(), wall = now(), rows = [];
  const check = () => {
    if (monotonic() - start >= HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS) invalid("HOURLY_POS_ELIGIBILITY_TIMEOUT");
    if (Math.abs(now() - wall - (monotonic() - start)) > 250) invalid("HOURLY_OBSERVER_CLOCK_STEP_DETECTED");
  };
  async function query(text, codes = []) {
    check();const request = pool.request();codes.forEach((code, index) => request.input("code" + index, sql.VarChar(80), code));
    let expired = false;
    const timer = setTimeout(() => { expired = true;try { request.cancel(); } catch {} }, Math.max(1, Math.min(60000, HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS - (monotonic() - start))));
    try { const result = await request.query(text);if (expired) invalid("HOURLY_POS_ELIGIBILITY_TIMEOUT");check();return result; }
    catch (error) {
      if (["HOURLY_POS_ELIGIBILITY_TIMEOUT", "HOURLY_OBSERVER_CLOCK_STEP_DETECTED"].includes(error.code)) throw error;
      invalid(expired ? "HOURLY_POS_ELIGIBILITY_TIMEOUT" : [229, 916, 18452, 18456, 4060].includes(error.number) ? "HOURLY_SOURCE_ACCESS_DENIED" : "HOURLY_POS_ELIGIBILITY_READ_FAILED");
    } finally { clearTimeout(timer); }
  }
  await guard({ phase: "before", remainingMs: HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS });check();
  const identity = (await query(`SELECT CONVERT(varchar(128),SERVERPROPERTY('MachineName')) AS machine_name,DB_NAME() AS database_name,
    CONVERT(varchar(32),DATABASEPROPERTYEX(DB_NAME(),'Status')) AS database_status,
    IS_SRVROLEMEMBER('sysadmin') AS is_admin,IS_MEMBER('db_owner') AS is_owner,IS_MEMBER('db_datawriter') AS is_writer,
    HAS_PERMS_BY_NAME('dbo.TCNMPdt','OBJECT','INSERT') AS can_insert,HAS_PERMS_BY_NAME('dbo.TCNMPdt','OBJECT','UPDATE') AS can_update,
    HAS_PERMS_BY_NAME('dbo.TCNMPdt','OBJECT','DELETE') AS can_delete`)).recordset?.[0];
  if (identity?.machine_name !== "SERVER004" || identity.database_name !== "AdaAcc" || identity.database_status !== "ONLINE"
      || [identity.is_admin, identity.is_owner, identity.is_writer, identity.can_insert, identity.can_update, identity.can_delete].some(value => value !== 0)) invalid("HOURLY_SOURCE_READONLY_BOUNDARY_UNVERIFIED");
  for (let offset = 0; offset < webProductCodes.length; offset += batchSize) {
    const batchIndex = Math.floor(offset / batchSize), codes = webProductCodes.slice(offset, offset + batchSize);
    await guard({ phase: "before", batchIndex, remainingMs: HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS - (monotonic() - start) });check();
    const cohort = codes.map((_, index) => "SELECT @code" + index + " AS product_code").join(" UNION ALL ");
    const result = await query(`WITH cohort AS (${cohort}) SELECT c.product_code,
      CASE WHEN p.FTPdtCode IS NULL THEN 0 ELSE 1 END AS master_exists,
      CASE WHEN p.FTPdtStaActive = 1 THEN 1 ELSE 0 END AS source_active
      FROM cohort c LEFT JOIN dbo.TCNMPdt p ON p.FTPdtCode=c.product_code`, codes);
    if (!Array.isArray(result.recordset) || result.recordset.length !== codes.length
        || result.recordset.some(row => !codes.includes(row.product_code))) invalid("HOURLY_POS_ELIGIBILITY_INCOMPLETE");
    rows.push(...result.recordset);
    await guard({ phase: "after", batchIndex, remainingMs: HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS - (monotonic() - start) });check();
  }
  const selected = classifyHourlyPosEligibility(rows, webProductCodes);
  if (!selected.productCodes.length) invalid("HOURLY_POS_ELIGIBILITY_EMPTY");
  return { ...selected, readStartedAt: new Date(wall).toISOString(), readCompletedAt: new Date(now()).toISOString(), consistency: "unverified" };
}
