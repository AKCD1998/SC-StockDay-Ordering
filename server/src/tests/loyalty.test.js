import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { config } from "../config.js";
import { createRouter } from "../routes.js";
import { MockRepository } from "../repositories/mockRepository.js";

// ── Test server helpers ───────────────────────────────────────────────────────

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

async function request(url, { method = "GET", body } = {}) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function requestWithHeaders(url, { method = "GET", body, headers = {} } = {}) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_CLAIM = {
  receiptNo:        "S2606005001-0000661",
  branchCode:       "005",
  cashierStaffCode: "S123c",
  soldAt:           "2026-06-03T14:25:00+07:00",
  totalAmount:      170,
  previewPoints:    1,
  memberId:         "mem_demo_001",
  items: [
    { productCode: "P001", productName: "Product A", qty: 2, unitPrice: 30, lineTotal: 60 },
    { productCode: "P002", productName: "Product B", qty: 1, unitPrice: 110, lineTotal: 110 },
  ],
};

const POS_API_KEY = "test-pos-key";

test.beforeEach(() => {
  config.posApiKey = POS_API_KEY;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("GET /api/members/search — empty q returns []", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/members/search`);
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  } finally {
    await stopServer(server);
  }
});

test("GET /api/members/search — whitespace-only q returns []", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/members/search?q=   `);
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  } finally {
    await stopServer(server);
  }
});

test("GET /api/members/search — phone match returns array", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/members/search?q=0627966956`);
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    assert.ok(body.length >= 1);
    assert.equal(body[0].phone, "0627966956");
    assert.ok("id" in body[0]);
    assert.ok("displayName" in body[0]);
    assert.ok("memberCode" in body[0]);
    assert.ok("currentPoints" in body[0]);
  } finally {
    await stopServer(server);
  }
});

test("GET /api/members/search — partial name match returns array", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/members/search?q=%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2`); // สมชาย
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    assert.ok(body.length >= 1);
  } finally {
    await stopServer(server);
  }
});

test("GET /api/members/:id — requires x-pos-api-key", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/members/mem_demo_001`);
    assert.equal(status, 401);
    assert.equal(body.message, "Unauthorized POS API key.");
  } finally {
    await stopServer(server);
  }
});

test("GET /api/members/:id — returns member by id when x-pos-api-key is valid", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await requestWithHeaders(`${url}/api/members/mem_demo_002`, {
      headers: { "x-pos-api-key": POS_API_KEY },
    });
    assert.equal(status, 200);
    assert.equal(body.id, "mem_demo_002");
    assert.equal(body.memberCode, "M000002");
    assert.equal(body.phone, "0627966956");
  } finally {
    await stopServer(server);
  }
});

test("PUT /api/members/:id — updates editable fields by id with x-pos-api-key", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const payload = {
      name: "Chavit Ditsataporn",
      phone: "0627966956",
      email: "auukunn.bkk@gmail.com",
      sex: "male",
      dob: "1998-05-05",
      remark: "",
    };
    const { status, body } = await requestWithHeaders(`${url}/api/members/mem_demo_002`, {
      method: "PUT",
      headers: { "x-pos-api-key": POS_API_KEY },
      body: payload,
    });
    assert.equal(status, 200);
    assert.equal(body.id, "mem_demo_002");
    assert.equal(body.displayName, payload.name);
    assert.equal(body.phone, payload.phone);
    assert.equal(body.email, payload.email);
    assert.equal(body.sex, payload.sex);
    assert.equal(body.dob, payload.dob);
    assert.equal(body.remark, payload.remark);
  } finally {
    await stopServer(server);
  }
});

test("PUT /api/members/:id — returns 404 for unknown id instead of matching memberCode or other fields", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await requestWithHeaders(`${url}/api/members/M000002`, {
      method: "PUT",
      headers: { "x-pos-api-key": POS_API_KEY },
      body: {
        name: "Wrong Lookup",
        phone: "000",
        email: "wrong@example.com",
        sex: "male",
        dob: "1998-05-05",
        remark: "",
      },
    });
    assert.equal(status, 404);
    assert.equal(body.message, "Member not found.");
  } finally {
    await stopServer(server);
  }
});

test("POST /api/loyalty/claims — missing receiptNo returns 400", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/loyalty/claims`, {
      method: "POST",
      body: { ...VALID_CLAIM, receiptNo: "" },
    });
    assert.equal(status, 400);
    assert.ok(body.message);
  } finally {
    await stopServer(server);
  }
});

test("POST /api/loyalty/claims — missing branchCode returns 400", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/loyalty/claims`, {
      method: "POST",
      body: { ...VALID_CLAIM, branchCode: "" },
    });
    assert.equal(status, 400);
    assert.ok(body.message);
  } finally {
    await stopServer(server);
  }
});

test("POST /api/loyalty/claims — missing memberId returns 400", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/loyalty/claims`, {
      method: "POST",
      body: { ...VALID_CLAIM, memberId: "" },
    });
    assert.equal(status, 400);
    assert.ok(body.message);
  } finally {
    await stopServer(server);
  }
});

test("POST /api/loyalty/claims — empty items returns 400", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/loyalty/claims`, {
      method: "POST",
      body: { ...VALID_CLAIM, items: [] },
    });
    assert.equal(status, 400);
    assert.equal(body.message, "Receipt items are required.");
  } finally {
    await stopServer(server);
  }
});

test("POST /api/loyalty/claims — negative totalAmount returns 400", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/loyalty/claims`, {
      method: "POST",
      body: { ...VALID_CLAIM, totalAmount: -50 },
    });
    assert.equal(status, 400);
    assert.ok(body.message);
  } finally {
    await stopServer(server);
  }
});

test("POST /api/loyalty/claims — unknown memberId returns 404", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/loyalty/claims`, {
      method: "POST",
      body: { ...VALID_CLAIM, memberId: "mem_nonexistent" },
    });
    assert.equal(status, 404);
    assert.equal(body.message, "Member not found.");
  } finally {
    await stopServer(server);
  }
});

test("POST /api/loyalty/claims — successful claim stores awarded points correctly", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/loyalty/claims`, {
      method: "POST",
      body: VALID_CLAIM,
    });
    assert.equal(status, 201);
    assert.equal(body.ok, true);
    assert.ok(body.claimId);
    assert.equal(body.receiptNo, VALID_CLAIM.receiptNo);
    assert.equal(body.awardedPoints, 1); // floor(170 / 100) = 1
    assert.equal(body.member.id, VALID_CLAIM.memberId);
    assert.equal(body.newPointsBalance, 1); // was 0, now 1
  } finally {
    await stopServer(server);
  }
});

test("POST /api/loyalty/claims — duplicate receipt returns 409", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    await request(`${url}/api/loyalty/claims`, { method: "POST", body: VALID_CLAIM });
    const { status, body } = await request(`${url}/api/loyalty/claims`, {
      method: "POST",
      body: VALID_CLAIM,
    });
    assert.equal(status, 409);
    assert.equal(body.message, "Receipt already claimed.");
  } finally {
    await stopServer(server);
  }
});

test("POST /api/loyalty/claims — points floor rule: 250 THB = 2 points", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/loyalty/claims`, {
      method: "POST",
      body: { ...VALID_CLAIM, totalAmount: 250 },
    });
    assert.equal(status, 201);
    assert.equal(body.awardedPoints, 2);
  } finally {
    await stopServer(server);
  }
});

test("POST /api/loyalty/claims — 99 THB earns 0 points", async () => {
  const repo = new MockRepository();
  const { server, url } = await startServer(repo);
  try {
    const { status, body } = await request(`${url}/api/loyalty/claims`, {
      method: "POST",
      body: { ...VALID_CLAIM, totalAmount: 99 },
    });
    assert.equal(status, 201);
    assert.equal(body.awardedPoints, 0);
    assert.equal(body.newPointsBalance, 0);
  } finally {
    await stopServer(server);
  }
});
