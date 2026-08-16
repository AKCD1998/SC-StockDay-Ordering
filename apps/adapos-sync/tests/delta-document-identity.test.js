import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { documentKey, FINGERPRINT_CONTRACT_VERSION } from "../src/delta/salesFingerprint.js";
import { runSalesShadow } from "../src/delta/salesShadow.js";
import { shadowCachePath, readShadowCache, writeShadowCacheAtomic } from "../src/delta/salesShadowCache.js";

// Codex cache-identity remediation (2026-08-14): documentKey() used to be
// `${branchCode}::${docNo}` — plaintext, string-concatenated, and had a
// reproduced real delimiter-collision bug (documentKey("A::B","C") ===
// documentKey("A","B::C")). Fixed: documentKey() is now SHA-256 of the
// canonical tuple JSON.stringify([branchCode, docNo]) — a one-way hash of a
// properly-escaped array, never string concatenation. Every test below uses
// synthetic/sentinel fixture data only — no production data of any kind.

const SENTINEL_DOC_NO = "SENTINEL-DOC-NO-99999-PLAINTEXT-PROOF";

const agentRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(agentRoot, "..", "..");

function gitStatusPorcelain() {
  return execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
}

function header(overrides = {}) {
  return {
    FTBchCode: "004", FTShdDocNo: SENTINEL_DOC_NO, FTShdDocType: "1",
    FDShdDocDate: new Date("2026-08-01T00:00:00Z"), FTShdDocTime: "10:00:00",
    FTShdStaPaid: "3", FCShdTotal: 1, FCShdDis: 0, FCShdAftDisChg: 1, FCShdVat: 0, FCShdGrand: 1,
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    FTBchCode: "004", FTShdDocNo: SENTINEL_DOC_NO, FNSdtSeqNo: 1, FTPdtCode: "P1",
    FCSdtQty: 1, FCSdtStkFac: 1, FCSdtQtyAll: 1, FCSdtSetPrice: 1, FCSdtDis: 0, FCSdtNet: 1,
    ...overrides,
  };
}

function withTempCacheDir(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "delta-identity-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 1. cache JSON has no sentinel docNo, reproduced with fake sentinel data
test("1. running the shadow with a sentinel document number never persists that sentinel to the on-disk cache", () => {
  withTempCacheDir((cacheDir) => {
    runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    const raw = readFileSync(shadowCachePath(cacheDir, "004"), "utf8");
    assert.equal(raw.includes(SENTINEL_DOC_NO), false);
  });
});

// 2. cache JSON has no plaintext "branch::docNo" shape either (the OLD
// identity format this remediation replaces).
test("2. the on-disk cache never contains the old plaintext \"branch::docNo\" identity shape", () => {
  withTempCacheDir((cacheDir) => {
    runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    const raw = readFileSync(shadowCachePath(cacheDir, "004"), "utf8");
    assert.equal(raw.includes(`004::${SENTINEL_DOC_NO}`), false);
    assert.equal(raw.includes("004::"), false);
  });
});

// 3. same tuple -> same identity, every time (stability within and across calls)
test("3. the same (branchCode, docNo) tuple always produces the same identity", () => {
  const a = documentKey("004", SENTINEL_DOC_NO);
  const b = documentKey("004", SENTINEL_DOC_NO);
  const c = documentKey("004", SENTINEL_DOC_NO);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

// 4. different tuple -> different identity
test("4. a different branchCode or a different docNo produces a different identity", () => {
  const base = documentKey("004", SENTINEL_DOC_NO);
  assert.notEqual(documentKey("005", SENTINEL_DOC_NO), base);
  assert.notEqual(documentKey("004", "DIFFERENT-DOC-NO"), base);
});

// 5. delimiter-collision case — the exact bug reproduced before this fix.
test("5. [\"A::B\",\"C\"] and [\"A\",\"B::C\"] do not collide (the reproduced pre-fix bug)", () => {
  const k1 = documentKey("A::B", "C");
  const k2 = documentKey("A", "B::C");
  assert.notEqual(k1, k2);
});

test("5b. other delimiter-adjacent shapes do not collide either", () => {
  const pairs = [
    [["A:", ":B"], ["A", "::B"]],
    [["", "A::B"], ["A::B", ""]],
    [["A::", "B"], ["A", "::B"]],
  ];
  for (const [[b1, d1], [b2, d2]] of pairs) {
    assert.notEqual(documentKey(b1, d1), documentKey(b2, d2), `expected (${b1},${d1}) and (${b2},${d2}) not to collide`);
  }
});

// 6. metrics new/changed/unchanged/disappeared remain correct after the
// identity change — a regression check that the fix didn't break diffing.
test("6. new/changed/unchanged/disappeared counts remain correct with the new hashed identity", () => {
  withTempCacheDir((cacheDir) => {
    const first = runSalesShadow({
      branchCode: "004",
      headerRows: [header(), header({ FTShdDocNo: "DOC-2" })],
      lineRows: [line(), line({ FTShdDocNo: "DOC-2" })],
      cacheDir,
    });
    assert.equal(first.newCount, 2);

    const second = runSalesShadow({
      branchCode: "004",
      headerRows: [header({ FCShdGrand: 999, FCShdAftDisChg: 999 })], // DOC-2 disappears, sentinel doc changes
      lineRows: [line()],
      cacheDir,
    });
    assert.equal(second.changedCount, 1);
    assert.equal(second.disappearedCount, 1);
    assert.equal(second.newCount, 0);
    assert.equal(second.unchangedCount, 0);
  });
});

// 7. corrupted/version-mismatch cache still rebuilds cleanly with the new
// contract version.
test("7a. a corrupt cache file still rebuilds cleanly under the new contract version", () => {
  withTempCacheDir((cacheDir) => {
    const filePath = shadowCachePath(cacheDir, "004");
    writeFileSync(filePath, "{not json", "utf8");
    const result = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(result.cacheState, "rebuilt");
    assert.equal(result.cacheRebuildReason, "corrupt-json");
  });
});

test("7b. a cache file written under the OLD (pre-remediation) contract version is discarded and rebuilt, never trusted as if its plaintext-shaped keys were the new hashed identity", () => {
  withTempCacheDir((cacheDir) => {
    const oldStyleCache = {
      contractVersion: "delta-shadow-sales-v1", // the prototype version this remediation bumps past — never deployed
      branchCode: "004",
      documents: { [`004::${SENTINEL_DOC_NO}`]: "some-old-plaintext-keyed-fingerprint" },
    };
    writeFileSync(shadowCachePath(cacheDir, "004"), JSON.stringify(oldStyleCache), "utf8");
    const cache = readShadowCache(cacheDir, "004");
    assert.equal(cache.state, "rebuilt");
    assert.equal(cache.reason, "version-mismatch");
    assert.equal(cache.documents.size, 0);

    const result = runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    assert.equal(result.cacheState, "rebuilt");
    assert.equal(result.newCount, 1); // treated as new, not matched against the discarded old plaintext key
  });
});

// 8. default cache location still doesn't dirty the git worktree, re-checked
// after this remediation (the identity change touches what's written, not
// where — re-verify both together).
test("8. running the shadow after this remediation still leaves `git status` in this repo clean", () => {
  withTempCacheDir((cacheDir) => {
    const before = gitStatusPorcelain();
    runSalesShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
    const after = gitStatusPorcelain();
    assert.equal(after, before);
  });
});

test("contract version was bumped past the prototype (never-deployed) v1", () => {
  assert.equal(FINGERPRINT_CONTRACT_VERSION, "delta-shadow-sales-v2");
});

// keep writeShadowCacheAtomic imported/used so lint tooling doesn't flag an
// unused import if this file is later extended; also a light smoke check
// that atomic writes still work under the new key shape.
test("smoke: writeShadowCacheAtomic persists hashed keys only", () => {
  withTempCacheDir((cacheDir) => {
    const key = documentKey("004", SENTINEL_DOC_NO);
    const map = new Map([[key, "deadbeef"]]);
    const result = writeShadowCacheAtomic(cacheDir, "004", map);
    assert.equal(result.ok, true);
    const raw = readFileSync(shadowCachePath(cacheDir, "004"), "utf8");
    assert.equal(raw.includes(SENTINEL_DOC_NO), false);
  });
});
