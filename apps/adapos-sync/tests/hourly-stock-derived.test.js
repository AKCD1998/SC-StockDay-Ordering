import assert from "node:assert/strict";
import test from "node:test";
import { describeHourlyDerivedSamples, readHourlyDerivedStock, ORDINARY_COMPONENTS } from "../src/hourlyStockDerivedSource.js";
import { buildHourlyIntradayPayload, derivedObservationDiagnostics, parseDerivedObservation } from "../src/hourlyDerivedObservation.js";
import { buildHourlyEvidencePayload } from "../src/hourlyStockEvidenceClient.js";

const start = "2026-10-18T03:00:00.000Z", capturedAt = "2026-10-18T03:00:01.000Z";
function source(retail = 10, movements = { SAL: -2 }, overrides = {}) {
  const base = { product_code: "A", source_stock_code: "A", source_pending_stock_code: "A",
    qty: retail, latest_estimated_on_hand: 10, source_wholesale: 0, source_day_end: 0, source_pending_now: -2,
    source_refresh_at: "2026-10-18T07:46:20+07:00", source_read_at: "2026-10-18T10:00:00.500+07:00",
    source_offset_minutes: 420, ...overrides };
  const entries = Object.entries(movements);
  return entries.length ? entries.map(([component, net_quantity]) => ({ ...base, component, net_quantity,
    movement_rows: 1, invalid_rows: 0, outside_branch_rows: 0 })) : [{ ...base, component: null }];
}
const describe = (a, b = a) => describeHourlyDerivedSamples(a, b, ["A"], start);
const options = rows => ({ branchCode: "004", observationKind: "intraday", plannedSlot: "10:00", capturedAt, rows });

test("ordinary formula remains separate: signed retail + wholesale + all 16 pending components; no cached double count", () => {
  const snap = describe(source(10, Object.fromEntries(ORDINARY_COMPONENTS.map((key, index) => [key, index % 2 ? 1 : -2])), { source_wholesale: 3 }));
  assert.equal(snap.derivedObservation.records[0].derivedOnHand, 5);
  assert.deepEqual(snap.rows, [{ product_code: "A", qty: 10, latest_estimated_on_hand: 10 }]);
  assert.equal(snap.derivedObservation.qualifying, false);
  assert.equal(snap.derivedObservation.businessCutoffAt, null);
});

test("posting state machine: before and after committed posting reconcile; crossing/torn reads suppress derived values", () => {
  // Business invariant is 8. Source posting transfers -2 from pending to retail.
  const before = source(10, { SAL: -2 }), after = source(8, {});
  assert.equal(describe(before).derivedObservation.records[0].derivedOnHand, 8);
  assert.equal(describe(after).derivedObservation.records[0].derivedOnHand, 8);
  for (const pair of [[before, after], [after, before], [source(10, {}), after], [source(8, { SAL: -2 }), after]]) {
    const snap = describe(...pair);
    assert.deepEqual(snap.derivedObservation.records[0], { productCode: "A", derivedOnHand: null, reason: "changed-between-reads" });
    assert.equal(derivedObservationDiagnostics(snap.derivedObservation, [{ productCode: "A", latestEstimatedOnHand: 10 }], capturedAt).status, "changed");
  }
});

test("equal dirty reads and ABA remain explicitly unverified, never a consistency or freshness PASS", () => {
  for (const dirty of [source(10, {}), source(8, { SAL: -2 }), source()]) {
    const snap = describe(dirty); // Includes an unobservable A -> B -> A sequence.
    const diag = derivedObservationDiagnostics(snap.derivedObservation, [{ productCode: "A", latestEstimatedOnHand: 10 }], capturedAt);
    assert.equal(diag.status, "unverified");
    assert.equal(diag.consistency, "unverified");
    assert.equal(diag.qualifying, false);
    assert.equal(diag.businessCutoffAt, null);
  }
});

test("movement changes cannot hide behind an unchanged grand total; counts and refresh changes also invalidate", () => {
  const a = source(10, { SAL: -2, SI: -3 }), b = source(10, { SAL: -3, SI: -2 });
  assert.equal(describe(a, b).derivedObservation.records[0].derivedOnHand, null);
  for (const changed of [source(10, { SAL: -2 }, { source_refresh_at: "2026-10-18T07:46:21+07:00" }),
    source().map(row => ({ ...row, movement_rows: 2 }))]) {
    assert.equal(describe(source(), changed).derivedObservation.records[0].reason, "changed-between-reads");
  }
});

test("missing movement rows mean zero; null components, aliases and foreign branch rows do not", () => {
  assert.equal(describe(source(-4, {}, { source_wholesale: 1 })).derivedObservation.records[0].derivedOnHand, -3);
  for (const [rows, reason] of [
    [source(10, { SAL: null }), "invalid-source-component"],
    [source(10, {}, { source_wholesale: null }), "invalid-source-component"],
    [source(10, {}, { source_stock_code: "BASE" }), "non-master-stock-code"],
    [source().map(row => ({ ...row, outside_branch_rows: 1 })), "outside-branch-movement"],
    [source().map(row => ({ ...row, invalid_rows: 1 })), "invalid-source-component"],
  ]) {
    assert.deepEqual(describe(rows).derivedObservation.records[0], { productCode: "A", derivedOnHand: null, reason });
  }
  assert.throws(() => describe([source()[0], source()[0]]), error => error.code === "HOURLY_SOURCE_COHORT_INCOMPLETE");
  assert.throws(() => describe([]), error => error.code === "HOURLY_SOURCE_COHORT_INCOMPLETE");
});

test("derived content is identity-bound; legacy and morning payloads retain their existing exact bytes", () => {
  const snap = describe(source());
  const opts = options(snap.rows);
  assert.deepEqual(buildHourlyIntradayPayload(opts), buildHourlyEvidencePayload(opts));
  const built = buildHourlyIntradayPayload(opts, snap.derivedObservation);
  assert.notEqual(built.payload.idempotencyKey, buildHourlyEvidencePayload(opts).payload.idempotencyKey);
  const changed = structuredClone(snap.derivedObservation); changed.records[0].derivedOnHand++;
  assert.notEqual(built.payload.idempotencyKey, buildHourlyIntradayPayload(opts, changed).payload.idempotencyKey);
  const morning = { ...opts, observationKind: "morning_anchor", plannedSlot: "08:20", capturedAt: "2026-10-18T01:20:01.000Z", clientMeta: { authoritativeSyncRunId: "1" } };
  assert.deepEqual(buildHourlyIntradayPayload(morning), buildHourlyEvidencePayload(morning));
  assert.throws(() => buildHourlyIntradayPayload(morning, snap.derivedObservation));
  assert.throws(() => buildHourlyIntradayPayload({ ...opts, branchCode: "001" }, snap.derivedObservation));
});

test("derived schema rejects extra fields, false freshness claims, bad windows/cohorts and unsafe nulls", () => {
  const value = describe(source()).derivedObservation, rows = [{ productCode: "A" }];
  for (const changed of [{ ...value, extra: true }, { ...value, qualifying: true }, { ...value, consistency: "verified" },
    { ...value, businessCutoffAt: start }, { ...value, readStartedAt: capturedAt },
    { ...value, readStartedAt: "2026-10-18T02:59:00.000Z" }, { ...value, records: [] },
    { ...value, records: [{ productCode: "A", derivedOnHand: null, reason: "observed-unverified" }] },
    { ...value, records: [{ productCode: "A", derivedOnHand: 8, reason: "changed-between-reads" }] }]) {
    assert.throws(() => parseDerivedObservation(changed, rows, capturedAt));
  }
});

test("combined derived payload retains the existing 256 KiB bound, including multi-byte product identities", () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ product_code: String(i).padStart(4, "0") + "ก".repeat(76), qty: 1, latest_estimated_on_hand: 1 }));
  const observation = { ...describe(source()).derivedObservation, records: rows.map(row => ({ productCode: row.product_code, derivedOnHand: 1, reason: "observed-unverified" })) };
  assert.ok(Buffer.byteLength(buildHourlyEvidencePayload(options(rows)).body, "utf8") < 256 * 1024);
  assert.throws(() => buildHourlyIntradayPayload(options(rows), observation), /256 KiB/);
});

function poolFor({ denied = false, identity = "SERVER004", timeout = false } = {}) {
  const calls = [];
  return { calls, request() { return { input(name, _type, value) { calls.push({ name, value }); },
    cancel() { this.reject?.(new Error("private SQL text")); },
    query(text) {
      calls.push({ text });
      if (denied) return Promise.reject(Object.assign(new Error("private source failure"), { number: 229 }));
      if (timeout) return new Promise((_resolve, reject) => { this.reject = reject; });
      if (text.includes("MachineName")) return Promise.resolve({ recordset: [{ machine_name: identity, database_name: "AdaAcc", offset_minutes: 420, read_started_at: start }] });
      const movements = source().map(row => ({ ...row, FTPdtStkCode: "A" }));
      return Promise.resolve({ recordset: source(), recordsets: [source(), movements, [{ read_completed_at: "2026-10-18T10:00:00.600+07:00" }]] });
    } }; } };
}
test("bounded reader verifies source identity and reads two parameterized ordinary16 samples with no source mutation", async () => {
  const pool = poolFor();
  const result = await readHourlyDerivedStock(pool, ["A"], { branchCode: "004" });
  assert.equal(result.derivedObservation.records[0].derivedOnHand, 8);
  const queries = pool.calls.filter(call => call.text).map(call => call.text);
  assert.equal(queries.length, 3);
  assert.equal(queries[1], queries[2]);
  for (const component of ORDINARY_COMPONENTS) assert.match(queries[1], new RegExp(`VCN_${component}QtyNowNotApv`));
  assert.match(queries[1], /PICK/);
  assert.doesNotMatch(queries[1], /NotApvEx|SET\s|\b(?:EXEC|UPDATE|INSERT|DELETE|ALTER|DROP|NOLOCK)\b/i);
  assert.equal(pool.calls.filter(call => call.name === "productCode0").length, 2);
  assert.match(queries[1], /PosSaleTmp[\s\S]*1=0/);
});
test("source access denial/timeout/wrong machine stop without fallback, retry or exposed SQL", async () => {
  for (const [settings, code] of [[{ denied: true }, "HOURLY_SOURCE_ACCESS_DENIED"], [{ timeout: true }, "HOURLY_SOURCE_TIMEOUT"], [{ identity: "OTHER" }, "HOURLY_SOURCE_IDENTITY_UNVERIFIED"]]) {
    const pool = poolFor(settings);
    await assert.rejects(readHourlyDerivedStock(pool, ["A"], { branchCode: "004", queryTimeoutMs: settings.timeout ? 5 : 10_000 }),
      error => error.code === code && !error.message.includes("private"));
    assert.equal(pool.calls.filter(call => call.text).length, 1);
  }
});
