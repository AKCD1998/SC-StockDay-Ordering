import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runOnce } from "../src/index.js";
import { transferShadowCachePath } from "../src/delta/transferShadowCache.js";

function header(overrides = {}) {
  return {
    FTBchCode: "004", FTPthDocNo: "TR-WIRE-1", FTPthDocType: "4",
    FDPthDocDate: "2026-08-28", FTPthBchFrm: "004", FTPthBchTo: "005",
    FCPthGrand: 10, ...overrides,
  };
}

function line(overrides = {}) {
  return {
    FTBchCode: "004", FTPthDocNo: "TR-WIRE-1", FTPthDocType: "4",
    FNPtdSeqNo: 1, FTPdtCode: "P1", FCPtdQty: 1, FCPtdQtyAll: 1,
    FTPthBchFrm: "004", FTPthBchTo: "005", FDPthDocDate: "2026-08-28",
    ...overrides,
  };
}

function config(cacheDir, enabled, transferChunkDocs = 30) {
  return {
    sqlServerHost: "test-sql", sqlServerInstanceName: "", sqlServerDatabase: "test",
    sqlServerUser: "readonly", sqlServerPort: 1433, branchCode: "004",
    datasets: ["transfers", "transfer_lines"], dryRun: false, skipIfSyncedToday: false,
    dateCutoff: "2026-08-28", dateFrom: null, dateTo: null,
    approvedReceiptsLookbackDays: 14, salesDetailLookbackDays: 7,
    salesDetailChunkDocs: 150, transferChunkDocs,
    productBatchSize: 100, branchStockBatchSize: 100,
    apiBaseUrl: "https://api.test",
    syncV2: { enabled: false, datasets: [], batchSize: 100, pollIntervalMs: 1, waitTimeoutMs: 10 },
    deltaShadowTransfers: {
      enabled,
      cacheDir,
      contentCaptureBranches: new Set(),
    },
  };
}

function runtime({ cacheDir, enabled, data, postTransfer, runTransferShadow, transferChunkDocs } = {}) {
  const events = [];
  const transferBodies = [];
  const postJson = async (url, body) => {
    if (url.endsWith("/api/sync/run-start")) return { runId: "77" };
    if (url.endsWith("/api/sync/ada/transfers")) {
      events.push("full-transfer-post");
      transferBodies.push(body);
      if (postTransfer) return postTransfer(url, body);
      return { acceptedHeaders: body.headers.length, acceptedLines: body.lines.length };
    }
    return {};
  };
  return {
    events,
    transferBodies,
    dependencies: {
      syncConfig: config(cacheDir, enabled, transferChunkDocs),
      connectSql: async () => ({ close: async () => {} }),
      fetchDatasets: async () => data ?? { transfers: [header()], transfer_lines: [line()] },
      postJson,
      setSyncRunId: () => {},
      ...(runTransferShadow ? { runTransferShadow } : {}),
    },
  };
}

async function captureTransferLineQuery(enabled) {
  const queries = [];
  const pool = {
    request() {
      const req = {
        input() { return req; },
        async query(sql) {
          queries.push(sql);
          return { recordset: [] };
        },
      };
      return req;
    },
    async close() {},
  };
  await runOnce({
    syncConfig: {
      ...config("unused", enabled),
      datasets: ["transfer_lines"],
      dryRun: true,
    },
    connectSql: async () => pool,
  });
  assert.equal(queries.length, 1);
  return queries[0];
}

test("sync config routes the Transfer flag to the line query", async () => {
  const offSql = await captureTransferLineQuery(false);
  const onSql = await captureTransferLineQuery(true);
  assert.doesNotMatch(offSql, /FTPthDocType/);
  assert.match(onSql, /FTPthDocType/);
});

test("feature OFF preserves Full transfer behavior and never calls the shadow", async () => {
  const candidate = runtime({
    cacheDir: "unused",
    enabled: false,
    postTransfer: async () => ({}),
    runTransferShadow: () => { throw new Error("shadow must stay off"); },
  });
  await runOnce(candidate.dependencies);
  assert.deepEqual(candidate.events, ["full-transfer-post"]);
  assert.deepEqual(candidate.transferBodies[0], {
    headers: [{
      docNo: "TR-WIRE-1", docType: "4", docDate: "2026-08-28", tnfDate: null,
      branchFrm: "004", branchTo: "005", whFrm: null, whTo: null, type: null,
      total: 0, vat: 0, grand: 10, deptCode: null, usrCode: null,
    }],
    lines: [{
      docNo: "TR-WIRE-1", seqNo: 1, productCode: "P1", unitCode: null,
      unitName: null, factor: 1, qty: 1, qtyBase: 1, cost: 0, costIn: 0,
      net: 0, vat: 0, branchFrm: "004", branchTo: "005", whFrm: null,
      whTo: null, docDate: "2026-08-28",
    }],
  });
});

test("feature ON runs shadow only after authoritative Full transfer succeeds", async () => {
  const candidate = runtime({
    cacheDir: "unused",
    enabled: true,
    runTransferShadow: () => { candidate.events.push("transfer-shadow"); return {}; },
  });
  await runOnce(candidate.dependencies);
  assert.deepEqual(candidate.events, ["full-transfer-post", "transfer-shadow"]);
  assert.equal(candidate.transferBodies[0].headers[0].branchCode, "004");
  assert.equal(candidate.transferBodies[0].lines[0].branchCode, "004");
  assert.equal(candidate.transferBodies[0].lines[0].docType, "4");
});

test("failed authoritative transfer sync cannot advance an existing cache", async () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "transfer-wiring-test-"));
  try {
    const baseline = runtime({ cacheDir, enabled: true });
    await runOnce(baseline.dependencies);
    const cachePath = transferShadowCachePath(cacheDir, "004");
    assert.equal(existsSync(cachePath), true);
    const before = readFileSync(cachePath, "utf8");

    const failed = runtime({
      cacheDir,
      enabled: true,
      data: {
        transfers: [header({ FCPthGrand: 999 })],
        transfer_lines: [line({ FCPtdQty: 9 })],
      },
      postTransfer: async () => { throw new Error("authoritative transfer rejected"); },
    });
    await assert.rejects(runOnce(failed.dependencies), /authoritative transfer rejected/);
    assert.equal(readFileSync(cachePath, "utf8"), before);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("partial acknowledgement on a later Full chunk fails before Transfer cache advancement", async () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "transfer-wiring-test-"));
  try {
    const baseline = runtime({ cacheDir, enabled: true });
    await runOnce(baseline.dependencies);
    const cachePath = transferShadowCachePath(cacheDir, "004");
    const before = readFileSync(cachePath, "utf8");
    let calls = 0;
    const partial = runtime({
      cacheDir,
      enabled: true,
      transferChunkDocs: 1,
      data: {
        transfers: [header(), header({ FTPthDocNo: "TR-WIRE-2" })],
        transfer_lines: [line(), line({ FTPthDocNo: "TR-WIRE-2", FTPdtCode: "P2" })],
      },
      postTransfer: async (_url, body) => {
        calls++;
        return calls === 1
          ? { acceptedHeaders: body.headers.length, acceptedLines: body.lines.length }
          : { acceptedHeaders: body.headers.length, acceptedLines: body.lines.length - 1 };
      },
    });
    await assert.rejects(
      runOnce(partial.dependencies),
      /chunk 2\/2 acknowledgement mismatch: expected 1 headers and 1 lines; received 1 headers and 0 lines/,
    );
    assert.equal(calls, 2);
    assert.equal(readFileSync(cachePath, "utf8"), before);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("missing Full acknowledgement fails before Transfer cache advancement", async () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "transfer-wiring-test-"));
  try {
    const baseline = runtime({ cacheDir, enabled: true });
    await runOnce(baseline.dependencies);
    const cachePath = transferShadowCachePath(cacheDir, "004");
    const before = readFileSync(cachePath, "utf8");
    const missing = runtime({
      cacheDir,
      enabled: true,
      postTransfer: async (_url, body) => ({ acceptedHeaders: body.headers.length }),
    });
    await assert.rejects(
      runOnce(missing.dependencies),
      /acknowledgement mismatch: expected 1 headers and 1 lines; received 1 headers and missing lines/,
    );
    assert.equal(readFileSync(cachePath, "utf8"), before);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
