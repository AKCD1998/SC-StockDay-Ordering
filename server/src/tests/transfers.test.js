import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createRouter } from "../routes.js";
import { normalizeTransferPayload, validateTransferPayload } from "../transferSync.js";

function makeMockRepo(overrides = {}) {
  return {
    getBranches: async () => [],
    searchProducts: async () => [],
    createOrderRequest: async () => ({}),
    getOrderRequest: async () => null,
    getOrderRequests: async () => [],
    getStockDay: async () => [],
    getProductSummary: async () => null,
    getSyncStatus: async () => ({ latestRun: null, recentErrors: [], mode: "mock" }),
    ingestBranches: async (payload) => ({ accepted: (payload.records || []).length }),
    ingestProducts: async (payload) => ({ accepted: (payload.records || []).length }),
    ingestSalesSummary: async (payload) => ({ accepted: (payload.records || []).length }),
    ingestPurchaseSummary: async (payload) => ({ accepted: (payload.records || []).length }),
    ingestTransfers: async (payload) => ({
      acceptedHeaders: (payload.headers || []).length,
      acceptedLines: (payload.lines || []).length,
      headersAccepted: (payload.headers || []).length,
      linesAccepted: (payload.lines || []).length,
    }),
    getTransfersByBranch: async () => [],
    ingestRunLog: async () => ({ accepted: 1 }),
    getCategoryReviewQueue: async () => ({ records: [], pagination: { limit: 25, offset: 0, total: 0 } }),
    getCategoryMetrics: async () => ({
      totalProducts: 0,
      thaiNameCoverage: 0,
      englishNameCoverage: 0,
      barcodeCoverage: 0,
      dummyBarcodeRate: 0,
    }),
    refreshProductCategories: async () => ({ processed: 0, confirmed: 0, needsReview: 0, reverify: 0 }),
    confirmProductCategory: async ({ productCode, cleanCategory, shelfNo = null }) => ({
      ok: true,
      productCode,
      category: shelfNo === null ? cleanCategory : `${shelfNo}${cleanCategory}`,
    }),
    ...overrides,
  };
}

function startServer(repo) {
  const app = express();
  app.use(express.json());
  app.use(createRouter(repo));
  const server = createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

const CAMEL_CASE_PAYLOAD = {
  headers: [
    {
      docNo: "TB00026-000001",
      docType: "4",
      docDate: "2026-04-24",
      tnfDate: "2026-04-24",
      branchFrm: "000",
      branchTo: "005",
      whFrm: "001",
      whTo: "002",
      type: "2",
      total: 0,
      vat: 0,
      grand: 0,
      deptCode: "001",
      usrCode: "dao1",
    },
  ],
  lines: [
    {
      docNo: "TB00026-000001",
      seqNo: 1,
      productCode: "IC-005745",
      unitCode: "043",
      unitName: "10 ชิ้น",
      factor: 10,
      qty: 4,
      qtyBase: 40,
      cost: 0,
      costIn: 0,
      net: 0,
      vat: 0,
      branchFrm: "000",
      branchTo: "005",
      whFrm: "001",
      whTo: "002",
      docDate: "2026-04-24",
    },
  ],
};

const ADAACC_PAYLOAD = {
  headers: [
    {
      FTPthDocNo: "TB00026-000002",
      FTPthDocType: "4",
      FTBchCode: "000",
      FTBchCodeTo: "005",
      FDPthDocDate: "2026-04-24",
      FTWahCode: "001",
      FTWahCodeTo: "002",
      FTPthUsrName: "dao1",
    },
  ],
  lines: [
    {
      FTPthDocNo: "TB00026-000002",
      FNPtdSeqNo: 1,
      FTPtdPdtCode: "IC-005745",
      FTPunCode: "043",
      FTPunName: "10 ชิ้น",
      FCPtdQtyAll: 4,
      FCPtdQtyBase: 40,
      FCPtdStkFac: 10,
      FTBchCode: "000",
      FTWahCode: "001",
    },
  ],
};

test("validateTransferPayload normalizes real agent camelCase fields", () => {
  const { error, normalized } = validateTransferPayload(CAMEL_CASE_PAYLOAD);

  assert.equal(error, null);
  assert.equal(normalized.headers[0].branchCode, "000");
  assert.equal(normalized.headers[0].branchCodeTo, "005");
  assert.equal(normalized.lines[0].lineNo, 1);
  assert.equal(normalized.lines[0].stockFactor, 10);
});

test("validateTransferPayload preserves AdaAcc alias support", () => {
  const { error, normalized } = validateTransferPayload(ADAACC_PAYLOAD);

  assert.equal(error, null);
  assert.equal(normalized.headers[0].docNo, "TB00026-000002");
  assert.equal(normalized.lines[0].productCode, "IC-005745");
  assert.equal(normalized.lines[0].docType, "4");
  assert.equal(normalized.lines[0].branchCode, "000");
});

test("normalizeTransferPayload falls back to header docType and branch for sparse lines", () => {
  const normalized = normalizeTransferPayload({
    headers: [{ docNo: "TB00026-000003", docType: "7", branchFrm: "001", tnfDate: "2026-04-24" }],
    lines: [{ docNo: "TB00026-000003", seqNo: 2, productCode: "IC-000833" }],
  });

  assert.equal(normalized.lines[0].docType, "7");
  assert.equal(normalized.lines[0].branchCode, "001");
  assert.equal(normalized.lines[0].docDate, "2026-04-24");
});

test("POST /api/sync/ada/transfers accepts camelCase payloads", async () => {
  const { server, url } = await startServer(makeMockRepo());
  try {
    const response = await fetch(`${url}/api/sync/ada/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(CAMEL_CASE_PAYLOAD),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.acceptedHeaders, 1);
    assert.equal(body.acceptedLines, 1);
  } finally {
    await stopServer(server);
  }
});

test("POST /api/sync/transfers also accepts normalized legacy route traffic", async () => {
  const { server, url } = await startServer(makeMockRepo());
  try {
    const response = await fetch(`${url}/api/sync/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ADAACC_PAYLOAD),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.headersAccepted, 1);
    assert.equal(body.linesAccepted, 1);
  } finally {
    await stopServer(server);
  }
});
