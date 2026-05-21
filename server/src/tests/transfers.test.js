/**
 * Transfer ingestion tests — node:test, no external deps.
 *
 * Covers:
 *   1. Valid payload accepted (route returns 200, correct counts)
 *   2. Malformed payload rejected (route returns 400)
 *   3. Transfer header persistence (ingestTransfers issues correct INSERT)
 *   4. Transfer line persistence   (ingestTransfers issues correct INSERT)
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createRouter } from "../routes.js";

// ── Minimal mock repository ────────────────────────────────────────────────────
function makeMockRepo(overrides = {}) {
  return {
    getBranches:         async () => [],
    searchProducts:      async () => [],
    createOrderRequest:  async () => ({}),
    getOrderRequest:     async () => null,
    getOrderRequests:    async () => [],
    getStockDay:         async () => [],
    getProductSummary:   async () => null,
    getSyncStatus:       async () => ({ latestRun: null, recentErrors: [], mode: "mock" }),
    ingestBranches:      async (p) => ({ accepted: (p.records || []).length }),
    ingestProducts:      async (p) => ({ accepted: (p.records || []).length }),
    ingestSalesSummary:  async (p) => ({ accepted: (p.records || []).length }),
    ingestPurchaseSummary: async (p) => ({ accepted: (p.records || []).length }),
    ingestTransfers:     async (p) => ({
      headersAccepted: (p.headers || []).length,
      linesAccepted:   (p.lines   || []).length,
    }),
    getTransfersByBranch: async () => [],
    ingestRunLog:        async () => ({ accepted: 1 }),
    ...overrides,
  };
}

// ── Test server helpers ────────────────────────────────────────────────────────
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

// ── Sample payloads ────────────────────────────────────────────────────────────
const VALID_PAYLOAD = {
  headers: [
    {
      docNo: "TB00026-000001", docType: "4",
      docDate: "2026-04-24", tnfDate: "2026-04-24",
      branchFrm: "000", branchTo: "005",
      whFrm: "001", whTo: "001", type: "2",
      total: 0, vat: 0, grand: 0,
      deptCode: "001", usrCode: "dao1",
    },
  ],
  lines: [
    {
      docNo: "TB00026-000001", seqNo: 1,
      productCode: "IC-005745", unitCode: "043", unitName: "10 ชิ้น",
      factor: 10, qty: 4, qtyBase: 40,
      cost: 0, costIn: 0, net: 0, vat: 0,
      branchFrm: "000", branchTo: "005",
      whFrm: "001", whTo: "001", docDate: "2026-04-24",
    },
  ],
};

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("POST /api/sync/transfers", () => {
  let server, url;

  before(async () => {
    ({ server, url } = await startServer(makeMockRepo()));
  });

  after(async () => {
    await stopServer(server);
  });

  test("valid payload returns 200 with accepted counts", async () => {
    const res = await fetch(`${url}/api/sync/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_PAYLOAD),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.headersAccepted, 1);
    assert.equal(body.linesAccepted, 1);
  });

  test("missing headers array returns 400", async () => {
    const res = await fetch(`${url}/api/sync/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: [] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.message);
  });

  test("missing lines array returns 400", async () => {
    const res = await fetch(`${url}/api/sync/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headers: [] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.message);
  });

  test("empty body returns 400", async () => {
    const res = await fetch(`${url}/api/sync/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 400);
  });
});

describe("ingestTransfers — persistence contract", () => {
  test("header INSERT is called with correct field mapping", async () => {
    const queries = [];
    const mockPool = {
      connect: async () => ({
        query: async (sql, params) => { queries.push({ sql, params }); return {}; },
        release: () => {},
      }),
    };

    // Import and instantiate PostgresRepository with the mock pool
    const { PostgresRepository } = await import("../repositories/postgresRepository.js");
    const repo = new PostgresRepository();
    repo.pool = mockPool;

    await repo.ingestTransfers({
      headers: [VALID_PAYLOAD.headers[0]],
      lines: [],
    });

    // BEGIN + header INSERT + COMMIT = 3 queries
    assert.equal(queries.length, 3);
    const [begin, headerInsert, commit] = queries;
    assert.equal(begin.sql.trim(), "BEGIN");
    assert.ok(headerInsert.sql.includes("transfer_headers"));
    assert.ok(headerInsert.sql.includes("ON CONFLICT"));
    assert.equal(headerInsert.params[0], "TB00026-000001"); // doc_no
    assert.equal(headerInsert.params[1], "000");            // branch_frm
    assert.equal(headerInsert.params[2], "005");            // branch_to
    assert.equal(commit.sql.trim(), "COMMIT");
  });

  test("line INSERT is called with correct field mapping", async () => {
    const queries = [];
    const mockPool = {
      connect: async () => ({
        query: async (sql, params) => { queries.push({ sql, params }); return {}; },
        release: () => {},
      }),
    };

    const { PostgresRepository } = await import("../repositories/postgresRepository.js");
    const repo = new PostgresRepository();
    repo.pool = mockPool;

    await repo.ingestTransfers({
      headers: [],
      lines: [VALID_PAYLOAD.lines[0]],
    });

    // BEGIN + line INSERT + COMMIT = 3 queries
    assert.equal(queries.length, 3);
    const lineInsert = queries[1];
    assert.ok(lineInsert.sql.includes("transfer_lines"));
    assert.ok(lineInsert.sql.includes("ON CONFLICT"));
    assert.equal(lineInsert.params[0], "TB00026-000001"); // doc_no
    assert.equal(lineInsert.params[1], 1);               // seq_no
    assert.equal(lineInsert.params[2], "IC-005745");     // product_code
    assert.equal(lineInsert.params[7], 40);              // qty_base
  });
});
