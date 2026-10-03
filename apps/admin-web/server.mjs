import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream";
import { fileURLToPath } from "node:url";

const defaultStaticDir = fileURLToPath(new URL("../../dist/admin-web/", import.meta.url));
const hopHeaders = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".glb": "model/gltf-binary",
};

function filteredHeaders(headers) {
  const blocked = new Set(hopHeaders);
  for (const name of String(headers.connection || "").split(",")) {
    blocked.add(name.trim().toLowerCase());
  }
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !blocked.has(name)));
}

function sendJson(res, status, error) {
  if (res.writableEnded || res.destroyed) return;
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify({ error }));
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

export function createAdminWebServer({
  upstreamOrigin = process.env.STOCKDAY_API_ORIGIN,
  staticDir = defaultStaticDir,
  upstreamTimeoutMs = 60_000,
} = {}) {
  const upstream = new URL(upstreamOrigin);
  if (!["http:", "https:"].includes(upstream.protocol) || upstream.username || upstream.password ||
      upstream.pathname !== "/" || upstream.search || upstream.hash) {
    throw new Error("STOCKDAY_API_ORIGIN must be an HTTP(S) origin without credentials or a path");
  }
  if (upstream.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(upstream.hostname)) {
    throw new Error("STOCKDAY_API_ORIGIN must use HTTPS outside local development");
  }
  const root = path.resolve(staticDir);

  async function serveStatic(req, res, pathname) {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD");
      return sendJson(res, 405, "Method not allowed");
    }
    let decoded;
    try { decoded = decodeURIComponent(pathname); }
    catch { return sendJson(res, 400, "Invalid path"); }
    if (decoded.includes("\\") || decoded.includes("\0") || decoded.split("/").includes("..")) {
      return sendJson(res, 400, "Invalid path");
    }
    let file = path.resolve(root, `.${decoded === "/" ? "/index.html" : decoded}`);
    if (!isWithin(root, file)) return sendJson(res, 404, "Not found");
    try {
      const rootReal = await realpath(root);
      let fileStat;
      try { fileStat = await stat(file); } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      }
      if (!fileStat?.isFile()) {
        if (path.extname(decoded) || !String(req.headers.accept || "").includes("text/html")) {
          return sendJson(res, 404, "Not found");
        }
        file = path.join(root, "index.html");
        fileStat = await stat(file);
      }
      if (!isWithin(rootReal, await realpath(file))) return sendJson(res, 404, "Not found");
      res.writeHead(200, {
        "content-type": mimeTypes[path.extname(file).toLowerCase()] || "application/octet-stream",
        "content-length": fileStat.size,
        "x-content-type-options": "nosniff",
        "cache-control": decoded.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      });
      if (req.method === "HEAD") return res.end();
      pipeline(createReadStream(file), res, () => {});
    } catch {
      sendJson(res, 503, "Website build is unavailable");
    }
  }

  function proxy(req, res, url) {
    const upstreamPath = url.pathname.slice("/backend".length);
    if (!/^\/(?:admin|api)\//.test(upstreamPath)) return sendJson(res, 404, "Not found");
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return sendJson(res, 403, "Origin not allowed"); }
      if (!["http:", "https:"].includes(origin.protocol) || origin.host !== req.headers.host) {
        return sendJson(res, 403, "Origin not allowed");
      }
    }
    // The destination is fixed server configuration, never a caller-supplied URL.
    const target = new URL(upstreamPath + url.search, upstream);
    const headers = filteredHeaders(req.headers);
    headers.host = upstream.host;
    // Do not relay spoofable forwarding headers into backend login rate limits.
    for (const name of Object.keys(headers)) {
      if (name.startsWith("x-forwarded-") || name === "forwarded") delete headers[name];
    }
    // Trust only the nearest proxy's appended address when running behind Render.
    const clientIp = process.env.RENDER
      ? String(req.headers["x-forwarded-for"] || "").split(",").at(-1)?.trim()
      : req.socket.remoteAddress;
    if (clientIp) headers["x-forwarded-for"] = clientIp;
    const request = (upstream.protocol === "https:" ? https : http).request(target, {
      method: req.method, headers,
    }, (response) => {
      const responseHeaders = filteredHeaders(response.headers);
      for (const name of Object.keys(responseHeaders)) {
        if (name.startsWith("access-control-")) delete responseHeaders[name];
      }
      // Host-only HttpOnly session cookies now belong to the website's own origin.
      // Authentication responses and private stock data must never enter a shared cache.
      responseHeaders["cache-control"] = "no-store";
      res.writeHead(response.statusCode, responseHeaders);
      pipeline(response, res, () => {});
    });
    const timeout = setTimeout(() => {
      sendJson(res, 504, "Backend request timed out");
      request.destroy();
    }, upstreamTimeoutMs);
    timeout.unref();
    request.on("error", () => sendJson(res, 502, "Backend is temporarily unavailable"));
    res.on("close", () => { clearTimeout(timeout); request.destroy(); });
    req.on("aborted", () => request.destroy());
    req.pipe(request);
  }

  return http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, "http://gateway.invalid"); }
    catch { return sendJson(res, 400, "Invalid URL"); }
    if (url.pathname === "/healthz" && ["GET", "HEAD"].includes(req.method)) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(req.method === "HEAD" ? undefined : '{"ok":true,"service":"stockday-admin-web"}');
    }
    if (url.pathname === "/backend" || url.pathname.startsWith("/backend/")) return proxy(req, res, url);
    void serveStatic(req, res, url.pathname);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createAdminWebServer();
  server.listen(Number(process.env.PORT || 4173), "0.0.0.0", () => {
    console.log("SC StockDay website gateway is listening");
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => { server.close(); server.closeIdleConnections(); });
  }
}
