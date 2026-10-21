import assert from "node:assert/strict";
import test from "node:test";
import { describeHourlyDerivedSamples, readHourlyDerivedStock, ORDINARY_COMPONENTS } from "../src/hourlyStockDerivedSource.js";
import { buildHourlyIntradayPayload, derivedObservationDiagnostics, parseDerivedObservation } from "../src/hourlyDerivedObservation.js";
import { buildHourlyEvidencePayload } from "../src/hourlyStockEvidenceClient.js";
import { describeHourlySourceClock } from "../src/hourlySourceClock.js";

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

test("posting inside either sample suppresses derived even when the two opening samples match", () => {
  const opening = source(10, {}), posted = source(8, {});
  for (const bookends of [{ firstClosingRows: posted, secondClosingRows: opening },
    { firstClosingRows: opening, secondClosingRows: posted }]) {
    const result = describeHourlyDerivedSamples(opening, opening, ["A"], start, bookends);
    assert.deepEqual(result.derivedObservation.records[0], { productCode: "A", derivedOnHand: null, reason: "changed-between-reads" });
    assert.deepEqual(result.rows, describe(opening).rows);
    assert.equal(result.derivedObservation.qualifying, false);
  }
});

test("closing master changes include pending cache, warehouse, refresh, aliases and incomplete cohort", () => {
  for (const overrides of [{ source_wholesale: 1 }, { source_day_end: -1 }, { source_pending_now: 0 },
    { latest_estimated_on_hand: 8 }, { source_refresh_at: "2026-10-18T07:46:21+07:00" }, { source_stock_code: "BASE" }]) {
    const result = describeHourlyDerivedSamples(source(), source(), ["A"], start,
      { firstClosingRows: source(), secondClosingRows: source(10, { SAL: -2 }, overrides) });
    assert.equal(result.derivedObservation.records[0].derivedOnHand, null);
    assert.equal(result.derivedObservation.records[0].reason, "changed-between-reads");
  }
  assert.throws(() => describeHourlyDerivedSamples(source(), source(), ["A"], start,
    { firstClosingRows: [], secondClosingRows: source() }), error => error.code === "HOURLY_SOURCE_COHORT_INCOMPLETE");
});

test("unchanged opening/closing masters still cannot certify NOLOCK movements or ABA", () => {
  const result = describeHourlyDerivedSamples(source(), source(), ["A"], start,
    { firstClosingRows: source(), secondClosingRows: source() });
  assert.equal(result.derivedObservation.records[0].derivedOnHand, 8);
  assert.equal(result.derivedObservation.consistency, "unverified");
  assert.equal(result.derivedObservation.qualifying, false);
  assert.equal(result.derivedObservation.businessCutoffAt, null);
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

function poolFor({ denied = false, identity = "SERVER004", timeout = false, closingRows = source(), failClosing = false } = {}) {
  const calls = [];
  return { calls, request() { return { input(name, _type, value) { calls.push({ name, value }); },
    cancel() { this.reject?.(new Error("private SQL text")); },
    query(text) {
      calls.push({ text });
      if (denied) return Promise.reject(Object.assign(new Error("private source failure"), { number: 229 }));
      if (timeout) return new Promise((_resolve, reject) => { this.reject = reject; });
      if (text.includes("MachineName")) return Promise.resolve({ recordset: [{ machine_name: identity, database_name: "AdaAcc", offset_minutes: 420, read_started_at: start }] });
      const movements = source().map(row => ({ ...row, FTPdtStkCode: "A" }));
      return Promise.resolve({ recordset: source(), recordsets: [source(), movements, failClosing ? undefined : closingRows,
        [{ read_completed_at: "2026-10-18T10:00:00.600+07:00" }]] });
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
  assert.equal(queries[1].match(/FROM dbo\.TCNMPdt p LEFT JOIN/g).length, 2);
  assert.equal(result.sourceClockDiagnostics.qualifying, false);
  assert.equal(JSON.stringify(result.sourceClockDiagnostics).includes("product"), false);
});

test("reader requires closing master evidence; a changed bookend withholds derived without replacing canonical rows", async () => {
  const changed = await readHourlyDerivedStock(poolFor({ closingRows: source(8, {}) }), ["A"], { branchCode: "004" });
  assert.equal(changed.derivedObservation.records[0].derivedOnHand, null);
  assert.equal(changed.derivedObservation.records[0].reason, "changed-between-reads");
  assert.equal(changed.rows[0].qty, 10);
  await assert.rejects(readHourlyDerivedStock(poolFor({ failClosing: true }), ["A"], { branchCode: "004" }),
    error => error.code === "HOURLY_SOURCE_COHORT_INCOMPLETE");
});

test("movement scope reuses parameterized membership at B50 and planned scale sizes without product UNION expansion", async () => {
  for (const count of [50, 100, 200, 276, 500]) {
    const codes = Array.from({ length: count }, (_, i) => `SKU${i}`);
    const pool = poolFor();
    // This fixture returns A rather than the requested cohort. The intended
    // rejection happens after the SQL shape and all bindings are captured.
    await assert.rejects(readHourlyDerivedStock(pool, codes, { branchCode: "004" }),
      error => error.code === "HOURLY_SOURCE_COHORT_INCOMPLETE");
    const batches = pool.calls.filter(call => call.text && !call.text.includes("MachineName"));
    assert.equal(batches.length, 2);
    assert.equal(batches[0].text, batches[1].text);
    const text = batches[0].text;
    assert.match(text, /WITH scope AS \(SELECT p\.FTPdtStkCode AS source_stock_code FROM dbo\.TCNMPdt p\s+WHERE p\.FTPdtStaActive = 1 AND p\.FTPdtCode IN \(@productCode0, /);
    assert.doesNotMatch(text, /WITH cohort|SELECT @productCode\d+ AS product_code/);
    assert.equal((text.match(/ UNION ALL /g) || []).length, 15);
    assert.equal((text.match(/WHERE s\.source_stock_code = v\.FTPdtStkCode/g) || []).length, 16);
    assert.equal((text.match(/FROM dbo\.TCNMPdt p LEFT JOIN/g) || []).length, 2);
    for (let index = 0; index < count; index++) {
      assert.equal(pool.calls.filter(call => call.name === `productCode${index}` && call.value === codes[index]).length, 2);
      assert.ok(!text.includes(codes[index]));
    }
  }
});

test("direct stock scope preserves existential membership for aliases, inactive products and shared stock codes", () => {
  const products = [
    { code: "A", stock: "A", active: 1 }, { code: "ALIAS", stock: "A", active: 1 },
    { code: "OTHER", stock: "B", active: 1 }, { code: "INACTIVE", stock: "C", active: 0 },
  ];
  for (const selected of [["A"], ["ALIAS"], ["A", "ALIAS"], ["INACTIVE"], ["MISSING", "OTHER"]]) {
    const oldScope = selected.flatMap(code => products.filter(p => p.active === 1 && p.code === code).map(p => p.stock));
    const newScope = products.filter(p => p.active === 1 && selected.includes(p.code)).map(p => p.stock);
    for (const movementStock of ["A", "B", "C", "MISSING", null]) {
      assert.equal(oldScope.some(stock => stock === movementStock), newScope.some(stock => stock === movementStock));
    }
  }
});

function transferPool(firstRows, secondRows = firstRows) {
  let sampleIndex = 0;
  const master = source(10, {});
  return { request() { return { input() {}, query(text) {
    if (text.includes("MachineName")) return Promise.resolve({ recordset: [
      { machine_name: "SERVER004", database_name: "AdaAcc", offset_minutes: 420, read_started_at: start }] });
    const grouped = new Map();
    for (const row of sampleIndex++ === 0 ? firstRows : secondRows) {
      const scoped = new RegExp(`FROM dbo\\.VCN_${row.component}QtyNowNotApv v\\s+WHERE \\(v\\.FTBchCode = '004' OR NULLIF\\(LTRIM\\(RTRIM\\(v\\.FTBchCode\\)\\), ''\\) IS NULL\\) AND`).test(text);
      if (scoped && row.branch !== "004" && row.branch != null && row.branch.trim() !== "") continue;
      const group = grouped.get(row.component) ?? { component: row.component, FTPdtStkCode: "A",
        net_quantity: 0, movement_rows: 0, invalid_rows: 0, outside_branch_rows: 0 };
      group.net_quantity += row.quantity;
      group.movement_rows++;
      if (row.branch !== "004" && row.component !== "PosSaleTmp") group.outside_branch_rows++;
      grouped.set(row.component, group);
    }
    return Promise.resolve({ recordset: master, recordsets: [master, [...grouped.values()], master,
      [{ read_completed_at: "2026-10-18T10:00:00.600+07:00" }]] });
  } }; } };
}

test("transfer receipts/issues use their projected stock branch without mixing other branches or changing canonical stock", async () => {
  for (const [component, quantity] of [["TNF41", 5], ["TNF42", -2], ["TNF31", -3], ["TNF32", 1], ["TNF7", 4], ["TNF8", -1]]) {
    const local = { component, branch: "004", quantity };
    const foreign = { component, branch: "001", quantity: -100 };
    const result = await readHourlyDerivedStock(transferPool([local, foreign], [local, { ...foreign, quantity: 200 }]), ["A"], { branchCode: "004" });
    assert.deepEqual(result.derivedObservation.records[0], { productCode: "A", derivedOnHand: 10 + quantity, reason: "observed-unverified" });
    assert.deepEqual(result.rows, [{ product_code: "A", qty: 10, latest_estimated_on_hand: 10 }]);
    assert.equal(result.derivedObservation.qualifying, false);
  }
});

test("foreign-only transfers contribute zero when no local transfer group remains", async () => {
  for (const component of ["TNF41", "TNF42", "TNF31", "TNF32", "TNF7", "TNF8"]) {
    const rows = ["001", "005"].map(branch => ({ component, branch, quantity: -100 }));
    const result = await readHourlyDerivedStock(transferPool(rows), ["A"], { branchCode: "004" });
    assert.equal(result.derivedObservation.records[0].derivedOnHand, 10);
    assert.equal(result.derivedObservation.records[0].reason, "observed-unverified");
  }
});

test("missing transfer branch identities still suppress derived quantities rather than becoming zero", async () => {
  for (const component of ["TNF41", "TNF42", "TNF31", "TNF32", "TNF7", "TNF8"]) {
    for (const branch of ["", "   ", null]) {
      const result = await readHourlyDerivedStock(transferPool([{ component, branch, quantity: -100 }]), ["A"], { branchCode: "004" });
      assert.deepEqual(result.derivedObservation.records[0], { productCode: "A", derivedOnHand: null, reason: "outside-branch-movement" });
    }
  }
});

test("local transfer posting changes still suppress derived values and foreign non-transfer rows still fail closed", async () => {
  const local = { component: "TNF42", branch: "004", quantity: -2 };
  const changing = await readHourlyDerivedStock(transferPool([local], [{ ...local, quantity: -3 }]), ["A"], { branchCode: "004" });
  assert.deepEqual(changing.derivedObservation.records[0], { productCode: "A", derivedOnHand: null, reason: "changed-between-reads" });
  for (const component of ["SAL", "CSM", "PI", "PT", "SI", "ST", "ChkStkSale", "ChkStkStop", "PICK"]) {
    const result = await readHourlyDerivedStock(transferPool([{ component, branch: "001", quantity: -2 }]), ["A"], { branchCode: "004" });
    assert.deepEqual(result.derivedObservation.records[0], { productCode: "A", derivedOnHand: null, reason: "outside-branch-movement" });
  }
  await assert.rejects(readHourlyDerivedStock(transferPool([]), ["A"], { branchCode: "001" }),
    error => error.code === "HOURLY_SOURCE_BRANCH_NOT_APPROVED");
});
test("source access denial/timeout/wrong machine stop without fallback, retry or exposed SQL", async () => {
  for (const [settings, code] of [[{ denied: true }, "HOURLY_SOURCE_ACCESS_DENIED"], [{ timeout: true }, "HOURLY_SOURCE_TIMEOUT"], [{ identity: "OTHER" }, "HOURLY_SOURCE_IDENTITY_UNVERIFIED"]]) {
    const pool = poolFor(settings);
    await assert.rejects(readHourlyDerivedStock(pool, ["A"], { branchCode: "004", queryTimeoutMs: settings.timeout ? 5 : 10_000 }),
      error => error.code === code && !error.message.includes("private"));
    assert.equal(pool.calls.filter(call => call.text).length, 1);
  }
});

test("backward wall-clock adjustment cannot extend the reader deadline", async t => {
  let wallCalls = 0, pending;
  t.mock.method(Date, "now", () => wallCalls++ === 0 ? 1_000_000 : 0);
  const pool = { request() { return { input() {}, cancel() { pending?.(new Error("cancelled fixture")); },
    query(text) {
      if (text.includes("MachineName")) return Promise.resolve({ recordset: [
        { machine_name: "SERVER004", database_name: "AdaAcc", offset_minutes: 420, read_started_at: start }] });
      return new Promise((_resolve, reject) => { pending = reject; });
    } }; } };
  // Watchdog only cleans up a broken mock implementation; it never operates
  // on a real SQL request, service, or source process.
  const watchdog = setTimeout(() => pending?.(new Error("fixture watchdog")), 100);
  try {
    await assert.rejects(readHourlyDerivedStock(pool, ["A"], { branchCode: "004", queryTimeoutMs: 5 }),
      error => error.code === "HOURLY_SOURCE_TIMEOUT");
  } finally { clearTimeout(watchdog); }
});

const clockSample = (sourceMs, startMs = 1000, endMs = 1100, elapsedMs = endMs - startMs) => ({
  sourceAt: new Date(sourceMs).toISOString(), startedAtMs: startMs, completedAtMs: endMs, elapsedMs,
});
test("clock diagnostics retain an offset interval and distinguish remote observer from source Agent", () => {
  const samples = [clockSample(1250), clockSample(2250, 2000, 2100)];
  const remote = describeHourlySourceClock(samples, { observerHost: "SCPRODUCTDEV", sourceHost: "SERVER004" });
  assert.equal(remote.observerContext, "remote-observer");
  assert.equal(remote.reason, "remote-clock-offset-is-not-agent-clock-offset");
  assert.equal(remote.sqlMinusObserverLowerMs, 148);
  assert.equal(remote.sqlMinusObserverUpperMs, 252);
  assert.equal(remote.qualifying, false);
  const local = describeHourlySourceClock([clockSample(1050)], { observerHost: "server004", sourceHost: "SERVER004" });
  assert.equal(local.observerContext, "source-host");
  assert.ok(local.sqlMinusObserverLowerMs <= 0 && local.sqlMinusObserverUpperMs >= 0);
  assert.equal(local.qualifying, false);
  assert.equal(local.businessCutoffAt, null);
});
test("clock diagnostics include latency/clock-step uncertainty and reject contradictory measurements without correcting timestamps", () => {
  const sample = clockSample(1100, 1000, 1500, 100);
  const before = structuredClone(sample);
  const result = describeHourlySourceClock([sample]);
  assert.equal(result.maxWallMonotonicDifferenceMs, 400);
  assert.equal(result.sqlMinusObserverLowerMs, -802);
  assert.equal(result.sqlMinusObserverUpperMs, 502);
  assert.deepEqual(sample, before);
  const inconsistent = describeHourlySourceClock([clockSample(1050), clockSample(5000)]);
  assert.equal(inconsistent.status, "inconsistent");
  assert.equal(inconsistent.sqlMinusObserverLowerMs, null);
  assert.equal(inconsistent.sqlMinusObserverUpperMs, null);
  assert.equal(inconsistent.qualifying, false);
});
test("missing/invalid clock samples never become a freshness or synchronization PASS", () => {
  assert.equal(describeHourlySourceClock([]).status, "missing");
  for (const sample of [null, { ...clockSample(1000), completedAtMs: 900 },
    { ...clockSample(1000), sourceAt: "2026-10-18 10:00:00" }, { ...clockSample(1000), elapsedMs: NaN }]) {
    const result = describeHourlySourceClock([sample]);
    assert.equal(result.status, "invalid");
    assert.equal(result.qualifying, false);
  }
});
