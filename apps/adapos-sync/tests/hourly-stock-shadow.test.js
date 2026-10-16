import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  hourlyStockProductKey,
  reconcileHourlyWindowAtNextAnchor,
  scanHourlyStockEvidence,
  toHourlyStockEvidencePayload,
} from "../src/delta/hourlyStockEvidence.js";
import { runHourlyStockShadow } from "../src/delta/hourlyStockShadow.js";
import { hourlyStockShadowCachePath } from "../src/delta/hourlyStockShadowCache.js";

function row(productCode, retailOnHand, latestEstimatedOnHand) {
  return {
    product_code: productCode,
    qty: retailOnHand,
    latest_estimated_on_hand: latestEstimatedOnHand,
  };
}

function run(cacheDir, rows, overrides = {}) {
  return runHourlyStockShadow({
    branchCode: "004",
    rows,
    cacheDir,
    contentCaptureBranches: new Set(["004"]),
    observationKind: "intraday",
    observedAt: "2026-09-13T02:00:00.000Z",
    acknowledgement: { authoritativeApplied: true, acceptedRecords: rows.length },
    ...overrides,
  });
}

test("hourly evidence configuration defaults to OFF, empty allowlist, and no observation kind", async () => {
  const names = [
    "ADAPOS_HOURLY_STOCK_EVIDENCE_SHADOW",
    "ADAPOS_HOURLY_STOCK_EVIDENCE_FULL_SYNC_LOCAL_SHADOW",
    "ADAPOS_HOURLY_STOCK_EVIDENCE_CONTENT_CAPTURE_BRANCHES",
    "ADAPOS_HOURLY_STOCK_EVIDENCE_OBSERVATION_KIND",
    "ADAPOS_HOURLY_STOCK_EVIDENCE_PRODUCT_CODES",
    "ADAPOS_HOURLY_STOCK_EVIDENCE_PLANNED_SLOT",
    "ADAPOS_HOURLY_STOCK_EVIDENCE_TOKEN",
  ];
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    const { syncConfig } = await import(`../src/config.js?hourly-defaults=${Date.now()}-${Math.random()}`);
    assert.equal(syncConfig.hourlyStockEvidence.enabled, false);
    assert.equal(syncConfig.hourlyStockEvidence.inlineAfterFullSyncEnabled, false);
    assert.deepEqual([...syncConfig.hourlyStockEvidence.contentCaptureBranches], []);
    assert.equal(syncConfig.hourlyStockEvidence.observationKind, "");
    assert.deepEqual(syncConfig.hourlyStockEvidence.productCodes, []);
    assert.equal(syncConfig.hourlyStockEvidence.plannedSlot, "");
    assert.equal(syncConfig.hourlyStockEvidence.uploadToken, "");
  } finally {
    for (const name of names) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
  }
});

test("dual-stock mapping keeps retail and estimated quantities separate and preserves missing estimate as null", () => {
  const scan = scanHourlyStockEvidence([
    row("P1", 20, 19),
    row("P2", 8, null),
  ], "004");
  const first = scan.get(hourlyStockProductKey("004", "P1"));
  const second = scan.get(hourlyStockProductKey("004", "P2"));
  assert.deepEqual(first.values, { retailOnHand: 20, latestEstimatedOnHand: 19 });
  assert.deepEqual(second.values, { retailOnHand: 8, latestEstimatedOnHand: null });
});

test("duplicate product identities are counted and keep Full payload last-write-wins semantics", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    const result = run(cacheDir, [row("P1", 20, 19), row("P1", 18, 17)], {
      acknowledgement: { authoritativeApplied: true, acceptedRecords: 1 },
    });
    assert.equal(result.scannedProducts, 1);
    assert.equal(result.duplicateProductCount, 1);
    assert.equal(result.cacheWriteOk, true);
    const cache = JSON.parse(readFileSync(hourlyStockShadowCachePath(cacheDir, "004"), "utf8"));
    const values = JSON.parse(Object.values(cache.documents)[0].content);
    assert.deepEqual(values, { latestEstimatedOnHand: 17, retailOnHand: 18 });
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("proposed payload names both source fields and never aliases estimated stock as canonical qty", () => {
  const payload = toHourlyStockEvidencePayload({
    rows: [row("P1", 20, 19)],
    branchCode: "4",
    observedAt: "2026-09-13T02:00:00.000Z",
    observationKind: "intraday",
  });
  assert.deepEqual(payload, {
    contractVersion: "hourly-dual-stock-shadow-v1",
    datasetTag: "hourly_dual_stock_evidence",
    branchCode: "004",
    observedAt: "2026-09-13T02:00:00.000Z",
    observationKind: "intraday",
    sourceTable: "TCNMPdt",
    retailSourceField: "FCPdtQtyRet",
    estimatedSourceField: "FCPdtQtyNow",
    records: [{ productCode: "P1", retailOnHand: 20, latestEstimatedOnHand: 19 }],
  });
  assert.equal("qty" in payload.records[0], false);
});

test("invalid FCPdtQtyNow fails loudly before a cache can be written", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    assert.throws(
      () => run(cacheDir, [row("P1", 20, "not-a-number")]),
      (error) => error.code === "INVALID_HOURLY_STOCK_VALUE",
    );
    assert.equal(existsSync(hourlyStockShadowCachePath(cacheDir, "004")), false);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("shadow reports new, unchanged, changed, disappeared, missing, content, and reduction metrics", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    const round0 = run(cacheDir, [row("P1", 20, 20), row("P2", 8, null)]);
    assert.equal(round0.newCount, 2);
    assert.equal(round0.duplicateProductCount, 0);
    assert.equal(round0.estimatedMissingCount, 1);
    assert.equal(round0.contentCaptureActive, true);
    assert.equal(round0.cacheWriteOk, true);

    const round1 = run(
      cacheDir,
      [row("P1", 20, 20), row("P3", 5, 4)],
      { observedAt: "2026-09-13T03:00:00.000Z" },
    );
    assert.deepEqual({
      unchanged: round1.unchangedCount,
      changed: round1.changedCount,
      fresh: round1.newCount,
      disappeared: round1.disappearedCount,
      mismatch: round1.contentMismatchCount,
      baselineMissing: round1.contentBaselineMissingCount,
      reduction: round1.estimatedRecordReductionPct,
    }, {
      unchanged: 1,
      changed: 0,
      fresh: 1,
      disappeared: 1,
      mismatch: 0,
      baselineMissing: 0,
      reduction: 50,
    });

    const round2 = run(
      cacheDir,
      [row("P1", 20, 18), row("P3", 5, 4)],
      { observedAt: "2026-09-13T04:00:00.000Z" },
    );
    assert.equal(round2.changedCount, 1);
    assert.equal(round2.unchangedCount, 1);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("content capture catches adversarial content drift behind an unchanged fingerprint", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    const sourceRows = [row("P1", 20, 19)];
    run(cacheDir, sourceRows);
    const cachePath = hourlyStockShadowCachePath(cacheDir, "004");
    const cache = JSON.parse(readFileSync(cachePath, "utf8"));
    const entry = Object.values(cache.documents)[0];
    entry.content = JSON.stringify({ latestEstimatedOnHand: 999, retailOnHand: 20 });
    writeFileSync(cachePath, JSON.stringify(cache), "utf8");

    const compared = run(cacheDir, sourceRows, { observedAt: "2026-09-13T03:00:00.000Z" });
    assert.equal(compared.unchangedCount, 1);
    assert.equal(compared.contentMismatchCount, 1);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("cache advancement requires an exact authoritative or local-read acknowledgement", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    const baseline = run(cacheDir, [row("P1", 20, 20)]);
    assert.equal(baseline.cacheWriteOk, true);
    const cachePath = hourlyStockShadowCachePath(cacheDir, "004");
    const before = readFileSync(cachePath, "utf8");

    const missing = run(cacheDir, [row("P1", 20, 19)], { acknowledgement: null });
    assert.equal(missing.cacheWriteOk, null);
    assert.equal(missing.cacheAdvanceSkippedReason, "source-ack-missing-or-inexact");
    assert.equal(readFileSync(cachePath, "utf8"), before);

    const localRead = run(cacheDir, [row("P1", 20, 17)], {
      acknowledgement: { sourceReadComplete: true, acceptedRecords: 1 },
    });
    assert.equal(localRead.cacheWriteOk, true);
    const afterLocalRead = readFileSync(cachePath, "utf8");
    assert.notEqual(afterLocalRead, before);

    const partial = run(cacheDir, [row("P1", 20, 18)], {
      acknowledgement: { authoritativeApplied: true, acceptedRecords: 0 },
    });
    assert.equal(partial.cacheWriteOk, null);
    assert.equal(readFileSync(cachePath, "utf8"), afterLocalRead);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("corrupt cache is rebuilt and cannot block the evidence shadow", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    const cachePath = hourlyStockShadowCachePath(cacheDir, "004");
    writeFileSync(cachePath, "{broken", "utf8");
    const result = run(cacheDir, [row("P1", 20, 19)]);
    assert.equal(result.cacheState, "rebuilt");
    assert.equal(result.cacheRebuildReason, "corrupt-json");
    assert.equal(result.cacheWriteOk, true);
    assert.doesNotThrow(() => JSON.parse(readFileSync(cachePath, "utf8")));
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("cache files and hashed product identities are isolated by branch; branch 002 is excluded", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    run(cacheDir, [row("P1", 20, 19)]);
    run(cacheDir, [row("P1", 7, 6)], {
      branchCode: "001",
      contentCaptureBranches: new Set(["001"]),
      acknowledgement: { authoritativeApplied: true, acceptedRecords: 1 },
    });
    assert.notEqual(hourlyStockProductKey("004", "P1"), hourlyStockProductKey("001", "P1"));
    assert.equal(existsSync(hourlyStockShadowCachePath(cacheDir, "004")), true);
    assert.equal(existsSync(hourlyStockShadowCachePath(cacheDir, "001")), true);
    assert.throws(
      () => run(cacheDir, [row("P1", 1, 1)], { branchCode: "002" }),
      (error) => error.code === "HOURLY_STOCK_BRANCH_NOT_ACTIVE",
    );
    assert.equal(existsSync(hourlyStockShadowCachePath(cacheDir, "002")), false);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("content capture remains hash-only outside the allowlist", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    const result = run(cacheDir, [row("P1", 20, 19)], { contentCaptureBranches: new Set() });
    assert.equal(result.contentCaptureActive, false);
    assert.equal(result.contentMismatchCount, null);
    const cache = JSON.parse(readFileSync(hourlyStockShadowCachePath(cacheDir, "004"), "utf8"));
    assert.deepEqual(cache.windows, {});
    assert.equal(Object.values(cache.documents)[0].content, null);
    assert.doesNotMatch(JSON.stringify(cache), /"retailOnHand"|"latestEstimatedOnHand"/);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("next morning reconciliation measures direction and drift without inventing a pass threshold", () => {
  const branch = "004";
  const p1 = hourlyStockProductKey(branch, "P1");
  const p2 = hourlyStockProductKey(branch, "P2");
  const previousWindow = {
    anchor: {
      observedAt: "2026-09-13T01:20:00.000Z",
      documents: {
        [p1]: { retailOnHand: 20, latestEstimatedOnHand: 20 },
        [p2]: { retailOnHand: 10, latestEstimatedOnHand: 10 },
      },
    },
    observations: [{
      observedAt: "2026-09-13T12:00:00.000Z",
      documents: {
        [p1]: { retailOnHand: 20, latestEstimatedOnHand: 18 },
        [p2]: { retailOnHand: 10, latestEstimatedOnHand: 12 },
      },
    }],
  };
  const current = scanHourlyStockEvidence([row("P1", 18, 18), row("P2", 9, 9)], branch);
  const result = reconcileHourlyWindowAtNextAnchor({ previousWindow, currentDocuments: current });
  assert.equal(result.status, "compared");
  assert.equal(result.eligibleProducts, 2);
  assert.equal(result.directionAgreementCount, 1);
  assert.equal(result.directionMismatchCount, 1);
  assert.equal(result.exactEstimateMatchCount, 1);
  assert.equal(result.absoluteErrorSum, 3);
  assert.equal(result.absoluteErrorMean, 1.5);
  assert.equal(result.absoluteErrorMax, 3);
  assert.equal(result.mismatchExamples[0].productKeyPrefix.length, 12);
  assert.equal("passed" in result, false);
});

test("morning anchor creates Round 0, intraday observations accumulate, and next anchor reconciles", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    const round0 = run(cacheDir, [row("P1", 20, 20)], {
      observationKind: "morning_anchor",
      observedAt: "2026-09-13T01:20:00.000Z",
    });
    assert.equal(round0.reconciliation.status, "baseline-created");
    run(cacheDir, [row("P1", 20, 18)], { observedAt: "2026-09-13T12:00:00.000Z" });
    const next = run(cacheDir, [row("P1", 18, 18)], {
      observationKind: "morning_anchor",
      observedAt: "2026-09-14T01:20:00.000Z",
    });
    assert.equal(next.reconciliation.status, "compared");
    assert.equal(next.reconciliation.directionAgreementCount, 1);
    assert.equal(next.reconciliation.absoluteErrorSum, 0);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("next anchor never compares across a missing calendar day", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    run(cacheDir, [row("P1", 20, 20)], {
      observationKind: "morning_anchor",
      observedAt: "2026-09-13T01:20:00.000Z",
    });
    run(cacheDir, [row("P1", 20, 18)], { observedAt: "2026-09-13T12:00:00.000Z" });
    const afterGap = run(cacheDir, [row("P1", 17, 17)], {
      observationKind: "morning_anchor",
      observedAt: "2026-09-15T01:20:00.000Z",
    });
    assert.deepEqual(afterGap.reconciliation, {
      status: "skipped",
      reason: "immediately-prior-calendar-window-missing",
    });
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("missing observation kind leaves the filesystem untouched", () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "hourly-stock-test-"));
  try {
    const result = run(cacheDir, [row("P1", 20, 19)], { observationKind: "" });
    assert.equal(result.cacheWriteOk, null);
    assert.equal(result.cacheAdvanceSkippedReason, "observation-kind-required");
    assert.equal(existsSync(hourlyStockShadowCachePath(cacheDir, "004")), false);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
