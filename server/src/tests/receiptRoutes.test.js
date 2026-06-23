import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createRouter } from "../routes.js";

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

test("GET /api/admin/approved-receipts accepts an empty branch filter", async () => {
  const calls = [];
  const repo = {
    async getApprovedReceipts(options) {
      calls.push(options);
      return {
        records: [],
        pagination: {
          page: options.page,
          pageSize: options.pageSize,
          total: 0,
          totalPages: 1,
        },
      };
    },
  };

  const { server, url } = await startServer(repo);
  try {
    const response = await fetch(`${url}/api/admin/approved-receipts?branchCode=&page=2&pageSize=10&sort=asc`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.records, []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].branchCode, null);
    assert.equal(calls[0].page, 2);
    assert.equal(calls[0].pageSize, 10);
    assert.equal(calls[0].sort, "asc");
  } finally {
    await stopServer(server);
  }
});
