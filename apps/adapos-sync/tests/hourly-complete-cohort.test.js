import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readHourlyCompleteCohort } from "../src/hourlyCompleteCohort.js";
import { buildCohortCoverage, cohortCoverageDiagnostics } from "../src/hourlyCohortCoverage.js";
import { buildHourlyEvidencePayload } from "../src/hourlyStockEvidenceClient.js";
import { buildHourlyIntradayPayload } from "../src/hourlyDerivedObservation.js";
import { enqueueHourlyEvidence, flushHourlyEvidenceOutbox } from "../src/hourlyEvidenceStorage.js";
import { resolveHourlyCohortConfig } from "../src/hourlyCohortManifest.js";
import { readHourlyDerivedStock } from "../src/hourlyStockDerivedSource.js";
import { runHourlyStockIntraday, replayHourlyEvidence } from "../src/hourlyStockRunner.js";
import { prepareHourlyCohortManifest } from "../src/prepareHourlyCohortManifest.js";
import { queueHourlyMorningAnchor } from "../src/hourlyMorningAnchor.js";

function temp(t) {
  const parent = path.resolve(os.tmpdir());const dir = fs.mkdtempSync(path.join(parent, "hourly-cohort-test-"));
  t.after(() => { if (!path.resolve(dir).startsWith(parent + path.sep)) throw new Error("Unsafe fixture path");fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
const products = count => Array.from({ length: count }, (_, i) => "SYNTHETIC-" + String(i).padStart(5, "0"));
function fixture(count, missingCount = 0) {
  const codes = products(count), absent = new Set(codes.slice(count - missingCount));let elapsed = 0, guards = 0, queries = 0;
  const now = () => Date.parse("2026-10-20T02:00:00Z") + elapsed;
  const state = { codes, now, monotonic: () => elapsed, advance: ms => { elapsed += ms; }, get guards() { return guards; }, get queries() { return queries; },
    guard: async () => { guards++; },
    pool: { request() { const bound = [];return { input(_key, _type, value) { bound.push(value); }, cancel() {}, async query(text) {
      queries++;elapsed++;
      if (text.includes(" AS is_admin")) return { recordset: [{ machine_name: "SERVER004", database_name: "AdaAcc", database_status: "ONLINE", is_admin: 0, is_owner: 0, is_writer: 0, can_insert: 0, can_update: 0, can_delete: 0 }] };
      if (text.includes(" AS source_available")) return { recordset: bound.map(product_code => ({ product_code, source_available: absent.has(product_code) ? 0 : 1 })) };
      const at = new Date(now()).toISOString();
      if (text.includes("SERVERPROPERTY('MachineName')")) return { recordset: [{ machine_name: "SERVER004", database_name: "AdaAcc", offset_minutes: 420, read_started_at: at }] };
      const rows = bound.map(product_code => ({ product_code, source_stock_code: product_code, source_pending_stock_code: product_code, qty: 10, latest_estimated_on_hand: 8,
        source_wholesale: 0, source_day_end: -2, source_pending_now: -2, source_refresh_at: "2026-10-19T00:00:00.000Z", source_read_at: at, source_offset_minutes: 420 }));
      return { recordset: rows, recordsets: [rows, rows.map(row => ({ FTPdtStkCode: row.product_code, component: "SAL", net_quantity: -2, movement_rows: 1, invalid_rows: 0, outside_branch_rows: 0 })), rows, [{ read_completed_at: at }]] };
    } }; } },
  };return state;
}
for (const count of [50, 100, 200, 500, 501, 1000, 2000, 5000, 6827, 7042, 7050, 10000]) {
  test(`complete cohort ${count}: bounded source batches become one identity-bound capture`, async () => {
    const f = fixture(count);const snapshot = await readHourlyCompleteCohort(f.pool, f.codes, { branchCode: "004", scope: "web-all", guard: f.guard, now: f.now, monotonic: f.monotonic });
    assert.equal(snapshot.rows.length, count);assert.equal(snapshot.sourceRead.productCount, count);assert.equal(snapshot.cohortCoverage.expectedProductCount, count);
    assert.equal(snapshot.cohortCoverage.readBatchCount, Math.ceil(count / 100));assert.equal(f.guards, 2 * Math.ceil(count / 100));
    const capturedAt = new Date(f.now()).toISOString();
    const built = buildHourlyIntradayPayload({ branchCode: "004", observationKind: "intraday", plannedSlot: "09:00", capturedAt, rows: snapshot.rows, cohortCoverage: snapshot.cohortCoverage, clientMeta: { sourceRead: snapshot.sourceRead } }, snapshot.derivedObservation);
    assert.equal(built.payload.records.length, count);assert.equal(built.payload.derivedObservation.records.length, count);assert.ok(Buffer.byteLength(built.body) <= 4 * 1024 * 1024);
    assert.equal(built.payload.derivedObservation.qualifying, false);
  });
}
test("all 7042 web products are accounted for; 215 absent source products remain unavailable instead of zero", async () => {
  const f = fixture(7042, 215), snapshot = await readHourlyCompleteCohort(f.pool, f.codes, { branchCode: "004", guard: f.guard, now: f.now, monotonic: f.monotonic });
  assert.equal(snapshot.rows.length, 6827);assert.equal(snapshot.cohortCoverage.missingProductCodes.length, 215);
  const diagnostic = cohortCoverageDiagnostics(snapshot.cohortCoverage, snapshot.rows.map(row => ({ productCode: row.product_code })), "intraday");
  assert.equal(diagnostic.status, "incomplete-source");assert.equal(diagnostic.expectedProducts, 7042);assert.equal(diagnostic.accountedProducts, 7042);assert.equal(diagnostic.observedProducts, 6827);
  const safe = JSON.stringify(diagnostic);assert.ok(!safe.includes("SYNTHETIC-"));assert.ok(!safe.includes("Sha256"));
});
test("slow reads warn within the approved minute, while busy or expired collections stop", async () => {
  const slow = fixture(200);
  const warned = await readHourlyCompleteCohort(slow.pool, slow.codes, { branchCode: "004", guard: slow.guard, now: slow.now, monotonic: slow.monotonic,
    readBatch: async (pool, codes, options) => { const snapshot = await readHourlyDerivedStock(pool, codes, options);slow.advance(3001);return snapshot; } });
  assert.equal(warned.rows.length, 200);assert.equal(warned.sourceBatchTimings.length, 2);
  assert.ok(warned.sourceBatchTimings.every(batch => batch.timeWarning));assert.equal(slow.guards, 4);
  const busy = fixture(200);let guards = 0;
  await assert.rejects(readHourlyCompleteCohort(busy.pool, busy.codes, { branchCode: "004", guard: async () => { if (++guards === 2) throw Object.assign(new Error("busy"), { code: "SOURCE_BUSY" }); }, now: busy.now, monotonic: busy.monotonic }), { code: "SOURCE_BUSY" });
  assert.equal(guards, 2);
  const expired = fixture(200);
  await assert.rejects(readHourlyCompleteCohort(expired.pool, expired.codes, { branchCode: "004", guard: async () => expired.advance(300001), now: expired.now, monotonic: expired.monotonic }), { code: "HOURLY_COMPLETE_COHORT_WINDOW_EXCEEDED" });
  assert.equal(expired.queries, 0);
});
test("over-limit, duplicate and non-004 cohorts stop before guard or SQL", async () => {
  const f = fixture(50);
  for (const [codes, branchCode] of [[products(10001), "004"], [["duplicate", "duplicate"], "004"], [f.codes, "001"]]) {
    await assert.rejects(readHourlyCompleteCohort(f.pool, codes, { branchCode, guard: f.guard }), { code: "HOURLY_COHORT_COVERAGE_INVALID" });
  }
  assert.equal(f.guards, 0);assert.equal(f.queries, 0);
});

test("minute batch deadlines are explicit opt-in; collection coverage permits five minutes without changing legacy bounds", async () => {
  const legacy=fixture(50);
  await assert.rejects(readHourlyDerivedStock(legacy.pool,legacy.codes,{branchCode:"004",queryTimeoutMs:60000}),{code:"HOURLY_EVIDENCE_COHORT_REQUIRED"});
  assert.equal(legacy.queries,0);
  const extended=fixture(50);
  const one=await readHourlyDerivedStock(extended.pool,extended.codes,{branchCode:"004",queryTimeoutMs:60000,maxQueryTimeoutMs:60000});
  assert.equal(one.rows.length,50);
  const f=fixture(500);
  const result=await readHourlyCompleteCohort(f.pool,f.codes,{branchCode:"004",guard:f.guard,now:f.now,monotonic:f.monotonic,
    readBatch:async(pool,codes,options)=>{assert.equal(options.maxQueryTimeoutMs,60000);const value=await readHourlyDerivedStock(pool,codes,options);f.advance(50000);return value;}});
  assert.equal(result.rows.length,500);assert.ok(result.cohortCoverage.observationWindowMs>120000);
  assert.ok(result.cohortCoverage.observationWindowMs<300000);assert.ok(result.sourceBatchTimings.every(x=>x.timeWarning));
  assert.equal(f.guards,10);
  const tooLong={...result.cohortCoverage,observationWindowMs:300001};
  assert.equal(cohortCoverageDiagnostics(tooLong,result.rows.map(x=>({productCode:x.product_code})),"intraday").status,"invalid");
});
test("13 complete-cohort slots fit the existing outbox without creating 182 independent captures", async t => {
  const cacheDir = temp(t), codes = products(7042), rows = codes.map(product_code => ({ product_code, qty: 10, latest_estimated_on_hand: 8 }));
  for (let slot = 0; slot < 13; slot++) {
    const morning = slot === 0 || slot === 12, plannedSlot = morning ? "08:20" : String(slot + 8).padStart(2, "0") + ":00";
    const observationKind = morning ? "morning_anchor" : "intraday", day = slot === 12 ? "2026-10-21" : "2026-10-20";
    const cohortCoverage = buildCohortCoverage({ expectedProductCodes: codes, rows, observationKind, readBatchSize: morning ? 0 : 100, readBatchCount: morning ? 0 : 71 });
    const built = buildHourlyEvidencePayload({ branchCode: "004", observationKind, plannedSlot, capturedAt: new Date(day + "T" + plannedSlot + ":30+07:00").toISOString(), rows, cohortCoverage, clientMeta: morning ? { authoritativeSyncRunId: "1" } : {} });
    enqueueHourlyEvidence({ cacheDir, branchCode: "004", body: built.body });
  }
  const pending = fs.readdirSync(path.join(cacheDir, "hourly-evidence-outbox/004")).filter(file => file.endsWith(".json"));assert.equal(pending.length, 13);
  const delivered = await flushHourlyEvidenceOutbox({ cacheDir, branchCode: "004", maxUploads: 24, uploadEvidence: async ({ body }) => { const p = JSON.parse(body);return { accepted: p.records.length, branchCode: p.branchCode, capturedAt: p.capturedAt, captureId: "1", duplicate: false }; } });
  assert.equal(delivered.pending, 0);assert.equal(delivered.delivered, 13);
});
test("manifest is not touched while OFF; enabled complete mode requires a bounded explicit manifest", t => {
  const original = { enabled: false, completeCohortEnabled: true, cohortFile: "missing-file" };assert.equal(resolveHourlyCohortConfig(original), original);
  const dir = temp(t), file = path.join(dir, "cohort.json");fs.writeFileSync(file, JSON.stringify({ schemaVersion: "hourly-approved-cohort-v1", scope: "web-all", productCodes: products(7042) }));
  const loaded = resolveHourlyCohortConfig({ enabled: true, completeCohortEnabled: true, cohortFile: file });assert.equal(loaded.productCodes.length, 7042);assert.equal(loaded.cohortScope, "web-all");
});

test("source privilege, availability, clock and deadline faults stop without a partial result", async () => {
  for (const mutation of [{ is_writer: 1 }, { can_update: null }, { database_status: "OFFLINE" }, { machine_name: "other" }]) {
    const f = fixture(200), original = f.pool.request;
    f.pool.request = () => { const request = original();const query = request.query;
      request.query = async text => { const result = await query(text);if (text.includes(" AS is_admin")) Object.assign(result.recordset[0], mutation);return result; };return request; };
    await assert.rejects(readHourlyCompleteCohort(f.pool, f.codes, { branchCode: "004", guard: f.guard, now: f.now, monotonic: f.monotonic }), { code: "HOURLY_SOURCE_READONLY_BOUNDARY_UNVERIFIED" });
    assert.equal(f.queries, 1);
  }
  const missing = fixture(100, 100);
  await assert.rejects(readHourlyCompleteCohort(missing.pool, missing.codes, { branchCode: "004", guard: missing.guard, now: missing.now, monotonic: missing.monotonic }), { code: "HOURLY_COMPLETE_COHORT_NO_SOURCE_ROWS" });
  const stepped = fixture(200);let adjustment = 0;
  await assert.rejects(readHourlyCompleteCohort(stepped.pool, stepped.codes, { branchCode: "004", guard: async () => { adjustment = 1000; }, now: () => stepped.now() + adjustment, monotonic: stepped.monotonic }), { code: "HOURLY_OBSERVER_CLOCK_STEP_DETECTED" });
  assert.equal(stepped.queries, 0);
  const expired = fixture(200);
  await assert.rejects(readHourlyCompleteCohort(expired.pool, expired.codes, { branchCode: "004", guard: expired.guard, now: expired.now, monotonic: expired.monotonic,
    readBatch: async (pool, codes, options) => { const value = await readHourlyDerivedStock(pool, codes, options);expired.advance(60001);return value; } }), { code: "HOURLY_SOURCE_TIMEOUT" });
  assert.equal(expired.guards, 1);
});

test("combining batches never hides inconsistent source clock evidence", async () => {
  const f=fixture(200);let batch=0;
  const snapshot=await readHourlyCompleteCohort(f.pool,f.codes,{branchCode:"004",guard:f.guard,now:f.now,monotonic:f.monotonic,
    readBatch:async(pool,codes,options)=>{const value=await readHourlyDerivedStock(pool,codes,options);value.sourceClockDiagnostics=++batch===1
      ?{status:"inconsistent",maxRoundTripMs:10,maxWallMonotonicDifferenceMs:1}
      :{status:"observed-unverified",sqlMinusObserverLowerMs:-5,sqlMinusObserverUpperMs:5,maxRoundTripMs:20,maxWallMonotonicDifferenceMs:2};return value;}});
  assert.equal(snapshot.sourceClockDiagnostics.status,"inconsistent");assert.equal(snapshot.sourceClockDiagnostics.qualifying,false);
  assert.equal(snapshot.sourceClockDiagnostics.sqlMinusObserverLowerMs,null);assert.equal(snapshot.sourceClockDiagnostics.maxRoundTripMs,20);
});

test("full runner closes SQL, preserves exact failed-upload body, replays without a read, and anchors only successful Full", async t => {
  const cacheDir = temp(t), f = fixture(7042, 215), manifest = path.join(cacheDir, "approved.json");
  fs.writeFileSync(manifest, JSON.stringify({ schemaVersion: "hourly-approved-cohort-v1", scope: "web-all", productCodes: f.codes }));
  const evidence = { enabled: true, completeCohortEnabled: true, cohortFile: manifest, cacheDir, productCodes: [],
    uploadToken: "synthetic-token".repeat(4), observationKind: "intraday", plannedSlot: "09:00", contentCaptureBranches: new Set() };
  const config = { branchCode: "004", sqlServerUser: "readonly", apiBaseUrl: "https://example.test", hourlyStockEvidence: evidence };
  let closes = 0, reads = 0, firstBody;
  const result = await runHourlyStockIntraday({ syncConfig: config, sqlServerConfig: {}, now: () => new Date(f.now()).toISOString(),
    connectSql: async () => ({ close: async () => { closes++; } }),
    getHourlyStockEvidenceRows: async () => { reads++;return readHourlyCompleteCohort(f.pool, f.codes, { branchCode: "004", scope: "web-all", guard: f.guard, now: f.now, monotonic: f.monotonic }); },
    runHourlyStockShadow: () => ({}), uploadHourlyEvidence: async ({body, maxAttempts}) => { assert.equal(maxAttempts, 1);firstBody = body;throw Object.assign(new Error("lost"), {code:"NETWORK_LOST"}); } });
  assert.equal(closes, 1);assert.equal(reads, 1);assert.equal(result.upload.pending, 1);assert.equal(result.derivedObservationDiagnostics.qualifying, false);
  const replay = await replayHourlyEvidence({ syncConfig: config, uploadHourlyEvidence: async ({body}) => { assert.equal(body, firstBody);const p=JSON.parse(body);return {accepted:p.records.length,branchCode:"004",capturedAt:p.capturedAt,captureId:"1",duplicate:true}; } });
  assert.equal(replay.pending, 0);assert.equal(reads, 1);
  const anchorConfig = { ...config, hourlyStockEvidence: { ...evidence, fullSyncAnchorEnabled: true, observationKind: "morning_anchor", plannedSlot: "08:20" } };
  const rows = f.codes.slice(0,6827).map(product_code => ({product_code,qty:10,latest_estimated_on_hand:8}));
  assert.throws(() => queueHourlyMorningAnchor({config:anchorConfig,rows,capturedAt:"2026-10-20T01:24:00.000Z",syncRunId:"1",acceptedRecords:1}), {code:"HOURLY_EVIDENCE_ANCHOR_INCOMPLETE"});
  const anchor = queueHourlyMorningAnchor({config:anchorConfig,rows,capturedAt:"2026-10-20T01:24:00.000Z",syncRunId:"1",acceptedRecords:rows.length});
  assert.equal(anchor.recordCount,6827);
  const body = JSON.parse(fs.readFileSync(path.join(cacheDir,"hourly-evidence-outbox/004",fs.readdirSync(path.join(cacheDir,"hourly-evidence-outbox/004")).find(name=>name.endsWith(".json"))),"utf8"));
  assert.equal(body.cohortCoverage.missingProductCodes.length,215);assert.equal(body.records.length,6827);
});

test("full delivery budget, invalid acknowledgements and byte cap preserve pending evidence", async t => {
  const cacheDir=temp(t), rows=products(50).map(product_code=>({product_code,qty:10,latest_estimated_on_hand:8}));
  for(const slot of ["09:00","10:00"]) {
    const built=buildHourlyEvidencePayload({branchCode:"004",observationKind:"intraday",plannedSlot:slot,capturedAt:"2026-10-20T"+(slot==="09:00"?"02":"03")+":00:00.000Z",rows});
    enqueueHourlyEvidence({cacheDir,branchCode:"004",body:built.body});
    assert.throws(()=>enqueueHourlyEvidence({cacheDir:temp(t),branchCode:"004",body:built.body,maxPendingBytes:1}),{code:"HOURLY_OUTBOX_FULL"});
  }
  let elapsed=0;
  const budget=await flushHourlyEvidenceOutbox({cacheDir,branchCode:"004",maxDurationMs:60000,maxUploads:24,monotonic:()=>elapsed,uploadEvidence:async({body,timeoutMs,maxAttempts})=>{
    assert.equal(timeoutMs,30000);assert.equal(maxAttempts,1);elapsed=60001;const p=JSON.parse(body);return {accepted:p.records.length,branchCode:"004",capturedAt:p.capturedAt,captureId:"1",duplicate:false};
  }});
  assert.equal(budget.delivered,1);assert.equal(budget.pending,1);assert.equal(budget.errorCode,"HOURLY_DELIVERY_BUDGET_EXHAUSTED");
  const invalid=await flushHourlyEvidenceOutbox({cacheDir,branchCode:"004",uploadEvidence:async()=>({accepted:1})});
  assert.equal(invalid.pending,1);assert.equal(invalid.errorCode,"HOURLY_EVIDENCE_ACK_INVALID");
});

test("private manifest preparation reads web membership while OFF and never prints or changes credentials/config", async t => {
  const cacheDir=temp(t), config={branchCode:"004",apiBaseUrl:"https://example.test",hourlyStockEvidence:{enabled:false,fullSyncAnchorEnabled:false,inlineAfterFullSyncEnabled:false,cacheDir,uploadToken:"synthetic-token".repeat(4)}};
  let calls=0;
  const result=await prepareHourlyCohortManifest({config,now:()=>1,fetchImpl:async(url,options)=>{
    calls++;assert.equal(url.pathname,"/api/hourly-stock-evidence/cohort");assert.equal(options.redirect,"error");
    const bytes=Buffer.from(JSON.stringify({schemaVersion:"hourly-approved-cohort-v1",scope:"web-all",productCodes:products(7042)}));
    return {status:200,body:(async function*(){yield bytes.subarray(0,53);yield bytes.subarray(53);})()};
  }});
  assert.equal(result.productCount,7042);assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes("SYNTHETIC-"));
  assert.equal(config.hourlyStockEvidence.enabled,false);assert.equal(fs.statSync(result.manifestLocation).isFile(),true);
  await assert.rejects(prepareHourlyCohortManifest({config:{...config,hourlyStockEvidence:{...config.hourlyStockEvidence,enabled:true}},fetchImpl:()=>assert.fail("no network while enabled")}),{code:"HOURLY_COHORT_PREPARATION_FAILED"});
  await assert.rejects(prepareHourlyCohortManifest({config,fetchImpl:async()=>{throw new Error("private token or server detail");}}),error=>error.code==="HOURLY_COHORT_PREPARATION_FAILED"&&!error.message.includes("token"));
});
