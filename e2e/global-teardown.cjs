"use strict";

const fs = require("fs");
const cfg = require("./config.cjs");
const { stopCluster } = require("./db.cjs");

module.exports = async () => {
  try {
    if (fs.existsSync(cfg.RUNTIME_FILE)) {
      const { apiPid } = JSON.parse(fs.readFileSync(cfg.RUNTIME_FILE, "utf8"));
      if (apiPid) {
        try {
          process.kill(apiPid);
        } catch (_error) {
          // already gone
        }
      }
      fs.rmSync(cfg.RUNTIME_FILE, { force: true });
    }
  } catch (_error) {
    // best effort
  }

  // Keep the throwaway cluster running between runs by default to avoid flaky
  // stop/start churn; set E2E_STOP_DB=1 to tear it down explicitly.
  if (process.env.E2E_STOP_DB === "1") {
    stopCluster();
  }
};
