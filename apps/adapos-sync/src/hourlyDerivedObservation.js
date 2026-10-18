// Intraday-only supplemental evidence. Never substitutes the canonical pair.
import { createHash } from "node:crypto";
import { buildHourlyEvidencePayload, HOURLY_EVIDENCE_MAX_BODY_BYTES } from "./hourlyStockEvidenceClient.js";

export const DERIVED_VERSION = "adapos-ordinary16-derived-v1";
export const DERIVED_BASIS = "retail-plus-wholesale-plus-ordinary16";
const REASONS = new Set(["observed-unverified", "changed-between-reads", "invalid-source-component", "non-master-stock-code", "outside-branch-movement"]);
function invalid() { throw new Error("Invalid intraday derived observation."); }
export function parseDerivedObservation(value, records, capturedAt) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const keys = ["schemaVersion", "estimateBasis", "sampleCount", "consistency", "qualifying", "businessCutoffAt", "readStartedAt", "readCompletedAt", "records"];
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
  if (value.schemaVersion !== DERIVED_VERSION || value.estimateBasis !== DERIVED_BASIS || value.sampleCount !== 2
      || value.consistency !== "unverified" || value.qualifying !== false || value.businessCutoffAt !== null) invalid();
  for (const key of ["readStartedAt", "readCompletedAt"]) {
    if (typeof value[key] !== "string" || value[key].length > 40 || !Number.isFinite(Date.parse(value[key]))
        || new Date(value[key]).toISOString() !== value[key]) invalid();
  }
  const duration = Date.parse(value.readCompletedAt) - Date.parse(value.readStartedAt);
  if (duration < 0 || duration > 10_000 || !Number.isFinite(Date.parse(capturedAt))) invalid();
  const expected = new Set(records.map(row => row.productCode));
  if (!Array.isArray(value.records) || !expected.size || expected.size > 500 || value.records.length !== expected.size) invalid();
  const seen = new Set();
  const parsedRows = value.records.map(row => {
    if (!row || typeof row !== "object" || Object.keys(row).length !== 3
        || !Object.hasOwn(row, "productCode") || !Object.hasOwn(row, "derivedOnHand") || !Object.hasOwn(row, "reason")) invalid();
    if (!expected.has(row.productCode) || seen.has(row.productCode) || !REASONS.has(row.reason)) invalid();
    seen.add(row.productCode);
    if (row.reason === "observed-unverified") {
      if (typeof row.derivedOnHand !== "number" || !Number.isFinite(row.derivedOnHand) || Math.abs(row.derivedOnHand) > 1e12) invalid();
    } else if (row.derivedOnHand !== null) invalid();
    return { productCode: row.productCode, derivedOnHand: row.derivedOnHand, reason: row.reason };
  }).sort((a, b) => a.productCode.localeCompare(b.productCode));
  return { ...value, records: parsedRows };
}

export function derivedObservationDiagnostics(value, records, capturedAt) {
  const base = { estimateBasis: DERIVED_BASIS, consistency: "unverified", qualifying: false, businessCutoffAt: null };
  if (value == null) return { ...base, status: "missing", reason: "derived-observation-missing" };
  let parsed;
  try { parsed = parseDerivedObservation(value, records, capturedAt); }
  catch { return { ...base, status: "invalid", reason: "invalid-derived-observation" }; }
  const available = parsed.records.filter(row => row.reason === "observed-unverified");
  const changed = parsed.records.filter(row => row.reason === "changed-between-reads").length;
  const originals = new Map(records.map(row => [row.productCode, row.latestEstimatedOnHand]));
  const compared = available.filter(row => originals.get(row.productCode) != null);
  const equal = compared.filter(row => Math.abs(row.derivedOnHand - originals.get(row.productCode)) <= 1e-6).length;
  const clockAfterCapture = parsed.readCompletedAt > new Date(capturedAt).toISOString();
  return { ...base, status: clockAfterCapture ? "invalid" : changed ? "changed" : available.length === parsed.records.length ? "unverified" : "unavailable",
    reason: clockAfterCapture ? "source-clock-after-capture" : "nolock-views-do-not-prove-consistent-snapshot", sampleCount: 2,
    sourceClockAfterCapture: clockAfterCapture,
    readStartedAt: parsed.readStartedAt, readCompletedAt: parsed.readCompletedAt,
    observedProducts: parsed.records.length, availableProducts: available.length, changedProducts: changed,
    unavailableProducts: parsed.records.length - available.length,
    comparisonToStoredEstimate: { basis: "derived-versus-stored-estimate", comparedProducts: compared.length,
      equalCount: equal, gapCount: compared.length - equal, missingStoredEstimateProducts: available.length - compared.length } };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function buildHourlyIntradayPayload(options, derivedObservation) {
  const built = buildHourlyEvidencePayload(options);
  if (derivedObservation == null) return built;
  if (options.branchCode !== "004" || options.observationKind !== "intraday") invalid();
  const derived = parseDerivedObservation(derivedObservation, built.payload.records, options.capturedAt);
  const { idempotencyKey: _key, clientMeta, ...identity } = built.payload;
  const payload = { ...identity, derivedObservation: derived,
    idempotencyKey: createHash("sha256").update(canonical({ ...identity, derivedObservation: derived }), "utf8").digest("hex"), clientMeta };
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body, "utf8") > HOURLY_EVIDENCE_MAX_BODY_BYTES) throw new Error("Hourly evidence payload exceeds 256 KiB.");
  return { payload, body };
}
