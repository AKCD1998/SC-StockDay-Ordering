import assert from "node:assert/strict";
import test from "node:test";

import { runHourlyStockIntraday } from "../src/hourlyStockRunner.js";
import { buildSqlServerConfig } from "../src/sqlServerConfig.js";

function config(overrides = {}) {
  return {
    sqlServerHost: "branch-sql",
    sqlServerInstanceName: "SQLEXPRESS",
    sqlServerPort: 1433,
    sqlServerUser: "readonly",
    sqlServerPassword: "test-only",
    sqlServerDatabase: "AdaAcc",
    branchCode: "004",
    hourlyStockEvidence: {
      enabled: true,
      cacheDir: "unused",
      contentCaptureBranches: new Set(["004"]),
      observationKind: "intraday",
      plannedSlot: "10:00",
      productCodes: ["P1", "P2"],
      uploadToken: "test-branch-token",
    },
    apiBaseUrl: "https://example.test",
    ...overrides,
  };
}

function row(productCode, retailOnHand, latestEstimatedOnHand) {
  return {
    product_code: productCode,
    qty: retailOnHand,
    latest_estimated_on_hand: latestEstimatedOnHand,
  };
}

test("feature OFF exits before SQL connection and filesystem work", async () => {
  let connected = false;
  const result = await runHourlyStockIntraday({
    syncConfig: config({ hourlyStockEvidence: { enabled: false } }),
    connectSql: async () => { connected = true; },
  });
  assert.deepEqual(result, { status: "skipped", reason: "feature-disabled" });
  assert.equal(connected, false);
});

test("intraday runner performs one selected read, durable upload, and closes the pool", async () => {
  const events = [];
  const rows = [row("P1", 18, 17), row("P2", 4, null)];
  const pool = { close: async () => events.push("close") };
  const result = await runHourlyStockIntraday({
    syncConfig: config(),
    now: () => "2026-09-16T03:00:00.000Z",
    connectSql: async () => { events.push("connect"); return pool; },
    getHourlyStockEvidenceRows: async (receivedPool, productCodes) => {
      assert.equal(receivedPool, pool);
      assert.deepEqual(productCodes, ["P1", "P2"]);
      events.push("query");
      return rows;
    },
    runHourlyStockShadow: (args) => {
      events.push("shadow");
      assert.equal(args.observationKind, "intraday");
      assert.equal(args.observedAt, "2026-09-16T03:00:00.000Z");
      assert.deepEqual(args.acknowledgement, {
        sourceReadComplete: true,
        acceptedRecords: 2,
      });
      return { scannedProducts: 2, cacheWriteOk: true };
    },
    uploadHourlyEvidence: async ({ apiBaseUrl, branchCode, token, body }) => {
      events.push("upload");
      assert.equal(apiBaseUrl, "https://example.test");
      assert.equal(branchCode, "004");
      assert.equal(token, "test-branch-token");
      const payload = JSON.parse(body);
      assert.equal(payload.plannedSlot, "10:00");
      assert.equal(payload.capturedAt, "2026-09-16T03:00:00.000Z");
      assert.deepEqual(payload.records.map((record) => record.productCode), ["P1", "P2"]);
      return { duplicate: false, captureId: "1", attempts: 1 };
    },
  });
  assert.deepEqual(events, ["connect", "query", "shadow", "upload", "close"]);
  assert.equal(result.status, "captured");
  assert.equal(result.scannedProducts, 2);
  assert.equal(result.sqlConnectionAttempts, 1);
  assert.equal(result.sqlConnectionRetryCount, 0);
  assert.equal(Number.isSafeInteger(result.queryDurationMs), true);
});

test("runner reports bounded SQL retry count after transient recovery", async () => {
  const retries = [];
  const waits = [];
  let attempts = 0;
  const result = await runHourlyStockIntraday({
    syncConfig: config(),
    connectSql: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("transient"), { code: "ETIMEOUT" });
      return { close: async () => {} };
    },
    getHourlyStockEvidenceRows: async () => [row("P1", 20, 19)],
    runHourlyStockShadow: () => ({ scannedProducts: 1, cacheWriteOk: true }),
    uploadHourlyEvidence: async () => ({ duplicate: false, captureId: "1", attempts: 1 }),
    sqlConnectRetryOptions: {
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 1,
      wait: async (delayMs) => waits.push(delayMs),
      logger: { warn() {} },
      onRetry: (event) => retries.push(event),
    },
  });
  assert.equal(result.sqlConnectionAttempts, 2);
  assert.equal(result.sqlConnectionRetryCount, 1);
  assert.deepEqual(waits, [1]);
  assert.deepEqual(retries, [{ attempt: 1, maxAttempts: 3, delayMs: 1, code: "ETIMEOUT" }]);
});

test("query failure is fatal for the window and still closes SQL", async () => {
  let closed = false;
  let shadowCalled = false;
  await assert.rejects(runHourlyStockIntraday({
    syncConfig: config(),
    connectSql: async () => ({ close: async () => { closed = true; } }),
    getHourlyStockEvidenceRows: async () => { throw Object.assign(new Error("query failed"), { code: "EREQUEST" }); },
    runHourlyStockShadow: () => { shadowCalled = true; },
  }), /query failed/);
  assert.equal(closed, true);
  assert.equal(shadowCalled, false);
});

test("inactive branch is rejected before SQL connection", async () => {
  let connected = false;
  await assert.rejects(runHourlyStockIntraday({
    syncConfig: config({ branchCode: "002" }),
    connectSql: async () => { connected = true; },
  }), (error) => error.code === "HOURLY_STOCK_BRANCH_NOT_ACTIVE");
  assert.equal(connected, false);
});

test("enabled runner with empty cohort or token fails before SQL and network", async () => {
  for (const hourlyStockEvidence of [
    { ...config().hourlyStockEvidence, productCodes: [] },
    { ...config().hourlyStockEvidence, uploadToken: "" },
  ]) {
    let connected = false;
    let uploaded = false;
    await assert.rejects(runHourlyStockIntraday({
      syncConfig: config({ hourlyStockEvidence }),
      connectSql: async () => { connected = true; },
      uploadHourlyEvidence: async () => { uploaded = true; },
    }), (error) => error.code === "CONFIG_ERROR");
    assert.equal(connected, false);
    assert.equal(uploaded, false);
  }
});

test("SQL config keeps named-instance and direct-port modes distinct", () => {
  const named = buildSqlServerConfig(config());
  assert.equal(named.options.instanceName, "SQLEXPRESS");
  assert.equal("port" in named, false);
  const direct = buildSqlServerConfig(config({ sqlServerInstanceName: null, sqlServerPort: 1444 }));
  assert.equal("instanceName" in direct.options, false);
  assert.equal(direct.port, 1444);
});
