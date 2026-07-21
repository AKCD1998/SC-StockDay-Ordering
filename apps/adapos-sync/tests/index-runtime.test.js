import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runOnce } from "../src/index.js";

const agentRoot = fileURLToPath(new URL("..", import.meta.url));
const entrypoint = fileURLToPath(new URL("../src/index.js", import.meta.url));

function config(overrides = {}) {
  return {
    sqlServerHost: "test-sql", sqlServerInstanceName: "", sqlServerDatabase: "test",
    sqlServerUser: "readonly", sqlServerPort: 1433, branchCode: "005",
    datasets: ["branch_stock"], dryRun: false, skipIfSyncedToday: false,
    dateCutoff: "2026-07-21", dateFrom: null, dateTo: null,
    approvedReceiptsLookbackDays: 14, salesDetailLookbackDays: 7,
    salesDetailChunkDocs: 150, transferChunkDocs: 30,
    productBatchSize: 100, branchStockBatchSize: 100,
    apiBaseUrl: "https://api.test",
    syncV2: { enabled: true, datasets: ["branch_stock"], batchSize: 100, pollIntervalMs: 1, waitTimeoutMs: 10 },
    ...overrides,
  };
}

const stockData = { branch_stock: [{ product_code: "P1", qty: 4, cost_avg: 2 }] };

test("entrypoint validates branch and read-only SQL identity before connecting", async () => {
  let connects = 0;
  await assert.rejects(runOnce({
    syncConfig: config({ branchCode: "" }),
    connectSql: async () => { connects += 1; },
  }), (error) => error.code === "CONFIG_ERROR");
  await assert.rejects(runOnce({
    syncConfig: config({ sqlServerUser: "sa" }),
    connectSql: async () => { connects += 1; },
  }), (error) => error.code === "CONFIG_ERROR");
  assert.equal(connects, 0);
});

test("direct CLI exits nonzero and explains invalid configuration", () => {
  const cases = [
    {
      env: { ADAPOS_SYNC_BRANCH_CODE: "", ADAPOS_SQLSERVER_USER_READONLY: "readonly", ADAPOS_SQLSERVER_USER: "readonly" },
      message: /ERROR: Branch code required/,
    },
    {
      env: { ADAPOS_SYNC_BRANCH_CODE: "005", ADAPOS_SQLSERVER_USER_READONLY: "sa", ADAPOS_SQLSERVER_USER: "sa" },
      message: /ERROR: Connections using 'sa' are blocked/,
    },
  ];
  for (const scenario of cases) {
    const result = spawnSync(process.execPath, [entrypoint], {
      cwd: agentRoot,
      env: { ...process.env, ...scenario.env },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, scenario.message);
    assert.doesNotMatch(result.stderr, /Sync failed:/);
  }
});

function dependencies({ syncConfig = config(), data = stockData, postOverride, waitForApplied } = {}) {
  const trace = [];
  const runLogs = [];
  const postJson = async (url, body) => {
    trace.push(["POST", url, body]);
    if (url.endsWith("/api/sync/run-start")) return { runId: "9" };
    if (url.endsWith("/api/sync/run-log")) { runLogs.push(body); return {}; }
    if (postOverride) return postOverride(url, body);
    return {};
  };
  return {
    trace, runLogs,
    values: {
      syncConfig,
      connectSql: async () => ({ close: async () => trace.push(["SQL_CLOSE"]) }),
      fetchDatasets: async () => data,
      postJson,
      getJson: async (url) => { trace.push(["GET", url]); return { overallStatus: "success", applyStatus: "applied" }; },
      setSyncRunId: (runId) => trace.push(["SET_RUN", runId]),
      ...(waitForApplied ? { waitForApplied } : {}),
    },
  };
}

test("entrypoint executes hybrid success in run-start, stage, finalize, APPLIED, success-log order", async () => {
  const runtime = dependencies();
  await runOnce(runtime.values);
  const network = runtime.trace.filter(([kind]) => kind === "POST" || kind === "GET");
  assert.deepEqual(network.map(([method, url]) => [method, url]), [
    ["POST", "https://api.test/api/sync/run-start"],
    ["POST", "https://api.test/api/sync/ada/branches"],
    ["POST", "https://api.test/api/sync/v2/batches"],
    ["POST", "https://api.test/api/sync/v2/runs/9/finalize"],
    ["GET", "https://api.test/api/sync/v2/runs/9"],
    ["POST", "https://api.test/api/sync/run-log"],
  ]);
  assert.equal(runtime.runLogs.length, 1);
  assert.equal(runtime.runLogs[0].status, "success");
  assert.equal(runtime.runLogs[0].recordsSent, 1);
});

test("entrypoint approved partial failure leaves staged stock inert and writes only failed run-log", async () => {
  const data = {
    ...stockData,
    approved_receipt_headers: [{ FTXihDocNo: "RCPT-1", FTBchCode: "005" }],
    approved_receipt_lines: [],
  };
  const runtime = dependencies({
    syncConfig: config({ datasets: ["branch_stock", "approved_receipts"] }), data,
    postOverride: async (url) => {
      if (url.endsWith("/approved-receipts")) throw Object.assign(new Error("rejected"), { status: 400 });
      return {};
    },
  });
  await assert.rejects(runOnce(runtime.values), (error) => error.code === "CP4_V1_DATASET_FAILED");
  const urls = runtime.trace.filter(([kind]) => kind === "POST" || kind === "GET").map(([, url]) => url);
  assert.ok(urls.includes("https://api.test/api/sync/v2/batches"));
  assert.equal(urls.some((url) => url.includes("/finalize")), false);
  assert.equal(urls.some((url) => url.endsWith("/api/sync/v2/runs/9")), false);
  assert.deepEqual(runtime.runLogs.map((entry) => entry.status), ["failed"]);
});

test("entrypoint poll timeout cannot write a success run-log", async () => {
  const timeout = Object.assign(new Error("wait expired"), { code: "CP4_WAIT_TIMEOUT" });
  const runtime = dependencies({ waitForApplied: async () => { throw timeout; } });
  await assert.rejects(runOnce(runtime.values), (error) => error.code === "CP4_WAIT_TIMEOUT");
  const urls = runtime.trace.filter(([kind]) => kind === "POST").map(([, url]) => url);
  assert.ok(urls.includes("https://api.test/api/sync/v2/runs/9/finalize"));
  assert.deepEqual(runtime.runLogs.map((entry) => entry.status), ["failed"]);
});

test("entrypoint feature-off trace keeps exact v1 branch-stock endpoint and has no v2 URL", async () => {
  const runtime = dependencies({
    syncConfig: config({ syncV2: { enabled: false, datasets: [], batchSize: 100, pollIntervalMs: 1, waitTimeoutMs: 10 } }),
  });
  await runOnce(runtime.values);
  const urls = runtime.trace.filter(([kind]) => kind === "POST" || kind === "GET").map(([, url]) => url);
  assert.ok(urls.includes("https://api.test/api/branch-stock/sync"));
  assert.equal(urls.some((url) => url.includes("/api/sync/v2/")), false);
  assert.deepEqual(runtime.runLogs.map((entry) => entry.status), ["success"]);
});
