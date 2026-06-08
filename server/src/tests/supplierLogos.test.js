import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createRouter } from "../routes.js";

function svgDataUrl(svgText) {
  return `data:image/svg+xml;base64,${Buffer.from(svgText, "utf8").toString("base64")}`;
}

function makeRepo() {
  const logos = [];
  return {
    getSupplierLogos: async () => logos,
    upsertSupplierLogo: async (logo) => {
      const existing = logos.find((item) => item.supplierKey === logo.supplierKey);
      if (existing) {
        Object.assign(existing, logo);
        return existing;
      }
      logos.push(logo);
      return logo;
    },
  };
}

function startServer(repo) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
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

test("PUT /api/admin/supplier-logos stores SVG data URLs", async () => {
  const { server, url } = await startServer(makeRepo());
  try {
    const logoDataUrl = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
    const saveResponse = await fetch(`${url}/api/admin/supplier-logos`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierKey: "tnp",
        supplierName: "TNP Healthcare",
        logoDataUrl,
      }),
    });
    assert.equal(saveResponse.status, 200);
    const saveBody = await saveResponse.json();
    assert.equal(saveBody.logo.logoDataUrl, logoDataUrl);

    const listResponse = await fetch(`${url}/api/admin/supplier-logos`);
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json();
    assert.equal(listBody.logos.length, 1);
    assert.equal(listBody.logos[0].supplierName, "TNP Healthcare");
  } finally {
    await stopServer(server);
  }
});

test("PUT /supplier-logos aliases the admin supplier logo endpoint", async () => {
  const { server, url } = await startServer(makeRepo());
  try {
    const logoDataUrl = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>');
    const saveResponse = await fetch(`${url}/supplier-logos`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierKey: "pks",
        supplierName: "PKS Medical Center",
        logoDataUrl,
      }),
    });
    assert.equal(saveResponse.status, 200);

    const listResponse = await fetch(`${url}/supplier-logos`);
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json();
    assert.equal(listBody.logos[0].logoDataUrl, logoDataUrl);
  } finally {
    await stopServer(server);
  }
});

test("PUT /api/admin/supplier-logos rejects unsafe SVG markup", async () => {
  const { server, url } = await startServer(makeRepo());
  try {
    const response = await fetch(`${url}/api/admin/supplier-logos`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierKey: "unsafe",
        supplierName: "Unsafe Supplier",
        logoDataUrl: svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /unsafe/i);
  } finally {
    await stopServer(server);
  }
});
