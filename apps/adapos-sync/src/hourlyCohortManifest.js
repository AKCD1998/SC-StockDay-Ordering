import fs from "node:fs";
import path from "node:path";
import { HOURLY_COMPLETE_COHORT_MAX_RECORDS } from "./hourlyCohortCoverage.js";

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
  return { ...evidence, cohortScope: manifest.scope, productCodes: [...codes].sort() };
}

export function validateHourlyCohortManifest(manifest) {
  if (!manifest || Object.keys(manifest).length !== 3 || manifest.schemaVersion !== "hourly-approved-cohort-v1"
      || !["explicit", "web-all"].includes(manifest.scope) || !Array.isArray(manifest.productCodes)) invalid();
  const codes = manifest.productCodes;
  if (!codes.length || codes.length > HOURLY_COMPLETE_COHORT_MAX_RECORDS || new Set(codes).size !== codes.length
      || codes.some(value => typeof value !== "string" || !value || value.length > 80 || value.trim() !== value)) invalid();
  return codes;
}
