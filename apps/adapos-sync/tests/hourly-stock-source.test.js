import assert from "node:assert/strict";
import test from "node:test";
import { describeHourlyStoredSource, readHourlyStoredStock } from "../src/hourlyStockSource.js";

function source(overrides = {}) {
  return { product_code: "A", source_stock_code: "A", source_pending_stock_code: "A",
    qty: 10, latest_estimated_on_hand: 8, source_wholesale: 0, source_day_end: -2,
    source_pending_now: -3, source_refresh_at: "2026-10-18T07:46:20+07:00",
    source_read_at: "2026-10-18T12:30:00+07:00", source_offset_minutes: 420, ...overrides };
}

test("stored formula diagnostics do not add current pending movements or replace source quantities", () => {
  const snapshot = describeHourlyStoredSource([source()], ["A"]);
  assert.deepEqual(snapshot.rows, [{ product_code: "A", qty: 10, latest_estimated_on_hand: 8 }]);
  assert.equal(snapshot.sourceRead.formulaMatchedProducts, 1);
  assert.equal(snapshot.sourceRead.nonzeroPendingNowProducts, 1);
  assert.equal(snapshot.sourceRead.oldestRefreshAt, "2026-10-18T00:46:20.000Z");
  assert.equal(snapshot.sourceRead.readAt, "2026-10-18T05:30:00.000Z");
  assert.equal("businessCutoffAt" in snapshot.sourceRead, false);
});

test("formula mismatch and missing components stay distinct from an absent estimate", () => {
  assert.equal(describeHourlyStoredSource([source({ latest_estimated_on_hand: 7 })], ["A"]).sourceRead.formulaMismatchProducts, 1);
  const absent = describeHourlyStoredSource([source({ latest_estimated_on_hand: null })], ["A"]);
  assert.equal(absent.rows[0].latest_estimated_on_hand, null);
  assert.equal(absent.sourceRead.missingEstimateProducts, 1);
  assert.equal(absent.sourceRead.formulaUnknownProducts, 1);
  const missing = describeHourlyStoredSource([source({ source_pending_stock_code: null, source_refresh_at: null })], ["A"]);
  assert.equal(missing.sourceRead.missingPendingProducts, 1);
  assert.equal(missing.sourceRead.missingRefreshProducts, 1);
  assert.equal(missing.sourceRead.formulaUnknownProducts, 1);
  const alias = describeHourlyStoredSource([source({ source_stock_code: "BASE" })], ["A"]);
  assert.equal(alias.sourceRead.nonMasterProducts, 1);
  assert.equal(alias.sourceRead.formulaUnknownProducts, 1);
});

test("null retail is rejected instead of fabricated as zero; negative balances remain signed", () => {
  assert.throws(() => describeHourlyStoredSource([source({ qty: null })], ["A"]), (error) => error.code === "HOURLY_SOURCE_INVALID_QUANTITY");
  const negative = describeHourlyStoredSource([source({ qty: -10, latest_estimated_on_hand: -12 })], ["A"]);
  assert.equal(negative.rows[0].qty, -10);
  assert.equal(negative.sourceRead.formulaMatchedProducts, 1);
});

test("incomplete, duplicated and unexpected source identities fail before capture", () => {
  for (const rows of [[], [source(), source()], [source({ product_code: "OTHER" })]]) {
    assert.throws(() => describeHourlyStoredSource(rows, ["A"]), (error) => error.code === "HOURLY_SOURCE_COHORT_INCOMPLETE");
  }
});

test("future or malformed refresh times are invalid operational evidence, not a business cutoff", () => {
  for (const time of ["not-a-time", "2026-10-18T13:00:00+07:00"]) {
    const { sourceRead } = describeHourlyStoredSource([source({ source_refresh_at: time })], ["A"]);
    assert.equal(sourceRead.invalidRefreshProducts, 1);
    assert.equal(sourceRead.oldestRefreshAt, null);
  }
  assert.throws(() => describeHourlyStoredSource([source({ source_offset_minutes: 0 })], ["A"]), (error) => error.code === "HOURLY_SOURCE_TIMEZONE_UNVERIFIED");
});

test("adapter uses one parameterized read without changing shared Full or Transfer queries", async () => {
  const calls = [];
  const request = { input(name, _type, value) { calls.push({ name, value }); },
    async query(text) { calls.push({ text }); return { recordset: [source()] }; } };
  await readHourlyStoredStock({ request: () => request }, ["A"], { branchCode: "004" });
  assert.equal(calls[0].name, "productCode0");
  assert.equal(calls[0].value, "A");
  const query = calls[1].text;
  assert.match(query, /LEFT JOIN TCNTPdtQtyNotApv/);
  assert.match(query, /p\.FTPdtCode IN \(@productCode0\)/);
  assert.doesNotMatch(query, /\b(?:EXEC|UPDATE|INSERT|DELETE|ALTER|DROP|NOLOCK)\b/i);
  assert.doesNotMatch(query, /product_name|barcode|cost_avg/i);
});

test("adapter rejects unapproved branches and invalid cohorts before SQL", async () => {
  const pool = { request() { assert.fail("must not query"); } };
  await assert.rejects(readHourlyStoredStock(pool, ["A"], { branchCode: "001" }), (error) => error.code === "HOURLY_SOURCE_BRANCH_NOT_APPROVED");
  for (const cohort of [[], ["A", "A"], [""], Array(501).fill("A")]) {
    await assert.rejects(readHourlyStoredStock(pool, cohort, { branchCode: "004" }), (error) => error.code === "HOURLY_EVIDENCE_COHORT_REQUIRED");
  }
});

test("bounded cancellation rejects the capture and withholds raw SQL failures", async () => {
  let reject;
  let cancelled = false;
  const request = { input() {}, query() { return new Promise((_resolve, fail) => { reject = fail; }); },
    cancel() { cancelled = true; reject(new Error("untrusted SQL failure")); } };
  await assert.rejects(readHourlyStoredStock({ request: () => request }, ["A"], { branchCode: "004", queryTimeoutMs: 5 }),
    (error) => error.code === "HOURLY_SOURCE_TIMEOUT" && !error.message.includes("untrusted"));
  assert.equal(cancelled, true);
});

test("permission denial is distinguished and stops without a fallback or raw source message", async () => {
  let queries = 0;
  const request = { input() {}, async query() {
    queries++;
    throw Object.assign(new Error("private source details"), { number: 229 });
  } };
  await assert.rejects(readHourlyStoredStock({ request: () => request }, ["A"], { branchCode: "004" }),
    (error) => error.code === "HOURLY_SOURCE_ACCESS_DENIED" && error.sourceSqlErrorNumber === 229
      && !error.message.includes("private"));
  assert.equal(queries, 1);
});
