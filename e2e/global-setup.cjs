"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const bcrypt = require("bcryptjs");
const cfg = require("./config.cjs");
const { provisionDatabase } = require("./db.cjs");

function hash(pw) {
  return bcrypt.hashSync(pw, 10);
}

function apiEnv() {
  const u = cfg.USERS;
  return {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(cfg.API_PORT),
    DATABASE_URL: cfg.PG_DBURL,
    AUTH_JWT_SECRET: "e2e-secret",
    FEATURE_STOCK_REQUESTS: "true",
    COOKIE_SECURE: "false",
    COOKIE_SAME_SITE: "lax",
    CORS_ALLOW_ALL: "true",
    TRUST_PROXY: "false",
    POS_API_KEYS: "e2e-pos-key",
    ADMIN_USERS: u.admin.username,
    ADMIN_PASSWORD_HASH: hash(u.admin.password),
    BRANCH_USERS: [u.branch000, u.branch001, u.branch003].map((x) => x.username).join(","),
    BRANCH_USER_BRANCHES: [u.branch000, u.branch001, u.branch003]
      .map((x) => `${x.username}:${x.branch}`)
      .join(","),
    BRANCH_USER_PASSWORD_HASHES: [u.branch000, u.branch001, u.branch003]
      .map((x) => `${x.username}:${hash(x.password)}`)
      .join(","),
  };
}

function waitForHealth(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      });
      req.on("error", retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`admin-api health timed out at ${url}`));
      } else {
        setTimeout(attempt, 500);
      }
    };
    attempt();
  });
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`[e2e] ${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = async () => {
  const t0 = Date.now();
  console.log("[e2e] provisioning database...");
  await withTimeout(provisionDatabase(), 90000, "database provisioning");
  console.log(`[e2e] database ready in ${Date.now() - t0}ms`);

  console.log("[e2e] booting admin-api...");
  const serverPath = path.join(cfg.PAASRTSM_REPO, "apps", "admin-api", "src", "server.js");
  const apiLog = fs.openSync(path.join(__dirname, "admin-api.e2e.log"), "w");
  const child = spawn("node", [serverPath], {
    cwd: cfg.PAASRTSM_REPO,
    env: apiEnv(),
    stdio: ["ignore", apiLog, apiLog],
    detached: false,
  });

  fs.writeFileSync(cfg.RUNTIME_FILE, JSON.stringify({ apiPid: child.pid }));
  await waitForHealth(`${cfg.API_BASE}/admin/health`);
  console.log(`[e2e] admin-api ready on ${cfg.API_BASE} (pid ${child.pid})`);
};
