import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "..", "src", "index.js"), "utf8");

test("all non-branch_stock datasets remain v1 and finalize is gated behind their posting blocks", () => {
  for (const endpoint of [
    "/api/sync/products",
    "/api/sync/sales-summary",
    "/api/sync/ada/sales",
    "/api/sync/ada/transfers",
    "/api/sync/ada/pending-receipts",
    "/api/sync/ada/approved-receipts",
    "/api/sync/ada/stock-snapshots",
    "/api/sync/ada/prices/defaults",
    "/api/sync/ada/prices/branch-overrides",
  ]) assert.ok(source.includes(endpoint), `${endpoint} must remain wired to v1`);

  const history = source.indexOf('/api/sync/ada/stock-snapshots');
  const finalize = source.indexOf("await finalizeRun(");
  const wait = source.indexOf("await waitForApplied(");
  const successLog = source.indexOf('status: "success"', wait);
  const postingCatch = source.indexOf("} catch (postErr)", finalize);
  assert.ok(history > 0 && finalize > history, "finalize must follow branch_stock_history v1 posting");
  assert.ok(wait > finalize && successLog > wait, "success run-log must follow terminal apply wait");
  assert.ok(postingCatch > finalize, "a v1 throw must skip finalize and enter the failed run-log path");
});

test("dry-run guards network-only preflight and live execution", () => {
  assert.match(source, /syncConfig\.skipIfSyncedToday && !syncConfig\.dryRun/);
  assert.ok(source.indexOf("if (syncConfig.dryRun)") < source.indexOf("syncRunId = await startHybridRun"));
});
