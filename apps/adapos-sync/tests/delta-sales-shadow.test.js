import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSalesShadow } from "../src/delta/salesShadow.js";
import { shadowCachePath, readShadowCache, SHADOW_CACHE_STORAGE_VERSION } from "../src/delta/salesShadowCache.js";
import { FINGERPRINT_CONTRACT_VERSION } from "../src/delta/salesFingerprint.js";

function header(overrides = {}) {
  return {
    FTBchCode: "004",
    FTShdDocNo: "DOC-1",
    FTShdDocType: "1",
    FDShdDocDate: new Date("2026-08-01T00:00:00Z"),
    FTShdDocTime: "10:00:00",
    FTCstCode: "CUST-1",
    FTShdStaPaid: "3",
    FTShdStaRefund: null,
    FTShdStaDoc: "1",
    FTUsrCode: "USR1",
    FTPosCode: "POS1",
    FTShdPosCN: null,
    FCShdTotal: 100,
    FCShdDis: 0,
    FCShdAftDisChg: 100,
    FCShdVat: 6.54,
    FCShdGrand: 100,
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    FTBchCode: "004",
    FTShdDocNo: "DOC-1",
    FNSdtSeqNo: 1,
    FTPdtCode: "PDT-1",
    FTPdtName: "สินค้า 1",
    FTSdtBarCode: "8850000000001",
    FTPunCode: "EA",
    FTSdtUnitName: "ชิ้น",
    FCSdtQty: 2,
    FCSdtStkFac: 1,
    FCSdtQtyAll: 2,
    FCSdtSetPrice: 50,
    FCSdtDis: 0,
    FCSdtNet: 100,
    FCSdtDisAvg: 0,
    FCSdtFootAvg: 0,
    FCSdtRePackAvg: 0,
    FTSdtLotNo: "LOT1",
    FDSdtExpired: new Date("2027-01-01T00:00:00Z"),
    ...overrides,
  };
}

function withTempCacheDir(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "delta-shadow-rebuild-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 1. identical scan → unchanged (shadow-level: 2nd run of the same data)
test("1. running the same scan twice yields changed=0, new=0, all unchanged on the 2nd run", () => {
  withTempCacheDir((cacheDir) => {
    const first = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(first.newCount, 1);
    const second = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(second.changedCount, 0);
    assert.equal(second.newCount, 0);
    assert.equal(second.unchangedCount, 1);
    assert.equal(second.disappearedCount, 0);
  });
});

// 2. new document
test("2. a document added on the 2nd run is counted as new, not changed", () => {
  withTempCacheDir((cacheDir) => {
    runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    const second = runSalesShadow({
      branchCode: "004",
      headerRows: [header(), header({ FTShdDocNo: "DOC-2" })],
      lineRows: [line(), line({ FTShdDocNo: "DOC-2" })],
      cacheDir,
    });
    assert.equal(second.newCount, 1);
    assert.equal(second.unchangedCount, 1);
    assert.equal(second.changedCount, 0);
  });
});

// 3/6. header correction / changed line -> changedCount
test("3/6. a header correction or line change on an existing document is counted as changed", () => {
  withTempCacheDir((cacheDir) => {
    runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    const second = runSalesShadow({
      branchCode: "004",
      headerRows: [header({ FCShdGrand: 80, FCShdAftDisChg: 80 })],
      lineRows: [line()],
      cacheDir,
    });
    assert.equal(second.changedCount, 1);
    assert.equal(second.unchangedCount, 0);
    assert.equal(second.newCount, 0);
  });
});

// 16. disappeared document is a COUNT only, never a deletion signal, and the
// shadow cache write must not throw when this happens.
test("16. a document missing from the 2nd scan is counted in disappearedCount only, never deleted/tombstoned", () => {
  withTempCacheDir((cacheDir) => {
    runSalesShadow({
      branchCode: "004",
      headerRows: [header(), header({ FTShdDocNo: "DOC-2" })],
      lineRows: [line(), line({ FTShdDocNo: "DOC-2" })],
      cacheDir,
    });
    const second = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(second.disappearedCount, 1);
    assert.equal(second.unchangedCount, 1);
    // The result object carries a COUNT, never a list of the disappeared keys
    // (that would itself be a document-number leak) and never a "deleted"/
    // "tombstone" field of any kind.
    assert.equal(Object.prototype.hasOwnProperty.call(second, "deleted"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(second, "tombstoned"), false);
    const cache = readShadowCache(cacheDir, "004");
    assert.equal(cache.documents.size, 1);
  });
});

// 18/19/20/21. corrupt/missing/version-mismatched/wrong-branch cache -> rebuild, never throws
test("18. a missing cache file rebuilds cleanly (state=rebuilt) without throwing", () => {
  withTempCacheDir((cacheDir) => {
    const result = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(result.cacheState, "rebuilt");
    assert.equal(result.newCount, 1);
  });
});

test("19. a corrupt (non-JSON) cache file rebuilds cleanly instead of throwing", () => {
  withTempCacheDir((cacheDir) => {
    writeFileSync(shadowCachePath(cacheDir, "004"), "{not valid json!!", "utf8");
    const result = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(result.cacheState, "rebuilt");
    assert.equal(result.cacheRebuildReason, "corrupt-json");
  });
});

test("20. a version-mismatched cache file rebuilds cleanly instead of trusting stale data", () => {
  withTempCacheDir((cacheDir) => {
    writeFileSync(
      shadowCachePath(cacheDir, "004"),
      JSON.stringify({ contractVersion: "delta-shadow-sales-v0-old", branchCode: "004", documents: { x: "y" } }),
      "utf8",
    );
    const result = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(result.cacheState, "rebuilt");
    assert.equal(result.cacheRebuildReason, "version-mismatch");
  });
});

test("21. a cache file belonging to a different branch rebuilds cleanly rather than cross-contaminating", () => {
  withTempCacheDir((cacheDir) => {
    writeFileSync(
      shadowCachePath(cacheDir, "004"),
      JSON.stringify({
        contractVersion: FINGERPRINT_CONTRACT_VERSION,
        cacheStorageVersion: SHADOW_CACHE_STORAGE_VERSION,
        branchCode: "999-wrong-branch",
        documents: { x: { fingerprint: "y", content: null } },
      }),
      "utf8",
    );
    const result = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(result.cacheState, "rebuilt");
    assert.equal(result.cacheRebuildReason, "branch-mismatch");
  });
});

// 22/23. interrupted write / atomic replacement
test("22/23. a stray leftover temp file from an interrupted write does not corrupt the real cache on the next read, and the real file is only ever replaced atomically", () => {
  withTempCacheDir((cacheDir) => {
    runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    const realPath = shadowCachePath(cacheDir, "004");
    writeFileSync(path.join(cacheDir, ".tmp-sales-shadow-stray-interrupted"), "{garbage, not renamed", "utf8");

    const result = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(result.cacheState, "loaded");
    assert.equal(result.unchangedCount, 1);
    assert.equal(existsSync(realPath), true);
    assert.notEqual(readFileSync(realPath, "utf8"), "{garbage, not renamed");
  });
});

// 24. disk/path permission failure must not fail Full Sync — the write
// failure is reported in the result, never thrown.
test("24. a cache write failure (invalid/unwritable path) is reported, never thrown — Full Sync is unaffected", () => {
  // A path with a NUL byte is invalid on every OS and guarantees a real
  // filesystem-level failure rather than relying on OS-specific permission
  // setup, which would make this test flaky across CI/dev machines.
  const invalidCacheDir = path.join(os.tmpdir(), "delta-shadow-invalid-\0-dir");
  assert.doesNotThrow(() => {
    const result = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir: invalidCacheDir });
    assert.equal(result.cacheWriteOk, false);
  });
});

// 30. cache contains no raw customer/product/lot payload, and — per the
// Codex cache-identity remediation — no plaintext document number or
// plaintext "branch::docNo" identity either. documentKey() is now a
// one-way SHA-256 of a canonical [branchCode, docNo] tuple, so the real
// business document number never reaches disk in any form.
test("30. the on-disk cache file contains only hashed document keys and hex fingerprints — no raw row content, no plaintext doc number", () => {
  withTempCacheDir((cacheDir) => {
    runSalesShadow({
      branchCode: "004",
      headerRows: [header({ FTCstCode: "SECRET-CUSTOMER-ID" })],
      lineRows: [line({ FTSdtLotNo: "SECRET-LOT", FTPdtCode: "SECRET-PRODUCT" })],
      cacheDir,
    });
    const raw = readFileSync(shadowCachePath(cacheDir, "004"), "utf8");
    assert.equal(raw.includes("SECRET-CUSTOMER-ID"), false);
    assert.equal(raw.includes("SECRET-LOT"), false);
    assert.equal(raw.includes("SECRET-PRODUCT"), false);
    // Sentinel doc number for this test's own fixture must not appear in
    // any plaintext form — neither bare, nor as the old "branch::docNo" shape.
    assert.equal(raw.includes("DOC-1"), false);
    assert.equal(raw.includes("004::DOC-1"), false);
    // Every key under "documents" must be a 64-hex-char SHA-256 digest.
    const parsed = JSON.parse(raw);
    for (const key of Object.keys(parsed.documents)) {
      assert.match(key, /^[0-9a-f]{64}$/, `expected every cache key to be a SHA-256 hex digest, got "${key}"`);
    }
  });
});

// 31. shadow log/console output has no document/customer/product identifiers
test("31. the shadow result object (what gets logged) contains only counts/percentages/contract metadata — no identifiers", () => {
  withTempCacheDir((cacheDir) => {
    const result = runSalesShadow({
      branchCode: "004",
      headerRows: [header({ FTCstCode: "SECRET-CUSTOMER-ID" })],
      lineRows: [line({ FTSdtLotNo: "SECRET-LOT" })],
      cacheDir,
    });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("SECRET"), false);
    assert.equal(serialized.includes("DOC-1"), false);
    assert.equal(serialized.includes("PDT-1"), false);
    assert.deepEqual(Object.keys(result).sort(), [
      "branchCode",
      "cacheRebuildReason",
      "cacheState",
      "cacheWriteOk",
      "changedCount",
      "contentCaptureActive",
      "contentComparisonSkippedReason",
      "contentMismatchCount",
      "contractVersion",
      "datasetTag",
      "disappearedCount",
      "estimatedRecordReductionPct",
      "newCount",
      "scannedDocuments",
      "unchangedCount",
      "wouldSendCount",
    ]);
    assert.equal(result.contractVersion, FINGERPRINT_CONTRACT_VERSION);
    // No contentCaptureBranches was passed, so content capture must be
    // inactive for this branch — the new fields must reflect "didn't check",
    // never a false "checked and found 0".
    assert.equal(result.contentCaptureActive, false);
    assert.equal(result.contentMismatchCount, null);
    assert.equal(result.contentComparisonSkippedReason, null);
  });
});

test("aggregate estimatedRecordReductionPct reflects the unchanged share of scanned documents", () => {
  withTempCacheDir((cacheDir) => {
    runSalesShadow({
      branchCode: "004",
      headerRows: [header(), header({ FTShdDocNo: "DOC-2" })],
      lineRows: [line(), line({ FTShdDocNo: "DOC-2" })],
      cacheDir,
    });
    const second = runSalesShadow({
      branchCode: "004",
      headerRows: [header(), header({ FTShdDocNo: "DOC-2" })],
      lineRows: [line(), line({ FTShdDocNo: "DOC-2" })],
      cacheDir,
    });
    assert.equal(second.estimatedRecordReductionPct, 100);
  });
});
