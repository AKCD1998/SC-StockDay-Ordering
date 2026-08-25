import assert from "node:assert/strict";
import { test } from "vitest";

import { summarizeBranchSales } from "./salesTargetHelpers.js";

test("summarizeBranchSales totals the requested branches", () => {
  const summary = summarizeBranchSales({
    "001": { actualSoFar: 100.5 },
    "003": { actualSoFar: "200.25" },
    "004": { actualSoFar: 300 },
    "005": { actualSoFar: 400.25 },
    "999": { actualSoFar: 9999 },
  }, ["001", "003", "004", "005"]);

  assert.deepEqual(summary, {
    actualSoFar: 1001,
    availableBranchCount: 4,
    branchCount: 4,
    isComplete: true,
  });
});

test("summarizeBranchSales does not present a partial total as all branches", () => {
  const summary = summarizeBranchSales({
    "001": { actualSoFar: 100 },
    "003": { actualSoFar: 200 },
    "005": { actualSoFar: 400 },
  }, ["001", "003", "004", "005"]);

  assert.equal(summary.actualSoFar, null);
  assert.equal(summary.availableBranchCount, 3);
  assert.equal(summary.branchCount, 4);
  assert.equal(summary.isComplete, false);
});

test("summarizeBranchSales preserves a valid all-zero total", () => {
  const summary = summarizeBranchSales({
    "001": { actualSoFar: 0 },
    "003": { actualSoFar: 0 },
  }, ["001", "003"]);

  assert.equal(summary.actualSoFar, 0);
  assert.equal(summary.isComplete, true);
});
