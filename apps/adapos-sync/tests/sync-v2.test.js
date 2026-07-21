import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeterministicBatches,
  finalizeRun,
  formatCp4Result,
  handoffBranchStock,
  isRetryableV2Error,
  parseV2Config,
  startHybridRun,
  uploadStagedBatches,
  waitForApplied,
} from "../src/sync-v2.js";

const enabledDatasets = ["products", "branch_stock", "branch_stock_history"];

test("v2 config defaults off and validates release gates", () => {
  const defaults = parseV2Config({}, enabledDatasets);
  assert.deepEqual(defaults, { datasets: [], batchSize: 100, waitForApply: true, pollIntervalMs: 2000, waitTimeoutMs: 1800000, enabled: false });
  assert.throws(() => parseV2Config({ ADAPOS_SYNC_V2_DATASETS: "products" }, enabledDatasets), /Unknown/);
  assert.throws(() => parseV2Config({ ADAPOS_SYNC_V2_DATASETS: "branch_stock" }, ["products"]), /must also be present/);
  for (const value of ["0", "101", "1.5", "abc"]) {
    assert.throws(() => parseV2Config({ ADAPOS_SYNC_V2_BATCH_SIZE: value }, enabledDatasets), /integer from 1 to 100/);
  }
  assert.throws(() => parseV2Config({ ADAPOS_SYNC_V2_DATASETS: "branch_stock", ADAPOS_SYNC_V2_WAIT_FOR_APPLY: "false" }, enabledDatasets), /must be true/);
});

test("deterministic batches preserve order and exact manifest counts", () => {
  const records = Array.from({ length: 5 }, (_, id) => ({ id }));
  const batches = createDeterministicBatches(records, 2);
  assert.deepEqual(batches.map((batch) => batch.batchSeq), [1, 2, 3]);
  assert.deepEqual(batches.flatMap((batch) => batch.records), records);
  assert.deepEqual(batches.map((batch) => batch.records.length), [2, 2, 1]);
  assert.throws(() => createDeterministicBatches([], 100), /zero records/);
});

test("hybrid run-start clears stale identity, sends contract body, and requires runId", async () => {
  const events = [];
  const runId = await startHybridRun({
    baseUrl: "https://api.test", branchCode: "005",
    setSyncRunId: (value) => events.push(["set", value]),
    postJson: async (url, body) => { events.push(["post", url, body]); return { runId: 77 }; },
  });
  assert.equal(runId, "77");
  assert.deepEqual(events, [
    ["set", null],
    ["post", "https://api.test/api/sync/run-start", { syncType: "adapos_branch_005", branchCode: "005", ingestionMode: "hybrid_v2", v2Datasets: ["branch_stock"] }],
    ["set", "77"],
  ]);
  await assert.rejects(startHybridRun({ baseUrl: "x", branchCode: "000", setSyncRunId: () => {}, postJson: async () => ({}) }), /no runId/);
  await assert.rejects(startHybridRun({ baseUrl: "x", branchCode: "000", setSyncRunId: () => {}, postJson: async () => { throw new Error("offline"); } }), /offline/);
});

test("feature off uses exact v1 endpoint/body and never calls v2", async () => {
  const calls = [];
  const result = await handoffBranchStock({
    v2Enabled: false, baseUrl: "https://api.test", branchCode: "000", records: [{ id: 1 }],
    v1BatchSize: 100, postJson: async () => assert.fail("postJson is delegated, not called directly"),
    postV1Batches: async (options) => { calls.push(options); return 1; },
  });
  assert.equal(result.mode, "v1"); assert.equal(result.sent, 1);
  assert.equal(calls[0].url, "https://api.test/api/branch-stock/sync");
  assert.deepEqual(calls[0].extraBody, { branchCode: "000" });
  assert.equal(calls[0].batchSize, 100);
});

test("feature on uses v2 only with deterministic payload and no v1 fallback", async () => {
  const posts = []; let v1Calls = 0;
  const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const result = await handoffBranchStock({
    v2Enabled: true, baseUrl: "https://api.test", syncRunId: "9", branchCode: "000", records,
    v2BatchSize: 2, postJson: async (url, body) => posts.push({ url, body }),
    postV1Batches: async () => { v1Calls += 1; },
  });
  assert.equal(v1Calls, 0); assert.deepEqual(result.manifest, { dataset: "branch_stock", batchCount: 2, recordCount: 3 });
  assert.deepEqual(posts.map((call) => call.body.batchSeq), [1, 2]);
  assert.deepEqual(posts.flatMap((call) => call.body.records), records);
});

test("v2 upload retries only transient failures with byte-equivalent payload and counts once", async () => {
  let calls = 0; const serialized = [];
  const manifest = await uploadStagedBatches({
    baseUrl: "x", syncRunId: "1", records: [{ id: 1 }], batchSize: 100,
    sleep: async () => {}, random: () => 0, logger: { warn: () => {} },
    postJson: async (_url, body) => { calls += 1; serialized.push(JSON.stringify(body)); if (calls < 3) throw Object.assign(new Error("timeout"), { code: "REQUEST_TIMEOUT" }); },
  });
  assert.equal(calls, 3); assert.equal(new Set(serialized).size, 1);
  assert.deepEqual(manifest, { dataset: "branch_stock", batchCount: 1, recordCount: 1 });
  assert.equal(isRetryableV2Error(new TypeError("network")), true);
  assert.equal(isRetryableV2Error(Object.assign(new Error(), { status: 429 })), true);
  assert.equal(isRetryableV2Error(Object.assign(new Error(), { status: 503 })), true);
  assert.equal(isRetryableV2Error(Object.assign(new Error(), { status: 400 })), false);
  let badCalls = 0;
  await assert.rejects(uploadStagedBatches({ baseUrl: "x", syncRunId: "1", records: [{ id: 1 }], batchSize: 100, sleep: async () => {}, postJson: async () => { badCalls += 1; throw Object.assign(new Error("bad"), { status: 422 }); } }), /bad/);
  assert.equal(badCalls, 1);
});

test("finalize sends the exact uploaded manifest once", async () => {
  const calls = []; const manifest = { dataset: "branch_stock", batchCount: 2, recordCount: 150 };
  await finalizeRun({ baseUrl: "https://api.test", syncRunId: "12", manifest, postJson: async (...args) => calls.push(args) });
  assert.deepEqual(calls, [["https://api.test/api/sync/v2/runs/12/finalize", manifest]]);
});

test("polling succeeds only after applied, survives transient GET, and is bounded", async () => {
  let time = 0; let calls = 0; const warnings = [];
  const result = await waitForApplied({
    baseUrl: "x", syncRunId: "1", pollIntervalMs: 10, waitTimeoutMs: 100,
    now: () => time, sleep: async (ms) => { time += ms; }, logger: { warn: (message) => warnings.push(message) },
    getJson: async () => { calls += 1; if (calls === 1) throw new TypeError("network"); if (calls === 2) return { overallStatus: "running", applyStatus: "pending" }; return { overallStatus: "success", applyStatus: "applied" }; },
  });
  assert.equal(result.applyStatus, "applied"); assert.equal(warnings.length, 1);

  await assert.rejects(waitForApplied({ baseUrl: "x", syncRunId: "2", pollIntervalMs: 10, waitTimeoutMs: 20, now: () => time, sleep: async (ms) => { time += ms; }, getJson: async () => ({ overallStatus: "failed", applyStatus: "failed" }) }), (error) => error.code === "CP4_APPLY_FAILED");
  time = 0;
  await assert.rejects(waitForApplied({ baseUrl: "x", syncRunId: "3", pollIntervalMs: 10, waitTimeoutMs: 25, now: () => time, sleep: async (ms) => { time += ms; }, logger: { warn: () => {} }, getJson: async () => ({ overallStatus: "running", applyStatus: "pending" }) }), (error) => error.code === "CP4_WAIT_TIMEOUT");
  assert.equal(time, 25);
});

test("terminal result formatting contains no payload or secret material", () => {
  const line = formatCp4Result("FAILED", { runId: "7", records: 100, batches: 1 });
  assert.equal(line, "CP4: RESULT=FAILED runId=7 dataset=branch_stock batches=1 records=100");
  assert.doesNotMatch(line, /token|api.?key|password|payload|postgresql:\/\//i);
});
