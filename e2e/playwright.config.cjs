"use strict";

const { defineConfig, devices } = require("@playwright/test");
const cfg = require("./config.cjs");

module.exports = defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  workers: 1,
  timeout: 150000,
  expect: { timeout: 10000 },
  reporter: [["list"]],
  globalSetup: require.resolve("./global-setup.cjs"),
  globalTeardown: require.resolve("./global-teardown.cjs"),
  use: {
    baseURL: cfg.WEB_BASE,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build -w apps/order-web && npm run preview -w apps/order-web",
    cwd: cfg.ORDER_WEB_REPO,
    port: cfg.WEB_PORT,
    reuseExistingServer: false,
    timeout: 180000,
    env: { VITE_API_BASE_URL: cfg.API_BASE },
  },
});
