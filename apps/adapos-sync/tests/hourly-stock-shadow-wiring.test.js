import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { runOnce } from "../src/index.js";

function config(overrides = {}) {
  return {
    sqlServerHost: "test-sql", sqlServerInstanceName: "", sqlServerDatabase: "test",
    sqlServerUser: "readonly", sqlServerPort: 1433, branchCode: "004",
    datasets: ["branch_stock"], dryRun: false, skipIfSyncedToday: false,
    dateCutoff: "2026-09-13", dateFrom: null, dateTo: null,
    approvedReceiptsLookbackDays: 14, salesDetailLookbackDays: 7,
    salesDetailChunkDocs: 150, transferChunkDocs: 30,
    productBatchSize: 100, branchStockBatchSize: 100,
    apiBaseUrl: "https://api.test",
    syncV2: { enabled: true, datasets: ["branch_stock"], batchSize: 100, pollIntervalMs: 1, waitTimeoutMs: 10 },
    hourlyStockEvidence: {
      enabled: false,
      inlineAfterFullSyncEnabled: false,
      cacheDir: "unused",
      contentCaptureBranches: new Set(),
      observationKind: "morning_anchor",
    },
    ...overrides,
  };
}

function runtime(syncConfig, overrides = {}) {
  const events = [];
  const posts = [];
  const rows = [{ product_code: "P1", qty: 20, latest_estimated_on_hand: 19, cost_avg: 2 }];
  return {
    events,
    posts,
    values: {
      syncConfig,
      connectSql: async () => ({ close: async () => events.push("sql-close") }),
      fetchDatasets: async () => ({ branch_stock: rows }),
      postJson: async (url, body) => {
        events.push(url);
        posts.push({ url, body });
        if (url.endsWith("/api/sync/run-start")) return { runId: "101" };
        return {};
      },
      getJson: async () => ({ overallStatus: "success", applyStatus: "applied" }),
      setSyncRunId: () => {},
      runHourlyStockShadow: (args) => { events.push(["shadow", args]); return {}; },
      ...overrides,
    },
  };
}

async function capturedBranchStockSql({ enabled, branchCode = "004" }) {
  const statements = [];
  const pool = {
    request() {
      const request = {
        input() { return request; },
        async query(sql) { statements.push(sql); return { recordset: [] }; },
      };
      return request;
    },
    async close() {},
  };
  await runOnce({
    syncConfig: config({
      branchCode,
      dryRun: true,
      syncV2: { enabled: false, datasets: [], batchSize: 100, pollIntervalMs: 1, waitTimeoutMs: 10 },
      hourlyStockEvidence: {
        enabled: false,
        inlineAfterFullSyncEnabled: enabled,
        cacheDir: "unused",
        contentCaptureBranches: new Set([branchCode]),
        observationKind: "morning_anchor",
      },
    }),
    connectSql: async () => pool,
  });
  assert.equal(statements.length, 1);
  return statements[0];
}

test("routing keeps the legacy SQL projection OFF and adds FCPdtQtyNow only for enabled active branches", async () => {
  const offSql = await capturedBranchStockSql({ enabled: false });
  const onSql = await capturedBranchStockSql({ enabled: true });
  const inactiveSql = await capturedBranchStockSql({ enabled: true, branchCode: "002" });
  assert.doesNotMatch(offSql, /FCPdtQtyNow/);
  assert.match(onSql, /FCPdtQtyNow/);
  assert.doesNotMatch(inactiveSql, /FCPdtQtyNow/);
});

test("feature OFF preserves the branch-stock payload and never calls hourly shadow", async () => {
  const candidate = runtime(config());
  await runOnce(candidate.values);
  assert.equal(candidate.events.some((event) => Array.isArray(event) && event[0] === "shadow"), false);
  const batchEvent = candidate.events.find((event) => typeof event === "string" && event.endsWith("/api/sync/v2/batches"));
  assert.ok(batchEvent);
  const postedStock = candidate.posts.find(({ url }) => url.endsWith("/api/sync/v2/batches")).body.records[0];
  assert.deepEqual(postedStock, {
    productCode: "P1",
    branchCode: "004",
    productNameThai: "",
    productNameEng: "",
    barcode: "",
    unit: "",
    qty: 20,
    costAvg: 2,
    syncedAt: postedStock.syncedAt,
  });
  assert.equal("latestEstimatedOnHand" in postedStock, false);
});

test("feature ON runs only after CP4 terminal apply and passes an exact acknowledgement", async () => {
  const candidate = runtime(config({
    hourlyStockEvidence: {
      enabled: false,
      inlineAfterFullSyncEnabled: true,
      cacheDir: "unused",
      contentCaptureBranches: new Set(["004"]),
      observationKind: "morning_anchor",
    },
  }));
  candidate.values.waitForApplied = async () => { candidate.events.push("applied"); };
  await runOnce(candidate.values);
  const appliedIndex = candidate.events.indexOf("applied");
  const shadowIndex = candidate.events.findIndex((event) => Array.isArray(event) && event[0] === "shadow");
  assert.ok(appliedIndex >= 0 && shadowIndex > appliedIndex);
  const args = candidate.events[shadowIndex][1];
  assert.equal(args.rows[0].qty, 20);
  assert.equal(args.rows[0].latest_estimated_on_hand, 19);
  assert.deepEqual(args.acknowledgement, { authoritativeApplied: true, acceptedRecords: 1 });
  const postedStock = candidate.posts.find(({ url }) => url.endsWith("/api/sync/v2/batches")).body.records[0];
  assert.equal("latestEstimatedOnHand" in postedStock, false);
  assert.equal(postedStock.qty, 20);
});

test("failed authoritative branch-stock apply prevents hourly shadow invocation", async () => {
  const candidate = runtime(config({
    hourlyStockEvidence: {
      enabled: false,
      inlineAfterFullSyncEnabled: true,
      cacheDir: "unused",
      contentCaptureBranches: new Set(["004"]),
      observationKind: "morning_anchor",
    },
  }));
  const failure = Object.assign(new Error("apply timeout"), { code: "CP4_WAIT_TIMEOUT" });
  candidate.values.waitForApplied = async () => { throw failure; };
  await assert.rejects(runOnce(candidate.values), /apply timeout/);
  assert.equal(candidate.events.some((event) => Array.isArray(event) && event[0] === "shadow"), false);
});

test("branch 002 remains excluded even if the global evidence flag is enabled", async () => {
  const candidate = runtime(config({
    branchCode: "002",
    hourlyStockEvidence: {
      enabled: false,
      inlineAfterFullSyncEnabled: true,
      cacheDir: "unused",
      contentCaptureBranches: new Set(["002"]),
      observationKind: "morning_anchor",
    },
  }));
  await runOnce(candidate.values);
  assert.equal(candidate.events.some((event) => Array.isArray(event) && event[0] === "shadow"), false);
});

test("durable morning anchor queues only after terminal apply and success run-log; failed apply never queues", async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-hourly-wiring-"));
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }));
  function candidate() {
    const result = runtime(config({ hourlyStockEvidence: {
      enabled: true, fullSyncAnchorEnabled: true, inlineAfterFullSyncEnabled: false,
      cacheDir, observationKind: "morning_anchor", plannedSlot: "08:20",
      uploadToken: "test-only", productCodes: ["P1"],
    }}));
    result.values.fetchDatasets = async () => ({
      branch_stock: [{ product_code: "P1", qty: 20, latest_estimated_on_hand: 19 }],
      hourlyStockCapturedAt: "2026-10-02T01:21:00.000Z",
    });
    result.values.waitForApplied = async () => { result.events.push("applied"); };
    result.values.queueHourlyMorningAnchor = (args) => {
      result.events.push("anchor");
      assert.equal(args.syncRunId, "101");
      assert.equal(args.capturedAt, "2026-10-02T01:21:00.000Z");
      assert.equal(args.acceptedRecords, 1);
      return { status: "queued" };
    };
    return result;
  }
  const successful = candidate();
  await runOnce(successful.values);
  assert.ok(successful.events.indexOf("anchor") > successful.events.indexOf("applied"));
  assert.ok(successful.events.indexOf("anchor") > successful.events.findIndex((url) => typeof url === "string" && url.endsWith("/api/sync/run-log")));
  assert.ok(successful.events.indexOf("sql-close") > successful.events.indexOf("anchor"));
  const failed = candidate();
  failed.values.waitForApplied = async () => { throw new Error("apply-failed"); };
  await assert.rejects(runOnce(failed.values), /apply-failed/);
  assert.equal(failed.events.includes("anchor"), false);
  const isolated = candidate();
  isolated.values.queueHourlyMorningAnchor = () => { throw new Error("outbox-unavailable"); };
  await runOnce(isolated.values);
  assert.ok(isolated.events.includes("sql-close"), "evidence failure must not fail Full");
});
