import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSalesShadow } from "../src/delta/salesShadow.js";
import { shadowCachePath } from "../src/delta/salesShadowCache.js";

// This file exercises the content-capture wiring added 2026-08-16 to fill
// DELTA_SYNC_STATUS.md's identified Stage 1 gap: the pure-JS/real-Postgres
// suites in delta-sales-shadow-projection*.test.js already proved the
// comparison LOGIC correct against synthetic fixtures; this file proves the
// RUNTIME WIRING correctly (a) stays a strict no-op for any branch not
// explicitly opted in (default: every branch, since the default allowlist
// is empty) and (b) actually catches a real fingerprint/content
// disagreement for an opted-in branch, using the real on-disk cache — not
// a mocked/injected scanner.
//
// See salesShadow.js's own header comment for the full privacy tradeoff,
// scope, and graduation criteria this content-capture mode operates under.
// Approved 2026-08-16 (open question #9, DELTA_SYNC_DESIGN.md §10); see
// _ledger/claude.md.

function header(overrides = {}) {
  return {
    FTBchCode: "004", FTShdDocNo: "DOC-1", FTShdDocType: "1",
    FDShdDocDate: new Date("2026-08-01T00:00:00Z"), FTShdDocTime: "10:00:00",
    FTCstCode: "CUST-1", FTShdStaPaid: "3", FTShdStaRefund: null, FTShdStaDoc: "1",
    FTUsrCode: "USR1", FTPosCode: "POS1", FTShdPosCN: null,
    FCShdTotal: 100, FCShdDis: 0, FCShdAftDisChg: 100, FCShdVat: 6.54, FCShdGrand: 100,
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    FTBchCode: "004", FTShdDocNo: "DOC-1", FNSdtSeqNo: 1, FTPdtCode: "PDT-1",
    FCSdtQty: 2, FCSdtStkFac: 1, FCSdtQtyAll: 2, FCSdtSetPrice: 50, FCSdtDis: 0, FCSdtNet: 100,
    FCSdtDisAvg: 0, FCSdtFootAvg: 0, FCSdtRePackAvg: 0,
    FTSdtLotNo: "LOT1", FDSdtExpired: new Date("2027-01-01T00:00:00Z"),
    ...overrides,
  };
}

function withTempCacheDir(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "delta-shadow-content-capture-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("1. content capture is a strict no-op when contentCaptureBranches is omitted entirely", () => {
  withTempCacheDir((cacheDir) => {
    const result = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(result.contentCaptureActive, false);
    assert.equal(result.contentMismatchCount, null);
    const raw = readFileSync(shadowCachePath(cacheDir, "004"), "utf8");
    assert.equal(JSON.parse(raw).documents[Object.keys(JSON.parse(raw).documents)[0]].content, null);
  });
});

test("2. a branch NOT in contentCaptureBranches gets no content capture even when the set is non-empty", () => {
  withTempCacheDir((cacheDir) => {
    const result = runSalesShadow({
      branchCode: "004",
      headerRows: [header()], lineRows: [line()],
      cacheDir,
      contentCaptureBranches: new Set(["999-some-other-branch"]),
    });
    assert.equal(result.contentCaptureActive, false);
    assert.equal(result.contentMismatchCount, null);
  });
});

test("3. an opted-in branch caches real canonicalized content and reports contentCaptureActive=true", () => {
  withTempCacheDir((cacheDir) => {
    const result = runSalesShadow({
      branchCode: "004",
      headerRows: [header()], lineRows: [line()],
      cacheDir,
      contentCaptureBranches: new Set(["004"]),
    });
    assert.equal(result.contentCaptureActive, true);
    assert.equal(result.contentMismatchCount, 0); // first run: everything is "new", nothing to compare
    const raw = readFileSync(shadowCachePath(cacheDir, "004"), "utf8");
    const parsed = JSON.parse(raw);
    const onlyDoc = parsed.documents[Object.keys(parsed.documents)[0]];
    assert.notEqual(onlyDoc.content, null);
    assert.equal(typeof onlyDoc.content, "string");
    // The content itself is real (canonicalized), not further hashed —
    // this IS the deliberate, approved, temporary exposure this mode trades
    // for stronger evidence; confirmed present so a later revert has
    // something concrete to remove, not accidentally already-hashed data.
    assert.equal(onlyDoc.content.includes("CUST-1"), true);
  });
});

test("4. a second identical run for an opted-in branch reports contentMismatchCount=0 for an unchanged document", () => {
  withTempCacheDir((cacheDir) => {
    const opts = { branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir, contentCaptureBranches: new Set(["004"]) };
    runSalesShadow(opts);
    const second = runSalesShadow(opts);
    assert.equal(second.unchangedCount, 1);
    assert.equal(second.contentMismatchCount, 0);
  });
});

test("5. a real content change between runs is still contentMismatchCount=0 (a Delta run WOULD resend a changed doc, so projected==actual by construction)", () => {
  withTempCacheDir((cacheDir) => {
    const opts = (overrides) => ({
      branchCode: "004",
      headerRows: [header(overrides)], lineRows: [line()],
      cacheDir,
      contentCaptureBranches: new Set(["004"]),
    });
    runSalesShadow(opts({}));
    const second = runSalesShadow(opts({ FCShdGrand: 90, FCShdAftDisChg: 90 }));
    assert.equal(second.changedCount, 1);
    assert.equal(second.contentMismatchCount, 0);
  });
});

// 6. THE adversarial case: a fingerprint that (correctly, honestly) still
// says "unchanged" run-over-run, but whose cached content has gone stale
// relative to reality — the exact production failure mode Stage 1 exists to
// catch, reproduced here via the REAL on-disk cache (not a mocked scanner),
// proving the runtime wiring — not just the standalone comparison module —
// actually performs this check and is not silently skipped/dead code.
test("6. adversarial: a cache whose stored content disagrees with an otherwise-identical fingerprint is caught as a real mismatch", () => {
  withTempCacheDir((cacheDir) => {
    const opts = { branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir, contentCaptureBranches: new Set(["004"]) };
    runSalesShadow(opts); // seeds a correct cache entry

    // Simulate the exact failure mode: hand-corrupt the cached content for
    // the one document, leaving its fingerprint untouched. The 2nd real run
    // below will compute the SAME fingerprint for the SAME (unchanged)
    // input rows, so the fingerprint layer will (correctly, per its own
    // logic) classify this as "unchanged" — but the now-stale cached
    // content no longer matches. This is what a genuine fingerprint-
    // algorithm bug producing a false "unchanged" would look like from the
    // comparison's point of view.
    const cachePath = shadowCachePath(cacheDir, "004");
    const parsed = JSON.parse(readFileSync(cachePath, "utf8"));
    const onlyKey = Object.keys(parsed.documents)[0];
    parsed.documents[onlyKey].content = "H[{\"deliberately\":\"corrupted-stale-content\"}]L[]";
    writeFileSync(cachePath, JSON.stringify(parsed), "utf8");

    const second = runSalesShadow(opts);
    assert.equal(second.unchangedCount, 1, "fingerprint must still classify this as unchanged (same input rows)");
    assert.equal(second.contentMismatchCount, 1, "the runtime wiring must catch the real content disagreement, not silently trust the fingerprint");
  });
});

// 7. privacy floor still holds for a branch NOT opted in, even in a run
// where content capture IS active elsewhere in principle (defense in depth
// against a config mistake that widens contentCaptureBranches accidentally
// affecting the wrong branch's cache file).
test("7. a non-opted-in branch's own cache file never contains raw content, even when another branch code is in the allowlist", () => {
  withTempCacheDir((cacheDir) => {
    runSalesShadow({
      branchCode: "001",
      headerRows: [header({ FTBchCode: "001", FTCstCode: "SECRET-001-CUSTOMER" })],
      lineRows: [line({ FTBchCode: "001" })],
      cacheDir,
      contentCaptureBranches: new Set(["004"]), // 001 is NOT in this set
    });
    const raw = readFileSync(shadowCachePath(cacheDir, "001"), "utf8");
    assert.equal(raw.includes("SECRET-001-CUSTOMER"), false);
    const parsed = JSON.parse(raw);
    for (const key of Object.keys(parsed.documents)) {
      assert.equal(parsed.documents[key].content, null);
    }
  });
});

// 8. contentMismatchCount and contentCaptureActive never leak into a
// disappeared-only run (no current documents to compare) — must stay a
// clean 0/true, not throw, not null out unexpectedly.
test("8. an opted-in branch with zero current documents (empty scan) does not throw and reports a clean zero mismatch count", () => {
  withTempCacheDir((cacheDir) => {
    const opts = { branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir, contentCaptureBranches: new Set(["004"]) };
    runSalesShadow(opts);
    const second = runSalesShadow({ ...opts, headerRows: [], lineRows: [] });
    assert.equal(second.scannedDocuments, 0);
    assert.equal(second.disappearedCount, 1);
    assert.equal(second.contentCaptureActive, true);
    assert.equal(second.contentMismatchCount, 0);
  });
});
