import fs from "node:fs";
import path from "node:path";
import { HOURLY_COMPLETE_COHORT_MAX_RECORDS, HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS } from "./hourlyCohortCoverage.js";

function invalid() { throw Object.assign(new Error("Hourly cohort manifest is unavailable or invalid."), { code: "HOURLY_COHORT_MANIFEST_INVALID" }); }
export function resolveHourlyCohortConfig(evidence) {
  if (evidence?.enabled !== true || evidence.completeCohortEnabled !== true) return evidence;
  if (!evidence.cohortFile || !path.isAbsolute(evidence.cohortFile)) invalid();
  let stat;
  try { stat = fs.lstatSync(evidence.cohortFile); } catch { invalid(); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) invalid();
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(evidence.cohortFile, "utf8")); } catch { invalid(); }
  const codes = validateHourlyCohortManifest(manifest);
  return { ...evidence, cohortScope: manifest.scope, productCodes: [...codes] };
}

export function validateHourlyCohortManifest(manifest) {
  const posActive = manifest?.schemaVersion === "hourly-approved-pos-active-cohort-v1";
  if (!manifest || Object.keys(manifest).length !== (posActive ? 4 : 3)
      || (!posActive && manifest.schemaVersion !== "hourly-approved-cohort-v1")
      || !["explicit", "web-all"].includes(manifest.scope) || !Array.isArray(manifest.productCodes)) invalid();
  const codes = manifest.productCodes;
  if (!codes.length || codes.length > HOURLY_COMPLETE_COHORT_MAX_RECORDS || new Set(codes).size !== codes.length
      || codes.some(value => typeof value !== "string" || !value || value.length > 80 || value.trim() !== value)) invalid();
  if (posActive) {
    const selection = manifest.sourceSelection;
    const keys = ["schemaVersion", "branchCode", "basis", "webProductCount", "excludedNotActiveProductCodes", "excludedMissingProductCodes", "readStartedAt", "readCompletedAt", "consistency"];
    if (manifest.scope !== "explicit" || !selection || Object.keys(selection).length !== keys.length || keys.some(key => !Object.hasOwn(selection, key))
        || selection.schemaVersion !== "hourly-pos-active-selection-v1" || selection.branchCode !== "004"
        || selection.basis !== "web-intersection-active-equals-1" || selection.consistency !== "unverified"
        || !Array.isArray(selection.excludedNotActiveProductCodes) || !Array.isArray(selection.excludedMissingProductCodes)) invalid();
    const all = [...codes, ...selection.excludedNotActiveProductCodes, ...selection.excludedMissingProductCodes];
    if (!Number.isSafeInteger(selection.webProductCount) || selection.webProductCount < codes.length
        || selection.webProductCount > HOURLY_COMPLETE_COHORT_MAX_RECORDS || all.length !== selection.webProductCount
        || new Set(all).size !== all.length || all.some(value => typeof value !== "string" || !value || value.length > 80 || value.trim() !== value)) invalid();
    for (const key of ["readStartedAt", "readCompletedAt"]) {
      if (typeof selection[key] !== "string" || !Number.isFinite(Date.parse(selection[key])) || new Date(selection[key]).toISOString() !== selection[key]) invalid();
    }
    if (Date.parse(selection.readCompletedAt) < Date.parse(selection.readStartedAt)
        || Date.parse(selection.readCompletedAt) - Date.parse(selection.readStartedAt) > HOURLY_COMPLETE_COHORT_MAX_WINDOW_MS) invalid();
  }
  return codes;
}

export function buildPosActiveHourlyCohortManifest(webProductCodes, selection) {
  if (!Array.isArray(webProductCodes) || !selection) invalid();
  const manifest = { schemaVersion: "hourly-approved-pos-active-cohort-v1", scope: "explicit", productCodes: selection.productCodes,
    sourceSelection: { schemaVersion: "hourly-pos-active-selection-v1", branchCode: "004", basis: "web-intersection-active-equals-1",
      webProductCount: webProductCodes.length, excludedNotActiveProductCodes: selection.excludedNotActiveProductCodes,
      excludedMissingProductCodes: selection.excludedMissingProductCodes, readStartedAt: selection.readStartedAt,
      readCompletedAt: selection.readCompletedAt, consistency: selection.consistency } };
  validateHourlyCohortManifest(manifest);
  const all = [...manifest.productCodes, ...manifest.sourceSelection.excludedNotActiveProductCodes, ...manifest.sourceSelection.excludedMissingProductCodes];
  const expected = new Set(webProductCodes);
  if (expected.size !== webProductCodes.length || all.some(code => !expected.has(code))) invalid();
  return manifest;
}
