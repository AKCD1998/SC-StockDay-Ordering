import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { test } from "node:test";
import { createAdminWebServer } from "../apps/admin-web/server.mjs";

test("same-origin gateway preserves the login cookie, CSRF, uploads, and logout", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "stockday-gateway-"));
  await mkdir(path.join(dir, "assets"));
  await writeFile(path.join(dir, "index.html"), "<h1>StockDay</h1>");
  await writeFile(path.join(dir, "assets", "app.js"), "console.log('stockday');");
  const observed = [];
  const backend = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    observed.push({ url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks) });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "https://old-frontend.example");
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (req.url === "/admin/auth/login") {
      res.setHeader("Set-Cookie", ["admin_session=test-session; Path=/; HttpOnly; SameSite=None; Secure", "other=test; Path=/"]);
      return res.end('{"user":{"id":"test-user"},"csrf_token":"test-csrf"}');
    }
    if (req.url === "/admin/auth/logout") {
      res.setHeader("Set-Cookie", "admin_session=; Path=/; HttpOnly; Max-Age=0");
      res.writeHead(204);
      return res.end();
    }
    if (!req.headers.cookie?.includes("admin_session=test-session")) {
      res.writeHead(401);
      return res.end('{"error":"Unauthorized"}');
    }
    if (req.method === "POST" && req.headers["x-csrf-token"] !== "test-csrf") {
      res.writeHead(403);
      return res.end('{"error":"CSRF token invalid"}');
    }
    res.end('{"ok":true}');
  });
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const gateway = createAdminWebServer({ upstreamOrigin: `http://127.0.0.1:${backend.address().port}`, staticDir: dir });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  const origin = `http://127.0.0.1:${gateway.address().port}`;
  t.after(async () => {
    for (const server of [gateway, backend]) {
      await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    }
    await rm(dir, { recursive: true, force: true });
  });

  const login = await fetch(`${origin}/backend/admin/auth/login`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test-user", password: "test-only" }),
  });
  assert.equal(login.status, 200);
  assert.equal(login.headers.getSetCookie().length, 2);
  assert.match(login.headers.getSetCookie()[0], /HttpOnly/);
  assert.equal(login.headers.get("cache-control"), "no-store");
  assert.equal(login.headers.get("access-control-allow-origin"), null);
  const cookie = login.headers.getSetCookie()[0].split(";")[0];
  assert.equal((await fetch(`${origin}/backend/admin/me`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${origin}/backend/admin/me`)).status, 401);
  const body = new Uint8Array([0, 255, 13, 10, 3]);
  const upload = await fetch(`${origin}/backend/api/upload?branch=005`, {
    method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": "test-csrf", "Content-Type": "multipart/form-data; boundary=test" }, body,
  });
  assert.equal(upload.status, 200);
  assert.equal(observed.at(-1).url, "/api/upload?branch=005");
  assert.deepEqual(observed.at(-1).body, Buffer.from(body));
  assert.equal((await fetch(`${origin}/backend/api/upload`, { method: "POST", headers: { Cookie: cookie } })).status, 403);
  const logout = await fetch(`${origin}/backend/admin/auth/logout`, { method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": "test-csrf" } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/);

  const requestCount = observed.length;
  assert.equal((await fetch(`${origin}/backend/admin/me`, { headers: { Origin: "https://unrelated.example" } })).status, 403);
  assert.equal((await fetch(`${origin}/backend/internal/secret`)).status, 404);
  assert.equal(observed.length, requestCount);
  const asset = await fetch(`${origin}/assets/app.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.equal((await fetch(`${origin}/assets/missing.js`)).status, 404);
  const spa = await fetch(`${origin}/branch-stock`, { headers: { Accept: "text/html" } });
  assert.equal(await spa.text(), "<h1>StockDay</h1>");
  assert.equal((await fetch(`${origin}/index.html`, { method: "HEAD" })).headers.get("content-length"), "17");
  assert.equal((await fetch(`${origin}/%2e%2e%5coutside`)).status, 400);
});

test("an unavailable backend returns a clear, uncacheable gateway error", async (t) => {
  const unavailable = http.createServer();
  unavailable.listen(0, "127.0.0.1");
  await once(unavailable, "listening");
  const port = unavailable.address().port;
  await new Promise((resolve) => unavailable.close(resolve));
  const gateway = createAdminWebServer({ upstreamOrigin: `http://127.0.0.1:${port}` });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  t.after(() => new Promise((resolve) => { gateway.close(resolve); gateway.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/backend/admin/me`);
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Backend is temporarily unavailable" });
});

test("upstream configuration cannot carry a path, credentials, or public plain HTTP", () => {
  for (const upstreamOrigin of ["https://example.com/path", "https://user:pass@example.com", "http://example.com"]) {
    assert.throws(() => createAdminWebServer({ upstreamOrigin }));
  }
});
