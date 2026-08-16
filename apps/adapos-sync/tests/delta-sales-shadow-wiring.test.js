import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runOnce } from "../src/index.js";

// Shadow-only invariants at the runOnce wiring level, rebuilt against Agent
// main f89945a98fcb35ba1b471f94a8fdb7414c67ee80:
//   32/33. request sequence/bytes are identical whether Delta shadow is
//          disabled, or enabled-and-succeeding;
//   34.    a Shadow error must never fail Full Sync, and the request
//          sequence is unchanged;
//   35/36. Shadow never issues an HTTP request or SQL query itself;
//   37.    Shadow runs only after the Sales POST loop has fully completed;
//   38/39/40. Approved Receipts fail-loud (the actual behavior change
//          between the frozen candidate's old parent 26c6800... and current
//          main f89945a...) must survive completely unmodified by this
//          candidate, in every combination with the Shadow path.
//
// The "OLD" side of every equivalence check below is a FIXTURE captured
// from this exact worktree's pristine f89945a source, BEFORE any Delta
// source file existed (tests/__fixtures__/old_trace_baseline_*.json) —
// captured once, immediately after worktree creation, via a throwaway probe
// script that was removed afterward (see the Candidate Report). This round's
// instructions explicitly prohibit git stash/reset for the OLD-vs-NEW proof,
// so a pre-captured fixture is used instead of a live git-stash re-checkout.

function config(overrides = {}) {
  return {
    sqlServerHost: "test-sql", sqlServerInstanceName: "", sqlServerDatabase: "test",
    sqlServerUser: "readonly", sqlServerPort: 1433, branchCode: "005",
    datasets: ["sales_detail"], dryRun: false, skipIfSyncedToday: false,
    dateCutoff: "2026-07-21", dateFrom: null, dateTo: null,
    approvedReceiptsLookbackDays: 14, salesDetailLookbackDays: 7,
    salesDetailChunkDocs: 150, transferChunkDocs: 30,
    productBatchSize: 100, branchStockBatchSize: 100,
    apiBaseUrl: "https://api.test",
    syncV2: { enabled: false, datasets: [] },
    deltaShadowSales: { enabled: false, cacheDir: ".delta-shadow-cache-test" },
    ...overrides,
  };
}

const salesData = {
  sales_detail_headers: [{
    FTBchCode: "005", FTShdDocNo: "DOC-1", FTShdDocType: "1",
    FDShdDocDate: new Date("2026-07-20T00:00:00Z"), FTShdDocTime: "09:00:00",
    FTShdStaPaid: "3", FCShdTotal: 10, FCShdDis: 0, FCShdAftDisChg: 10, FCShdVat: 0.65, FCShdGrand: 10,
  }],
  sales_detail_lines: [{
    FTBchCode: "005", FTShdDocNo: "DOC-1", FNSdtSeqNo: 1, FTPdtCode: "P1",
    FCSdtQty: 1, FCSdtStkFac: 1, FCSdtQtyAll: 1, FCSdtSetPrice: 10, FCSdtDis: 0, FCSdtNet: 10,
  }],
};

const salesPlusApprovedReceiptsData = {
  ...salesData,
  approved_receipt_headers: [{ FTXihDocNo: "RCPT-1", FTBchCode: "005" }],
  approved_receipt_lines: [],
};

function normalizeVolatile(body) {
  const clone = JSON.parse(JSON.stringify(body));
  for (const key of ["sourceSyncedAt", "id", "startedAt", "finishedAt"]) {
    if (key in clone) clone[key] = "<volatile>";
  }
  return clone;
}

function dependencies({ syncConfig, runSalesShadow, data = salesData, approvedReceiptsFails = false } = {}) {
  const trace = [];
  const postJson = async (url, body) => {
    trace.push(["POST", url, JSON.stringify(normalizeVolatile(body))]);
    if (url.endsWith("/api/sync/run-start")) return { runId: "9" };
    if (url.endsWith("/api/sync/ada/sales")) return { acceptedHeaders: 1, acceptedLines: 1 };
    if (approvedReceiptsFails && url.endsWith("/api/sync/ada/approved-receipts")) {
      throw Object.assign(new Error("rejected"), { status: 400 });
    }
    return {};
  };
  return {
    trace,
    values: {
      syncConfig,
      connectSql: async () => ({ close: async () => {} }),
      fetchDatasets: async () => data,
      postJson,
      getJson: async () => ({}),
      setSyncRunId: () => {},
      ...(runSalesShadow ? { runSalesShadow } : {}),
    },
  };
}

function loadFixtureTrace(filename) {
  const raw = readFileSync(new URL(`./__fixtures__/${filename}`, import.meta.url), "utf8");
  return JSON.parse(raw);
}

async function runAndCapture(runtime) {
  let outcome = "success";
  let errorCode = null;
  try {
    await runOnce(runtime.values);
  } catch (err) {
    outcome = "failed";
    errorCode = err.code || null;
  }
  return { outcome, errorCode, trace: runtime.trace };
}

// 32. shadow disabled -> identical to OLD fixture
test("32. request sequence/bytes with delta shadow disabled match the pre-candidate fixture exactly", async () => {
  const fixture = loadFixtureTrace("old_trace_baseline_sales_detail_success.json");
  const runtime = dependencies({ syncConfig: config({ deltaShadowSales: { enabled: false, cacheDir: "x" } }) });
  const result = await runAndCapture(runtime);
  assert.deepEqual(result, fixture);
});

// 33. shadow enabled and succeeding -> still identical
test("33. request sequence/bytes with delta shadow enabled-and-succeeding match the pre-candidate fixture exactly", async () => {
  const fixture = loadFixtureTrace("old_trace_baseline_sales_detail_success.json");
  const runtime = dependencies({
    syncConfig: config({ deltaShadowSales: { enabled: true, cacheDir: "x" } }),
    runSalesShadow: () => ({ scannedDocuments: 1, unchangedCount: 0, newCount: 1, changedCount: 0 }),
  });
  const result = await runAndCapture(runtime);
  assert.deepEqual(result, fixture);
});

// 34. shadow throws -> Full Sync result and trace unchanged
test("34. a throwing shadow implementation does not change the Full Sync outcome or request trace", async () => {
  const fixture = loadFixtureTrace("old_trace_baseline_sales_detail_success.json");
  const runtime = dependencies({
    syncConfig: config({ deltaShadowSales: { enabled: true, cacheDir: "x" } }),
    runSalesShadow: () => { throw new Error("simulated shadow cache corruption"); },
  });
  const result = await runAndCapture(runtime);
  assert.deepEqual(result, fixture);
});

// 35/36. shadow never issues its own HTTP request (and, by construction —
// runSalesShadow takes no SQL pool/connection argument at all — it cannot
// issue a SQL query either; this is proven structurally by the dependency
// injection shape, re-confirmed here by asserting no URL contains
// "delta"/"shadow").
test("35/36. delta shadow never issues a network request of its own", async () => {
  let shadowCalled = false;
  const runtime = dependencies({
    syncConfig: config({ deltaShadowSales: { enabled: true, cacheDir: "x" } }),
    runSalesShadow: (args) => {
      shadowCalled = true;
      // Structural proof of 36: the shadow function receives only rows
      // already fetched this run and a cache directory — no pool/connection.
      assert.deepEqual(Object.keys(args).sort(), ["branchCode", "cacheDir", "contentCaptureBranches", "headerRows", "lineRows"]);
      return { scannedDocuments: 1 };
    },
  });
  await runOnce(runtime.values);
  assert.equal(shadowCalled, true);
  const urls = runtime.trace.map(([, url]) => url);
  assert.equal(urls.every((u) => !u.toLowerCase().includes("delta") && !u.toLowerCase().includes("shadow")), true);
});

// 37. shadow runs only after the Sales POST loop has fully completed
test("37. delta shadow is invoked only after every sales_detail chunk has been posted", async () => {
  const callOrder = [];
  const runtime = dependencies({
    syncConfig: config({ deltaShadowSales: { enabled: true, cacheDir: "x" } }),
    runSalesShadow: () => { callOrder.push("shadow"); return { scannedDocuments: 1 }; },
  });
  const originalPostJson = runtime.values.postJson;
  runtime.values.postJson = async (url, body) => {
    if (url.endsWith("/api/sync/ada/sales")) callOrder.push("sales-post");
    return originalPostJson(url, body);
  };
  await runOnce(runtime.values);
  assert.deepEqual(callOrder, ["sales-post", "shadow"]);
});

// 38. Sales POST succeeds, Approved Receipt later fails -> run must still
// fail with V1_APPROVED_RECEIPTS_FAILED; Shadow must not swallow or change
// this error; request sequence up to the failure and the failed run-log
// must exactly match the pre-candidate fixture (which already proves no
// success run-log is written).
test("38. approved-receipts failure after a successful sales_detail POST still fails the run with V1_APPROVED_RECEIPTS_FAILED, unaffected by an enabled and succeeding shadow", async () => {
  const fixture = loadFixtureTrace("old_trace_baseline_approved_receipts_failure.json");
  const runtime = dependencies({
    syncConfig: config({
      datasets: ["sales_detail", "approved_receipts"],
      deltaShadowSales: { enabled: true, cacheDir: "x" },
    }),
    data: salesPlusApprovedReceiptsData,
    approvedReceiptsFails: true,
    runSalesShadow: () => ({ scannedDocuments: 1 }),
  });
  const result = await runAndCapture(runtime);
  assert.equal(result.outcome, "failed");
  assert.equal(result.errorCode, "V1_APPROVED_RECEIPTS_FAILED");
  assert.deepEqual(result, fixture);
  // Explicitly confirm no success run-log was written (the fixture already
  // encodes this, but assert it directly too — this is the exact regression
  // class the fail-loud fix exists to prevent).
  const runLogBodies = result.trace
    .filter(([, url]) => url.endsWith("/api/sync/run-log"))
    .map(([, , body]) => JSON.parse(body));
  assert.equal(runLogBodies.length, 1);
  assert.equal(runLogBodies[0].status, "failed");
});

// 39. Shadow itself throws AND approved-receipts also fails -> the final
// error reported must still be the approved-receipts failure, never
// re-labeled as a shadow failure. The shadow's own try/catch swallows its
// error internally (console.warn only) regardless of what else fails later.
test("39. a shadow error combined with a real approved-receipts failure still reports the approved-receipts failure, not a shadow failure", async () => {
  const fixture = loadFixtureTrace("old_trace_baseline_approved_receipts_failure.json");
  const runtime = dependencies({
    syncConfig: config({
      datasets: ["sales_detail", "approved_receipts"],
      deltaShadowSales: { enabled: true, cacheDir: "x" },
    }),
    data: salesPlusApprovedReceiptsData,
    approvedReceiptsFails: true,
    runSalesShadow: () => { throw new Error("simulated shadow cache corruption"); },
  });
  const result = await runAndCapture(runtime);
  assert.equal(result.outcome, "failed");
  assert.equal(result.errorCode, "V1_APPROVED_RECEIPTS_FAILED");
  assert.deepEqual(result, fixture);
});

// 40. Delta disabled entirely (the realistic default/old-caller shape) ->
// approved-receipts failure behavior is byte/sequence-equivalent to the
// pre-candidate fixture.
test("40. with delta shadow disabled, approved-receipts failure behavior is exactly equivalent to the pre-candidate fixture", async () => {
  const fixture = loadFixtureTrace("old_trace_baseline_approved_receipts_failure.json");
  const runtime = dependencies({
    syncConfig: config({
      datasets: ["sales_detail", "approved_receipts"],
      deltaShadowSales: { enabled: false, cacheDir: "x" },
    }),
    data: salesPlusApprovedReceiptsData,
    approvedReceiptsFails: true,
  });
  const result = await runAndCapture(runtime);
  assert.deepEqual(result, fixture);
});

// 41. Cache-advancement timing: the shadow cache is written after the sales
// dataset succeeds but BEFORE any later dataset (e.g. approved_receipts) is
// attempted — this is per-dataset local state, not a durable Backend
// checkpoint, so writing it immediately after ITS OWN dataset's POSTs
// complete (rather than waiting for the whole run to finish) is safe: a
// later, unrelated dataset failing does not retroactively make the sales
// shadow's own comparison wrong. This test LOCKS today's actual behavior;
// it does not itself certify a future durable Delta checkpoint design.
test("41. the shadow cache write happens after the sales dataset's own POSTs succeed, before any later dataset is attempted — locked, not assumed", async () => {
  const callOrder = [];
  const runtime = dependencies({
    syncConfig: config({
      datasets: ["sales_detail", "approved_receipts"],
      deltaShadowSales: { enabled: true, cacheDir: "x" },
    }),
    data: salesPlusApprovedReceiptsData,
    approvedReceiptsFails: true,
    runSalesShadow: () => { callOrder.push("shadow-cache-write"); return { scannedDocuments: 1 }; },
  });
  const originalPostJson = runtime.values.postJson;
  runtime.values.postJson = async (url, body) => {
    if (url.endsWith("/api/sync/ada/sales")) callOrder.push("sales-post");
    if (url.endsWith("/api/sync/ada/approved-receipts")) callOrder.push("approved-receipts-post-attempt");
    return originalPostJson(url, body);
  };
  await assert.rejects(runOnce(runtime.values));
  assert.deepEqual(callOrder, ["sales-post", "shadow-cache-write", "approved-receipts-post-attempt"]);
});
