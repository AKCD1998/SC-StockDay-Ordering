import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runSalesShadow } from "../src/delta/salesShadow.js";

// 25. cache default must resolve OUTSIDE the git checkout — a cache file
// written inside it would show up as untracked/dirty and can make a
// self-update mechanism refuse to update (dirty_worktree), a real defect
// found and fixed in the frozen candidate. 26/27/28/29 below prove the same
// via an isolated PROGRAMDATA and safe, narrowly-targeted cleanup — a second
// real defect (unsafe `rmSync(cacheDir,{recursive:true})` cleanup risking a
// shared directory) was ALSO found and fixed in the frozen candidate; both
// lessons are re-applied here from scratch, then re-proven by non-vacuous
// revert-checks (see the Candidate Report).

const agentRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(agentRoot, "..", "..");

function gitStatusPorcelain() {
  return execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
}

// config.js computes its default cacheDir from process.env.PROGRAMDATA at
// MODULE-EVALUATION time. A static top-level `import` always runs before any
// other code in the file regardless of textual position, so a plain "set env
// var above the import" does not work — use a cache-busting dynamic import
// (a distinct module specifier per call) to force a fresh evaluation with
// whatever PROGRAMDATA is in effect for that call only.
async function loadSyncConfigWithProgramData(programDataDir) {
  const prev = process.env.PROGRAMDATA;
  process.env.PROGRAMDATA = programDataDir;
  try {
    const mod = await import(`../src/config.js?delta-shadow-cache-test=${Date.now()}-${Math.random()}`);
    return mod.syncConfig;
  } finally {
    if (prev === undefined) delete process.env.PROGRAMDATA;
    else process.env.PROGRAMDATA = prev;
  }
}

// 25 + 27. default cacheDir resolves under an isolated PROGRAMDATA, outside the repo
test("25/27. the default deltaShadowSales.cacheDir resolves under an isolated PROGRAMDATA, outside this repository", async () => {
  const isolatedProgramData = mkdtempSync(path.join(os.tmpdir(), "delta-shadow-programdata-test-"));
  try {
    const syncConfig = await loadSyncConfigWithProgramData(isolatedProgramData);
    const cacheDir = path.resolve(syncConfig.deltaShadowSales.cacheDir);

    assert.ok(
      cacheDir.startsWith(path.resolve(isolatedProgramData)),
      `expected cacheDir to resolve under the isolated PROGRAMDATA, got ${cacheDir}`,
    );

    const relative = path.relative(repoRoot, cacheDir);
    assert.ok(
      relative.startsWith("..") || path.isAbsolute(relative),
      `expected default cacheDir to resolve outside the repo, got ${cacheDir} (repo root ${repoRoot})`,
    );
  } finally {
    // Created solely for this test (mkdtempSync under os.tmpdir()) — never
    // the real shared default — full recursive removal here is safe.
    rmSync(isolatedProgramData, { recursive: true, force: true });
  }
});

// 26 + 28 + 29. shadow run leaves git status clean; cleanup targets only the
// file this test itself wrote; a pre-existing sibling file survives BOTH
// before and after this test's own cleanup, byte-identical.
test("26/28/29. running the shadow with an isolated default-shaped cacheDir leaves `git status` clean, never deletes a sibling file, and cleanup targets only the one file it wrote", async () => {
  const isolatedProgramData = mkdtempSync(path.join(os.tmpdir(), "delta-shadow-programdata-test-"));
  let ownCacheFile;
  try {
    const syncConfig = await loadSyncConfigWithProgramData(isolatedProgramData);
    const cacheDir = syncConfig.deltaShadowSales.cacheDir;

    // A pre-existing file standing in for another branch's real shadow
    // cache already present in this (isolated) directory.
    mkdirSync(cacheDir, { recursive: true });
    const siblingFile = path.join(cacheDir, "sales-shadow-999-unrelated-branch.json");
    const siblingContent = JSON.stringify({ marker: "pre-existing-unrelated-branch-cache" });
    writeFileSync(siblingFile, siblingContent, "utf8");

    const before = gitStatusPorcelain();

    try {
      runSalesShadow({
        branchCode: "999-cache-location-test",
        headerRows: [{
          FTBchCode: "999-cache-location-test", FTShdDocNo: "DOC-1", FTShdDocType: "1",
          FDShdDocDate: new Date("2026-08-01T00:00:00Z"), FTShdDocTime: "10:00:00",
          FTShdStaPaid: "3", FCShdTotal: 1, FCShdDis: 0, FCShdAftDisChg: 1, FCShdVat: 0, FCShdGrand: 1,
        }],
        lineRows: [{
          FTBchCode: "999-cache-location-test", FTShdDocNo: "DOC-1", FNSdtSeqNo: 1, FTPdtCode: "P1",
          FCSdtQty: 1, FCSdtStkFac: 1, FCSdtQtyAll: 1, FCSdtSetPrice: 1, FCSdtDis: 0, FCSdtNet: 1,
        }],
        cacheDir,
      });

      ownCacheFile = path.join(cacheDir, "sales-shadow-999-cache-location-test.json");
      assert.ok(existsSync(ownCacheFile), "expected the shadow run to write its own named cache file");

      const after = gitStatusPorcelain();
      assert.equal(after, before, "running the shadow must not change `git status` in this repo");

      assert.equal(existsSync(siblingFile), true, "a pre-existing sibling cache file must still exist");
      assert.equal(readFileSync(siblingFile, "utf8"), siblingContent, "a pre-existing sibling cache file must be unmodified");
    } finally {
      // Cleanup targets ONLY the exact file this test itself created —
      // never `rmSync(cacheDir, { recursive: true })`.
      if (ownCacheFile && existsSync(ownCacheFile)) rmSync(ownCacheFile, { force: true });
    }

    // Re-check AFTER cleanup — this is what actually proves the cleanup
    // step itself is safe, not just that the run didn't touch the sibling.
    assert.equal(existsSync(siblingFile), true, "the sibling cache file must still exist after this test's own cleanup");
    assert.equal(readFileSync(siblingFile, "utf8"), siblingContent, "the sibling cache file must be byte-identical after this test's own cleanup");
    assert.equal(ownCacheFile && existsSync(ownCacheFile), false, "this test's own cache file should have been removed by its cleanup");
  } finally {
    rmSync(isolatedProgramData, { recursive: true, force: true });
  }
});
